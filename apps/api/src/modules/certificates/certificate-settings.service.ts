import type { Readable } from "node:stream";

import {
  CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
  CERTIFICATE_SIGNATURE_MAX_BYTES,
  CERTIFICATE_SIGNATURE_MIN_WIDTH,
  type CertificateAcademySettings,
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
import { inspectSignature } from "./render/certificate-pdf.ts";

function signatureKey(id: string, contentType: "image/png" | "image/jpeg") {
  return `protected/certificate-signatures/${id}.${contentType === "image/png" ? "png" : "jpg"}`;
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

/** The signature's bytes by storage key (a new upload is a new key). */
let signatureCache: { key: string; bytes: Buffer } | null = null;

/**
 * The academy's certificate settings (Platform > Certificates): the share
 * of lessons courses ask for by default, whether certificates are issued
 * and emailed automatically, and the signature printed on them.
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
    return {
      thresholdPercent:
        row?.threshold_percent ?? CERTIFICATE_DEFAULT_THRESHOLD_PERCENT,
      autoIssue: row?.auto_issue ?? true,
      signature:
        row?.signature_key && row.signature_content_type
          ? {
              contentType: row.signature_content_type,
              updatedAt: row.updated_at.toISOString(),
            }
          : null,
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

  async function presignSignature(input: CertificateSignaturePresignRequest) {
    const uploadId = crypto.randomUUID();
    const uploadUrl = await storage.getPresignedPutUrl(
      signatureKey(uploadId, input.contentType),
      input.contentType,
      input.fileSize,
      600,
      { bindContentType: true },
    );
    return { uploadId, uploadUrl };
  }

  /**
   * Checks the uploaded signature (a PNG or JPEG at least 300 px wide that
   * can be drawn) and makes it the academy's. A file that fails is
   * deleted; the signature it replaces is kept in storage.
   */
  async function completeSignature(
    userId: string,
    input: CertificateSignatureCompleteRequest,
  ): Promise<CertificateAcademySettings> {
    const key = signatureKey(input.uploadId, input.contentType);
    const reject = async (message: string): Promise<never> => {
      await storage.deleteObject(key).catch(() => undefined);
      throw new AppError(400, "INVALID_CERTIFICATE_SIGNATURE", message);
    };
    const object = await storage.getObject(key);
    if (!object) {
      throw new AppError(
        400,
        "INVALID_CERTIFICATE_SIGNATURE",
        "The signature was not uploaded. Try again.",
      );
    }
    const bytes = await readAll(object.body, CERTIFICATE_SIGNATURE_MAX_BYTES);
    if (!bytes) return await reject("The signature must be 2 MB or smaller.");
    const inspected = await inspectSignature(
      new Uint8Array(bytes),
      CERTIFICATE_SIGNATURE_MIN_WIDTH,
    );
    if (!inspected.ok) return await reject(inspected.reason);
    await repository.saveAcademySettings(database, {
      signature: { key, contentType: input.contentType },
      updatedBy: userId,
    });
    signatureCache = { key, bytes };
    return get();
  }

  /** Certificates go back to the design's own signature (or none). */
  async function removeSignature(
    userId: string,
  ): Promise<CertificateAcademySettings> {
    await repository.saveAcademySettings(database, {
      signature: null,
      updatedBy: userId,
    });
    signatureCache = null;
    return get();
  }

  /**
   * The uploaded signature's bytes, for drawing certificates; null when
   * there is none. One retry; a signature storage cannot give back is left
   * off (logged) rather than failing the learner's download.
   */
  async function signatureBytes(): Promise<Buffer | null> {
    const row = await repository.findAcademySettings(database);
    const key = row?.signature_key;
    if (!key) return null;
    if (signatureCache?.key === key) return signatureCache.bytes;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const object = await storage.getObject(key);
        const bytes = object
          ? await readAll(object.body, CERTIFICATE_SIGNATURE_MAX_BYTES)
          : null;
        if (bytes) {
          signatureCache = { key, bytes };
          return bytes;
        }
        break;
      } catch (error) {
        if (attempt === 1) {
          logger?.error({ err: error }, "certificate signature unreadable");
        }
      }
    }
    return null;
  }

  return {
    get,
    update,
    presignSignature,
    completeSignature,
    removeSignature,
    signatureBytes,
  };
}

export type CertificateSettingsService = ReturnType<
  typeof createCertificateSettingsService
>;
