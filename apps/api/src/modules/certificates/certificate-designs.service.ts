import type { Readable } from "node:stream";

import {
  BUILTIN_CERTIFICATE_DESIGN_ID,
  CERTIFICATE_DESIGN_MAX_BYTES,
  DEFAULT_CERTIFICATE_LAYOUT,
  certificateDesignLayoutSchema,
  type CertificateDesign,
  type CertificateDesignContentType,
  type CertificateDesignLayout,
  type CertificateDesignPresignRequest,
  type CertificateDesignPresignResponse,
  type CreateCertificateDesignRequest,
  type UpdateCertificateDesignRequest,
} from "@veolms/contracts";
import type { Database, Json } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import * as repository from "./certificate-designs.repository.ts";
import {
  SAMPLE_CERTIFICATE,
  inspectCertificateDesign,
  type CertificateRenderDesign,
} from "./render/certificate-pdf.ts";
import type { CertificateRenderPool } from "./render/certificate-render-pool.ts";

const EXTENSIONS: Record<CertificateDesignContentType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** Where an uploaded sheet is kept: private, never a public address. */
function designKey(id: string, contentType: CertificateDesignContentType) {
  return `protected/certificate-designs/${id}.${EXTENSIONS[contentType]}`;
}

/** The file's first bytes match what it claims to be. */
function matchesType(bytes: Buffer, contentType: CertificateDesignContentType) {
  if (contentType === "application/pdf") {
    return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  }
  if (contentType === "image/png") {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
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

/**
 * Uploaded sheets kept in memory, by design id (a sheet's file never
 * changes once uploaded: a new file is a new design). A few at most; the
 * finalised one is the one asked for.
 */
const sheetCache = new Map<string, Buffer>();
const SHEET_CACHE_SIZE = 4;

function layoutOf(
  row: repository.CertificateDesignRow,
): CertificateDesignLayout {
  const parsed = certificateDesignLayoutSchema.safeParse(row.layout);
  return parsed.success ? parsed.data : DEFAULT_CERTIFICATE_LAYOUT;
}

const BUILTIN_PAGE = { width: 841.89, height: 595.28 };

/**
 * Certificate designs (Platform > Certificates): upload blank sheets, place
 * the details on each, and finalise one. Certificates are drawn on the
 * finalised design when they are downloaded; only the sheet is stored,
 * never a generated PDF.
 */
export function createCertificateDesignsService({
  database,
  storage,
  renderPool,
  logger,
  signatureBytes = async () => null,
}: {
  database: Kysely<Database>;
  storage: S3StorageService;
  renderPool?: CertificateRenderPool;
  logger?: FastifyBaseLogger;
  /** The academy's uploaded signature, for previews. */
  signatureBytes?: () => Promise<Buffer | null>;
}) {
  function present(row: repository.CertificateDesignRow): CertificateDesign {
    return {
      id: row.id,
      name: row.name,
      kind: "upload",
      contentType: row.content_type,
      fileSize: row.file_size,
      pageWidth: Number(row.page_width),
      pageHeight: Number(row.page_height),
      isActive: row.is_active,
      layout: layoutOf(row),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  function builtin(isActive: boolean): CertificateDesign {
    return {
      id: BUILTIN_CERTIFICATE_DESIGN_ID,
      name: "ProCodrr classic (built in)",
      kind: "builtin",
      contentType: null,
      fileSize: null,
      pageWidth: BUILTIN_PAGE.width,
      pageHeight: BUILTIN_PAGE.height,
      isActive,
      layout: DEFAULT_CERTIFICATE_LAYOUT,
      createdAt: null,
      updatedAt: null,
    };
  }

  async function list(): Promise<CertificateDesign[]> {
    const rows = await repository.listDesigns(database);
    const anyActive = rows.some((row) => row.is_active);
    return [builtin(!anyActive), ...rows.map(present)];
  }

  async function requireDesign(id: string) {
    const row = await repository.findDesign(database, id);
    if (!row) {
      throw new AppError(
        404,
        "CERTIFICATE_DESIGN_NOT_FOUND",
        "Design not found.",
      );
    }
    return row;
  }

  /** An address the browser uploads the sheet to, directly. */
  async function presign(
    input: CertificateDesignPresignRequest,
  ): Promise<CertificateDesignPresignResponse> {
    const uploadId = crypto.randomUUID();
    const uploadUrl = await storage.getPresignedPutUrl(
      designKey(uploadId, input.contentType),
      input.contentType,
      input.fileSize,
      600,
      { bindContentType: true },
    );
    return { uploadId, uploadUrl };
  }

  /** The sheet's bytes, from memory or storage (one retry). */
  async function readSheet(
    row: repository.CertificateDesignRow,
  ): Promise<Buffer> {
    const cached = sheetCache.get(row.id);
    if (cached) return cached;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const object = await storage.getObject(row.storage_key);
        const bytes = object
          ? await readAll(object.body, CERTIFICATE_DESIGN_MAX_BYTES)
          : null;
        if (bytes) {
          if (sheetCache.size >= SHEET_CACHE_SIZE) {
            sheetCache.delete(sheetCache.keys().next().value!);
          }
          sheetCache.set(row.id, bytes);
          return bytes;
        }
        lastError = new Error("The design's file is missing.");
        break;
      } catch (error) {
        lastError = error;
      }
    }
    logger?.error(
      { err: lastError, design: row.id },
      "certificate design file could not be read",
    );
    throw new AppError(
      503,
      "CERTIFICATE_DESIGN_UNAVAILABLE",
      "The certificate design could not be loaded. Try again in a minute.",
    );
  }

  async function renderDesignOf(
    row: repository.CertificateDesignRow,
    layout: CertificateDesignLayout = layoutOf(row),
  ): Promise<CertificateRenderDesign> {
    return {
      kind: "upload",
      contentType: row.content_type,
      bytes: new Uint8Array(await readSheet(row)),
      pageWidth: Number(row.page_width),
      pageHeight: Number(row.page_height),
      layout,
    };
  }

  /**
   * Checks the uploaded file (size, type by its own bytes, readable, can be
   * drawn on) and saves it as a design, not finalised. A file that fails is
   * deleted from storage.
   */
  async function create(
    userId: string,
    input: CreateCertificateDesignRequest,
  ): Promise<CertificateDesign> {
    const key = designKey(input.uploadId, input.contentType);
    const reject = async (message: string): Promise<never> => {
      await storage.deleteObject(key).catch(() => undefined);
      throw new AppError(400, "INVALID_CERTIFICATE_DESIGN", message);
    };
    const head = await storage.headObject(key);
    if (!head) {
      throw new AppError(
        400,
        "INVALID_CERTIFICATE_DESIGN",
        "The file was not uploaded. Try again.",
      );
    }
    if ((head.contentLength ?? 0) > CERTIFICATE_DESIGN_MAX_BYTES) {
      return await reject("The design must be 15 MB or smaller.");
    }
    const object = await storage.getObject(key);
    const bytes = object
      ? await readAll(object.body, CERTIFICATE_DESIGN_MAX_BYTES)
      : null;
    if (!bytes) return await reject("The design must be 15 MB or smaller.");
    if (!matchesType(bytes, input.contentType)) {
      return await reject("The file must be a PDF, PNG or JPEG.");
    }
    const inspected = await inspectCertificateDesign(
      new Uint8Array(bytes),
      input.contentType,
    );
    if (!inspected.ok) return await reject(inspected.reason);

    // A blank sheet starts with the built-in positions, without the
    // built-in's dotted line under the name.
    const layout: CertificateDesignLayout = {
      ...DEFAULT_CERTIFICATE_LAYOUT,
      name: { ...DEFAULT_CERTIFICATE_LAYOUT.name, underline: false },
    };
    await repository.insertDesign(database, {
      id: input.uploadId,
      name: input.name,
      storageKey: key,
      contentType: input.contentType,
      fileSize: bytes.length,
      pageWidth: inspected.pageWidth,
      pageHeight: inspected.pageHeight,
      layout: layout as unknown as Json,
      createdBy: userId,
    });
    sheetCache.set(input.uploadId, bytes);
    return present((await requireDesign(input.uploadId))!);
  }

  async function update(
    id: string,
    input: UpdateCertificateDesignRequest,
  ): Promise<CertificateDesign> {
    if (id === BUILTIN_CERTIFICATE_DESIGN_ID) {
      throw new AppError(
        409,
        "CERTIFICATE_DESIGN_BUILTIN",
        "The built-in design cannot be changed.",
      );
    }
    await requireDesign(id);
    await repository.updateDesign(database, id, {
      name: input.name,
      layout: input.layout as unknown as Json | undefined,
    });
    return present(await requireDesign(id));
  }

  /**
   * Finalises a design: every certificate is drawn on it from now on. The
   * built-in id finalises the built-in design. Takes turns with other
   * finalisations, so exactly one is ever active.
   */
  async function activate(id: string): Promise<CertificateDesign[]> {
    if (id !== BUILTIN_CERTIFICATE_DESIGN_ID) {
      const row = await requireDesign(id);
      // Its file is read now: a sheet storage cannot give back is never
      // finalised.
      await readSheet(row);
    }
    await database.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext('veolms:certificate-designs'))`.execute(
        trx,
      );
      await repository.deactivateAll(trx);
      if (id !== BUILTIN_CERTIFICATE_DESIGN_ID) {
        const done = await repository.activateDesign(trx, id);
        if (!done) {
          throw new AppError(
            404,
            "CERTIFICATE_DESIGN_NOT_FOUND",
            "Design not found.",
          );
        }
      }
    });
    return list();
  }

  /** Removes a design that is not finalised, and its file. */
  async function remove(id: string): Promise<void> {
    if (id === BUILTIN_CERTIFICATE_DESIGN_ID) {
      throw new AppError(
        409,
        "CERTIFICATE_DESIGN_BUILTIN",
        "The built-in design cannot be deleted.",
      );
    }
    const row = await requireDesign(id);
    if (row.is_active) {
      throw new AppError(
        409,
        "CERTIFICATE_DESIGN_ACTIVE",
        "This design is finalised. Finalise another one first.",
      );
    }
    await repository.softDeleteDesign(database, id);
    sheetCache.delete(id);
    await storage.deleteObject(row.storage_key).catch((error: unknown) => {
      logger?.warn({ err: error, design: id }, "certificate design file kept");
    });
  }

  /** The uploaded sheet itself, for the editor to show. */
  async function file(id: string) {
    const row = await requireDesign(id);
    const bytes = await readSheet(row);
    return { bytes, contentType: row.content_type };
  }

  /**
   * A sample certificate (made-up learner) on a design, with an unsaved
   * layout if given: what the editor's "Preview PDF" shows.
   */
  async function preview(
    id: string,
    layout: CertificateDesignLayout | undefined,
  ): Promise<Buffer> {
    if (!renderPool) throw new Error("No render pool.");
    if (id === BUILTIN_CERTIFICATE_DESIGN_ID) {
      return renderPool.render(
        SAMPLE_CERTIFICATE,
        { kind: "builtin" },
        await signatureBytes(),
      );
    }
    const row = await requireDesign(id);
    return renderPool.render(
      SAMPLE_CERTIFICATE,
      await renderDesignOf(row, layout),
      await signatureBytes(),
    );
  }

  /**
   * What certificates are drawn on now: the finalised design (with a
   * version for caches), or the built-in one.
   */
  async function resolveActive(): Promise<{
    id: string | null;
    version: string;
    design: CertificateRenderDesign;
  }> {
    const row = await repository.findActiveDesign(database);
    if (!row) {
      return {
        id: null,
        version: BUILTIN_CERTIFICATE_DESIGN_ID,
        design: { kind: "builtin" },
      };
    }
    return {
      id: row.id,
      version: `${row.id}.${row.updated_at.getTime()}`,
      design: await renderDesignOf(row),
    };
  }

  /** The finalised design's id, without reading its file (issue records). */
  async function activeDesignId(): Promise<string | null> {
    return (await repository.findActiveDesign(database))?.id ?? null;
  }

  return {
    list,
    presign,
    create,
    update,
    activate,
    remove,
    file,
    preview,
    resolveActive,
    activeDesignId,
  };
}

export type CertificateDesignsService = ReturnType<
  typeof createCertificateDesignsService
>;
