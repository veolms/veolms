import type { Readable } from "node:stream";

import {
  CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
  CERTIFICATE_IMAGE_KINDS,
  CERTIFICATE_IMAGE_RULES,
  type CertificateAcademySettings,
  type CertificateImageKind,
  type CertificateSignatureCompleteRequest,
  type CertificateSignaturePresignRequest,
  type UpdateCertificateAcademySettingsRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import * as repository from "./certificate-settings.repository.ts";
import {
  inspectCertificateImage,
  type CertificateUploads,
} from "./render/certificate-pdf.ts";

function imageKey(
  kind: CertificateImageKind,
  id: string,
  contentType: "image/png" | "image/jpeg",
) {
  return `protected/certificate-${kind}s/${id}.${contentType === "image/png" ? "png" : "jpg"}`;
}

async function readAll(
  body: Readable,
  maxBytes: number,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      body.destroy();
      return null;
    }
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

function megabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Each image's bytes by storage key (a new upload is a new key). */
const imageCache = new Map<
  CertificateImageKind,
  { key: string; bytes: Buffer }
>();

/**
 * The academy's certificate settings (Platform > Certificates): the share
 * of lessons courses ask for by default, whether certificates are issued
 * and emailed automatically, and the images printed on them (signature,
 * badge, background).
 */
export function createCertificateSettingsService({
  database,
  storage,
  logger,
}: {
  database: Kysely<Database>;
  storage: S3StorageService;
  logger?: FastifyBaseLogger;
}) {
  async function get(): Promise<CertificateAcademySettings> {
    const row = await repository.findAcademySettings(database);
    const image = (kind: CertificateImageKind) => {
      const saved = repository.imageOf(row, kind);
      return saved && row
        ? {
            contentType: saved.contentType,
            updatedAt: row.updated_at.toISOString(),
          }
        : null;
    };
    return {
      thresholdPercent:
        row?.threshold_percent ?? CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
      autoIssue: row?.auto_issue ?? true,
      signature: image("signature"),
      badge: image("badge"),
      background: image("background"),
    };
  }

  async function update(
    userId: string,
    input: UpdateCertificateAcademySettingsRequest,
  ): Promise<CertificateAcademySettings> {
    await repository.saveAcademySettings(database, {
      thresholdPercent: input.thresholdPercent,
      autoIssue: input.autoIssue,
      updatedBy: userId,
    });
    return get();
  }

  async function presignImage(
    kind: CertificateImageKind,
    input: CertificateSignaturePresignRequest,
  ) {
    const rules = CERTIFICATE_IMAGE_RULES[kind];
    if (input.fileSize > rules.maxBytes) {
      throw new AppError(
        400,
        "CERTIFICATE_IMAGE_TOO_LARGE",
        `The ${rules.label} must be ${megabytes(rules.maxBytes)} or smaller.`,
      );
    }
    const uploadId = crypto.randomUUID();
    const uploadUrl = await storage.getPresignedPutUrl(
      imageKey(kind, uploadId, input.contentType),
      input.contentType,
      input.fileSize,
      600,
      { bindContentType: true },
    );
    return { uploadId, uploadUrl };
  }

  /**
   * Checks the uploaded image (a PNG or JPEG of the kind's least width that
   * a certificate can be drawn with) and makes it the academy's. A file
   * that fails is deleted; the image it replaces is kept in storage.
   */
  async function completeImage(
    userId: string,
    kind: CertificateImageKind,
    input: CertificateSignatureCompleteRequest,
  ): Promise<CertificateAcademySettings> {
    const rules = CERTIFICATE_IMAGE_RULES[kind];
    const key = imageKey(kind, input.uploadId, input.contentType);
    const reject = async (message: string): Promise<never> => {
      await storage.deleteObject(key).catch(() => undefined);
      throw new AppError(400, "INVALID_CERTIFICATE_IMAGE", message);
    };
    const object = await storage.getObject(key);
    if (!object) {
      throw new AppError(
        400,
        "INVALID_CERTIFICATE_IMAGE",
        `The ${rules.label} was not uploaded. Try again.`,
      );
    }
    const bytes = await readAll(object.body, rules.maxBytes);
    if (!bytes) {
      return await reject(
        `The ${rules.label} must be ${megabytes(rules.maxBytes)} or smaller.`,
      );
    }
    const inspected = await inspectCertificateImage(
      new Uint8Array(bytes),
      kind,
    );
    if (!inspected.ok) return await reject(inspected.reason);
    await repository.saveAcademySettings(database, {
      image: { kind, value: { key, contentType: input.contentType } },
      updatedBy: userId,
    });
    imageCache.set(kind, { key, bytes });
    return get();
  }

  /** Certificates go back to the design's own image of that kind. */
  async function removeImage(
    userId: string,
    kind: CertificateImageKind,
  ): Promise<CertificateAcademySettings> {
    await repository.saveAcademySettings(database, {
      image: { kind, value: null },
      updatedBy: userId,
    });
    imageCache.delete(kind);
    return get();
  }

  async function bytesOf(
    kind: CertificateImageKind,
    key: string,
  ): Promise<Buffer | null> {
    const cached = imageCache.get(kind);
    if (cached?.key === key) return cached.bytes;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const object = await storage.getObject(key);
        const bytes = object
          ? await readAll(object.body, CERTIFICATE_IMAGE_RULES[kind].maxBytes)
          : null;
        if (bytes) {
          imageCache.set(kind, { key, bytes });
          return bytes;
        }
        break;
      } catch (error) {
        if (attempt === 1) {
          logger?.error({ err: error, kind }, "certificate image unreadable");
        }
      }
    }
    return null;
  }

  /**
   * An uploaded image's bytes; null when there is none. One retry; an
   * image storage cannot give back is left off (logged) rather than
   * failing the learner's download.
   */
  async function imageBytes(
    kind: CertificateImageKind,
  ): Promise<Buffer | null> {
    const saved = repository.imageOf(
      await repository.findAcademySettings(database),
      kind,
    );
    return saved ? await bytesOf(kind, saved.key) : null;
  }

  /**
   * Everything uploaded, for drawing certificates, and a version that
   * changes whenever an upload does (downloads are cached by it).
   */
  async function uploads(): Promise<{
    images: CertificateUploads;
    version: string;
  }> {
    const row = await repository.findAcademySettings(database);
    const entries = await Promise.all(
      CERTIFICATE_IMAGE_KINDS.map(async (kind) => {
        const saved = repository.imageOf(row, kind);
        return [kind, saved ? await bytesOf(kind, saved.key) : null] as const;
      }),
    );
    return {
      images: Object.fromEntries(entries) as CertificateUploads,
      version: row ? String(row.updated_at.getTime()) : "0",
    };
  }

  return {
    get,
    update,
    presignImage,
    completeImage,
    removeImage,
    imageBytes,
    uploads,
  };
}

export type CertificateSettingsService = ReturnType<
  typeof createCertificateSettingsService
>;
