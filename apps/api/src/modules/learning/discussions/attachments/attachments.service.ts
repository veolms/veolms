import crypto from "node:crypto";
import path from "node:path";
import type { DatabaseExecutor } from "@veolms/database";
import { attachmentDimensionsSchema } from "@veolms/contracts";
import type {
  AttachmentKind,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse,
  LearningAttachment,
  LearningUploadResponse,
  LinkPreviewResponse,
} from "@veolms/contracts";
import { AppError, httpError } from "../../../../lib/errors.ts";
import {
  discussionUploadPublicUrl,
  isSupportedDiscussionUploadMimeType,
  DISCUSSION_DEFAULT_EXTENSION_FOR_MIME,
  isAllowedExtensionForMimeType,
  discussionUploadStorageKey,
  type DiscussionUploadStore,
} from "../../../discussion-uploads/index.ts";
import { DISCUSSION_CONSTANTS } from "../shared/discussion.constants.ts";
import { getAttachmentDimensionFields } from "../shared/discussion-attachment-metadata.ts";
import {
  fetchSafeHtml,
  extractLinkMetadata,
} from "./attachments.preview.ts";
import type { AttachmentsRepository } from "./attachments.repository.ts";

const LINK_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const LINK_PREVIEW_CACHE_MAX_ENTRIES = 500;
const LINK_PREVIEW_FETCH_ATTEMPTS = 2;

interface CachedLinkPreview {
  expiresAt: number;
  value: LinkPreviewResponse;
}

const linkPreviewCache = new Map<string, CachedLinkPreview>();
const linkPreviewRequests = new Map<string, Promise<LinkPreviewResponse>>();

function getCachedLinkPreview(url: string): LinkPreviewResponse | null {
  const cached = linkPreviewCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.value;
  linkPreviewCache.delete(url);
  return null;
}

function cacheLinkPreview(url: string, value: LinkPreviewResponse): void {
  const now = Date.now();
  for (const [key, cached] of linkPreviewCache) {
    if (cached.expiresAt <= now) linkPreviewCache.delete(key);
  }
  if (linkPreviewCache.size >= LINK_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = linkPreviewCache.keys().next().value;
    if (oldestKey) linkPreviewCache.delete(oldestKey);
  }
  linkPreviewCache.set(url, {
    value,
    expiresAt: now + LINK_PREVIEW_CACHE_TTL_MS,
  });
}

function createLinkPreviewFallback(url: string): LinkPreviewResponse {
  const parsed = new URL(url);
  return {
    url,
    title: parsed.hostname,
    description: null,
    siteName: parsed.hostname,
    imageUrl: null,
  };
}

function isRetryableLinkPreviewError(error: unknown): boolean {
  return (
    !(error instanceof AppError) ||
    error.code === "TIMEOUT" ||
    error.code === "FETCH_FAILED" ||
    error.code === "DNS_LOOKUP_FAILED"
  );
}

export interface AttachmentsService {
  initiateUpload(
    db: DatabaseExecutor,
    userId: string,
    input: InitiateAttachmentUploadRequest,
  ): Promise<InitiateAttachmentUploadResponse>;

  uploadFile(
    db: DatabaseExecutor,
    attachmentId: string,
    userId: string,
    file: {
      filename: string;
      mimetype: string;
      data: Buffer;
      width?: number;
      height?: number;
    },
  ): Promise<LearningAttachment>;

  completeUpload(
    db: DatabaseExecutor,
    attachmentId: string,
    userId: string,
  ): Promise<LearningAttachment>;

  processUpload(
    db: DatabaseExecutor,
    userId: string,
    file: {
      filename: string;
      mimetype: string;
      data: Buffer;
      width?: number;
      height?: number;
    },
  ): Promise<LearningUploadResponse>;

  fetchLinkPreview(url: string): Promise<LinkPreviewResponse>;
}

export function createAttachmentsService(
  attachmentsRepo: AttachmentsRepository,
  uploadStore: DiscussionUploadStore,
): AttachmentsService {
  async function resolveLinkPreview(url: string): Promise<LinkPreviewResponse> {
    for (let attempt = 0; attempt < LINK_PREVIEW_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const { html, finalUrl } = await fetchSafeHtml(url);
        if (!html) return createLinkPreviewFallback(url);
        return extractLinkMetadata(html, finalUrl);
      } catch (error) {
        if (!isRetryableLinkPreviewError(error)) throw error;
        if (attempt === LINK_PREVIEW_FETCH_ATTEMPTS - 1) {
          return createLinkPreviewFallback(url);
        }
      }
    }

    return createLinkPreviewFallback(url);
  }

  function getAttachmentKind(
    mimetype: string,
    filename: string,
  ): AttachmentKind {
    if (mimetype.startsWith("image/")) {
      if (filename.toLowerCase().includes("screenshot")) return "screenshot";
      return "image";
    }
    const ext = path.extname(filename).toLowerCase();
    if (
      mimetype === "application/json" ||
      (
        DISCUSSION_CONSTANTS.SUPPORTED_CODE_EXTENSIONS as readonly string[]
      ).includes(ext)
    ) {
      return "code";
    }
    return "document";
  }

  function getMediaType(kind: AttachmentKind, mimetype: string) {
    if (mimetype.startsWith("video/")) return "video";
    if (kind === "image" || kind === "screenshot") return "image";
    if (kind === "code") return "code";
    return "document";
  }

  function resolveExtension(filename: string, mimetype: string): string {
    const rawExt = path.extname(filename).toLowerCase();
    if (rawExt && isAllowedExtensionForMimeType(rawExt, mimetype)) {
      return sanitizeExtension(rawExt);
    }
    const fallback = DISCUSSION_DEFAULT_EXTENSION_FOR_MIME[mimetype] || ".bin";
    return sanitizeExtension(fallback);
  }

  function sanitizeExtension(ext: string): string {
    const cleaned = ext.replace(/[^A-Za-z0-9.]/g, "").slice(0, 17);
    return cleaned.startsWith(".") ? cleaned : ".bin";
  }

  function validateDimensions(
    mimetype: string,
    dimensions: { width?: number | null; height?: number | null },
  ): { width: number; height: number } | undefined {
    const parsed = attachmentDimensionsSchema.safeParse(dimensions);
    if (!parsed.success) {
      throw httpError(
        400,
        "INVALID_ATTACHMENT_DIMENSIONS",
        "Attachment width and height must be positive integer dimensions.",
      );
    }

    if (parsed.data.width === undefined || parsed.data.width === null) {
      return undefined;
    }

    if (!mimetype.startsWith("image/") && !mimetype.startsWith("video/")) {
      throw httpError(
        400,
        "INVALID_ATTACHMENT_DIMENSIONS",
        "Dimensions are supported only for image and video attachments.",
      );
    }

    return { width: parsed.data.width, height: parsed.data.height! };
  }

  function mergeDimensions(
    metadata: Record<string, unknown> | null | undefined,
    dimensions: { width: number; height: number } | undefined,
  ): Record<string, unknown> {
    return { ...(metadata || {}), ...(dimensions || {}) };
  }

  return {
    async initiateUpload(db, userId, input) {
      if (!isSupportedDiscussionUploadMimeType(input.mimeType)) {
        throw httpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Choose a supported image, video, or document file.",
        );
      }

      if (input.fileSize > DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES) {
        throw httpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The selected file is too large.",
        );
      }

      const dimensions = validateDimensions(input.mimeType, input);

      const id = crypto.randomUUID();
      const ext = resolveExtension(input.fileName, input.mimeType);
      const storageKey = discussionUploadStorageKey(
        `${id}${ext}`,
      );
      const kind =
        input.kind || getAttachmentKind(input.mimeType, input.fileName);

      await attachmentsRepo.createAttachment(db, {
        id,
        ownerId: userId,
        kind,
        storageKey,
        fileName: input.fileName,
        fileUrl: "",
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        status: "uploading",
        metadata: {
          initiatedAt: new Date().toISOString(),
          ...dimensions,
        },
      });

      return {
        attachmentId: id,
        uploadUrl: `/attachments/${id}/upload`,
        storageKey,
        fileName: input.fileName,
        kind,
        maxSize: DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES,
      };
    },

    async uploadFile(db, attachmentId, userId, file) {
      if (!isSupportedDiscussionUploadMimeType(file.mimetype)) {
        throw httpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Choose a supported image, video, or document file.",
        );
      }

      if (file.data.length > DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES) {
        throw httpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The selected file is too large.",
        );
      }

      const existing = await attachmentsRepo.findAttachmentById(
        db,
        attachmentId,
      );
      if (!existing) {
        throw httpError(
          404,
          "ATTACHMENT_NOT_FOUND",
          "Attachment upload slot not found",
        );
      }

      if (existing.ownerId !== userId) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You are not the owner of this attachment upload slot",
        );
      }

      const dimensions = validateDimensions(file.mimetype, file);
      const existingDimensions = getAttachmentDimensionFields(existing.metadata);
      const persistedDimensions =
        dimensions ||
        (existingDimensions.width !== null && existingDimensions.height !== null
          ? {
              width: existingDimensions.width,
              height: existingDimensions.height,
            }
          : undefined);
      const ext = resolveExtension(file.filename, file.mimetype);
      const sanitizedName = `${attachmentId}${ext}`;
      await uploadStore.putFromBuffer({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        data: file.data,
      });
      const fileUrl = discussionUploadPublicUrl(sanitizedName);

      try {
        await db
          .updateTable("learning_attachments")
          .set({
            storage_key: discussionUploadStorageKey(sanitizedName),
            file_name: file.filename,
            file_url: fileUrl,
            mime_type: file.mimetype,
            file_size: file.data.length,
            status: "ready",
            metadata: JSON.stringify(
              mergeDimensions(
                {
                  ...(existing.metadata || {}),
                  uploadedAt: new Date().toISOString(),
                },
                persistedDimensions,
              ),
            ),
          })
          .where("id", "=", attachmentId)
          .execute();
      } catch (error) {
        await uploadStore.remove(sanitizedName);
        throw error;
      }

      const updated = await attachmentsRepo.findAttachmentById(
        db,
        attachmentId,
      );
      if (!updated) {
        throw httpError(
          500,
          "UPLOAD_FAILED",
          "Failed to finalize attachment upload",
        );
      }
      return updated;
    },

    async completeUpload(db, attachmentId, userId) {
      const existing = await attachmentsRepo.findAttachmentById(
        db,
        attachmentId,
      );
      if (!existing) {
        throw httpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
      }

      if (existing.ownerId !== userId) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You are not the owner of this attachment",
        );
      }

      if (existing.status === "rejected" || existing.status === "deleted") {
        throw httpError(
          400,
          "UPLOAD_NOT_COMPLETABLE",
          "This attachment can no longer be marked ready",
        );
      }

      if (!existing.fileUrl || existing.fileSize <= 0) {
        throw httpError(
          400,
          "UPLOAD_INCOMPLETE",
          "Upload has no file data yet",
        );
      }

      if (existing.status === "ready") {
        return existing;
      }

      await db
        .updateTable("learning_attachments")
        .set({
          status: "ready",
          metadata: JSON.stringify({
            ...(existing.metadata || {}),
            completedAt: new Date().toISOString(),
          }),
        })
        .where("id", "=", attachmentId)
        .execute();

      const completed = await attachmentsRepo.findAttachmentById(
        db,
        attachmentId,
      );
      if (!completed) {
        throw httpError(
          500,
          "UPLOAD_FAILED",
          "Failed to finalize attachment upload",
        );
      }
      return completed;
    },

    async processUpload(db, userId, file) {
      if (!isSupportedDiscussionUploadMimeType(file.mimetype)) {
        throw httpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Choose a supported image, video, or document file.",
        );
      }

      if (file.data.length > DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES) {
        throw httpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The selected file is too large.",
        );
      }

      const dimensions = validateDimensions(file.mimetype, file);

      const id = crypto.randomUUID();
      const ext = resolveExtension(file.filename, file.mimetype);
      const sanitizedName = `${id}${ext}`;
      const storageKey = discussionUploadStorageKey(sanitizedName);
      const kind = getAttachmentKind(file.mimetype, file.filename);
      const mediaType = getMediaType(kind, file.mimetype);

      await uploadStore.putFromBuffer({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        data: file.data,
      });
      const fileUrl = discussionUploadPublicUrl(sanitizedName);

      try {
        await attachmentsRepo.createAttachment(db, {
          id,
          ownerId: userId,
          kind,
          storageKey,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          fileSize: file.data.length,
          status: "ready",
          metadata: {
            uploadedAt: new Date().toISOString(),
            ...dimensions,
          },
        });
      } catch (error) {
        await uploadStore.remove(sanitizedName);
        throw error;
      }

      return {
        id,
        url: fileUrl,
        storageKey,
        fileName: file.filename,
        kind,
        mediaType,
        mimeType: file.mimetype,
        size: file.data.length,
        status: "ready",
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    },

    async fetchLinkPreview(url: string) {
      const cached = getCachedLinkPreview(url);
      if (cached) return cached;

      const inFlight = linkPreviewRequests.get(url);
      if (inFlight) return inFlight;

      const request = resolveLinkPreview(url)
        .then((preview) => {
          cacheLinkPreview(url, preview);
          return preview;
        })
        .finally(() => linkPreviewRequests.delete(url));
      linkPreviewRequests.set(url, request);
      return request;
    },
  };
}
