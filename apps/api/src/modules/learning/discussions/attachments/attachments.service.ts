import crypto from "node:crypto";
import path from "node:path";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AttachmentKind,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse,
  LearningAttachment,
  LearningUploadResponse,
  LinkPreviewResponse,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  discussionUploadPublicUrl,
  type DiscussionUploadStore,
} from "../../../discussion-uploads/index.ts";
import { DISCUSSION_CONSTANTS } from "../shared/discussion.constants.ts";
import type { AttachmentsRepository } from "./attachments.repository.ts";

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
    },
  ): Promise<LearningUploadResponse>;

  fetchLinkPreview(url: string): Promise<LinkPreviewResponse>;
}

export function createAttachmentsService(
  attachmentsRepo: AttachmentsRepository,
  uploadStore: DiscussionUploadStore,
): AttachmentsService {
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

  function sanitizeExtension(ext: string): string {
    const cleaned = ext.replace(/[^A-Za-z0-9.]/g, "").slice(0, 17);
    return cleaned.startsWith(".") ? cleaned : ".bin";
  }

  return {
    async initiateUpload(db, userId, input) {
      const id = crypto.randomUUID();
      const ext = path.extname(input.fileName) || ".bin";
      const storageKey = `discussion-uploads/${id}${sanitizeExtension(ext)}`;
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
        metadata: { initiatedAt: new Date().toISOString() },
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

      const ext = sanitizeExtension(path.extname(file.filename));
      const sanitizedName = `${attachmentId}${ext}`;
      await uploadStore.putFromBuffer({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        data: file.data,
      });
      const fileUrl = discussionUploadPublicUrl(sanitizedName);

      await db
        .updateTable("learning_attachments")
        .set({
          storage_key: `discussion-uploads/${sanitizedName}`,
          file_name: file.filename,
          file_url: fileUrl,
          mime_type: file.mimetype,
          file_size: file.data.length,
          status: "ready",
          metadata: JSON.stringify({
            ...(existing.metadata || {}),
            uploadedAt: new Date().toISOString(),
          }),
        })
        .where("id", "=", attachmentId)
        .execute();

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
      return completed!;
    },

    async processUpload(db, userId, file) {
      const id = crypto.randomUUID();
      const ext = sanitizeExtension(path.extname(file.filename));
      const sanitizedName = `${id}${ext}`;
      const storageKey = `discussion-uploads/${sanitizedName}`;
      const kind = getAttachmentKind(file.mimetype, file.filename);
      const mediaType = getMediaType(kind, file.mimetype);

      await uploadStore.putFromBuffer({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        data: file.data,
      });
      const fileUrl = discussionUploadPublicUrl(sanitizedName);

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
        metadata: { uploadedAt: new Date().toISOString() },
      });

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
      };
    },

    async fetchLinkPreview(url: string) {
      try {
        const parsed = new URL(url);
        return {
          url,
          title: parsed.hostname,
          description: `Resource from ${parsed.hostname}`,
          siteName: parsed.hostname,
          imageUrl: null,
        };
      } catch {
        return {
          url,
          title: null,
          description: null,
          siteName: null,
          imageUrl: null,
        };
      }
    },
  };
}
