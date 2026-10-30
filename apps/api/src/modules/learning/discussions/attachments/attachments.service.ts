import crypto from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import type { DatabaseExecutor } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import { attachmentDimensionsSchema } from "@veolms/contracts";
import type {
  AttachmentKind,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse,
  LearningUploadResponse,
  UploadedAttachment,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  discussionUploadPublicUrl,
  isSupportedDiscussionUploadMimeType,
  DISCUSSION_DEFAULT_EXTENSION_FOR_MIME,
  isAllowedExtensionForMimeType,
  discussionUploadStorageKey,
  isSafeDiscussionUploadFileName,
  type DiscussionUploadStore,
} from "../../../discussion-uploads/index.ts";
import { config } from "../../../../config.ts";
import { STUDENT_ROLE } from "../../../auth/index.ts";
import { DISCUSSION_CONSTANTS } from "../shared/discussion.constants.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import { getAttachmentDimensionFields } from "../shared/discussion-attachment-metadata.ts";
import { createDiscussionRepository } from "../shared/discussion.repository.ts";
import { withWriteTransaction } from "../shared/discussion.mentions.ts";
import {
  exceedsUploadQuota,
  isUnrecordedUpload,
  supersededUploadFileName,
} from "./attachment-upload-rules.ts";
import type {
  AttachmentRecord,
  AttachmentsRepository,
} from "./attachments.repository.ts";
import type { DiscussionAttachmentUploadContext } from "./attachment-upload-context.ts";
import { getCdnDeliveryUrl } from "../../../../services/cdn-delivery.ts";

export interface AttachmentsService {
  initiateUpload(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: InitiateAttachmentUploadRequest,
  ): Promise<InitiateAttachmentUploadResponse>;

  uploadFile(
    db: DatabaseExecutor,
    attachmentId: string,
    userId: string,
    file: IncomingAttachmentFile,
    logger?: AttachmentUploadLogger,
  ): Promise<UploadedAttachment>;

  completeUpload(
    db: DatabaseExecutor,
    attachmentId: string,
    userId: string,
    logger?: AttachmentUploadLogger,
  ): Promise<UploadedAttachment>;

  processUpload(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    context: DiscussionAttachmentUploadContext,
    file: IncomingAttachmentFile,
  ): Promise<LearningUploadResponse>;

  /**
   * Removes uploads that were never attached to a post and that nothing
   * refers to. With `apply` false it only reports what it would remove.
   */
  purgeAbandonedUploads(
    db: DatabaseExecutor,
    options: PurgeAbandonedUploadsOptions,
  ): Promise<PurgeAbandonedUploadsResult>;
}

export interface PurgeAbandonedUploadsOptions {
  /** Only uploads created before this moment are considered. */
  olderThan: Date;
  /** False reports what would be removed and removes nothing. */
  apply: boolean;
  /**
   * The most uploads one run removes. Every candidate is still looked at:
   * capping the ones looked at would let uploads that are kept, which stay
   * candidates on every run, hold back the ones behind them for good.
   */
  limit: number;
  /**
   * Asks the rest of the platform which of these uploads it refers to (in a
   * lesson or course description, say). An upload it refers to is kept.
   */
  findReferencedElsewhere?: (
    attachmentIds: readonly string[],
  ) => Promise<readonly string[]>;
}

export interface PurgeAbandonedUploadsResult {
  examined: number;
  /** Kept because a post, note or other record mentions them. */
  referenced: number;
  /** Removed, or with `apply` false, would be. */
  removable: number;
  removableBytes: number;
  /** Attached or removed by someone else while the run was under way. */
  skipped: number;
  /**
   * Left in place because the stored file could not be removed, or is not
   * where a discussion upload is kept. They stay candidates for the next
   * run.
   */
  failed: number;
}

/** How long an upload slot from /attachments/initiate accepts its file. */
const UPLOAD_SLOT_TTL_MS = 60 * 60 * 1000;

const UPLOAD_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const PURGE_PAGE_SIZE = 100;

/** Any role beyond student posts teaching material and gets the staff allowance. */
function dailyUploadQuotaBytes(actor: DiscussionActor): number {
  const isStaff = actor.roles.some(
    (role) => role.toLowerCase() !== STUDENT_ROLE,
  );
  const megabytes = isStaff
    ? config.DISCUSSION_UPLOAD_DAILY_QUOTA_STAFF_MB
    : config.DISCUSSION_UPLOAD_DAILY_QUOTA_MB;
  return megabytes * BYTES_PER_MEGABYTE;
}

/**
 * The request logger, as far as an upload needs it: a place to record a
 * stored file that could not be tidied away, which the caller is not told.
 */
export interface AttachmentUploadLogger {
  warn(details: object, message: string): void;
}

/**
 * An incoming multipart file, streamed rather than buffered: the previous
 * `data: Buffer` shape held the entire file (up to 50MB) in heap per
 * concurrent upload. The stream is consumed exactly once, by the storage
 * layer. Size enforcement happens AFTER storing (the byte count is only
 * known then); oversized or truncated uploads are deleted and rejected
 * with the same 413 the buffered path produced.
 */
export interface IncomingAttachmentFile {
  filename: string;
  mimetype: string;
  stream: Readable;
  /** True when the multipart fileSize cap cut the stream short. */
  isTruncated: () => boolean;
  width?: number;
  height?: number;
}

export function createAttachmentsService(
  attachmentsRepo: AttachmentsRepository,
  uploadStore: DiscussionUploadStore,
  storage: S3StorageService,
): AttachmentsService {
  const discussionAccess = createDiscussionAccess();
  const discussionRepo = createDiscussionRepository();

  // The uploader's view of a stored attachment. The delivery URL is signed
  // per response; the storage key, owner and link target are not returned.
  function presentUploadedAttachment(
    attachment: AttachmentRecord,
  ): UploadedAttachment {
    return {
      id: attachment.id,
      kind: attachment.kind,
      fileName: attachment.fileName,
      fileUrl: getCdnDeliveryUrl(storage, attachment.storageKey).url,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      width: attachment.width,
      height: attachment.height,
    };
  }

  async function assertUploadAuthorized(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    context: DiscussionAttachmentUploadContext,
  ): Promise<void> {
    const lesson = await discussionRepo.findUploadLessonId(db, {
      courseId: context.courseId,
      lessonId: context.lessonId,
    });

    if (!lesson) {
      throw httpError(
        400,
        "INVALID_UPLOAD_CONTEXT",
        "The lesson does not belong to the selected course.",
      );
    }

    await discussionAccess.assertCanParticipateInCourse(
      db,
      actor,
      context.courseId,
    );
  }

  /**
   * Refuses an upload once the account has used its allowance for the last
   * 24 hours. `incomingBytes` is the size the client declared, where it
   * declared one; a streamed upload has no size until it is stored, so it
   * is let through while any allowance is left (0 bytes here) and counted
   * at its real size by `recordUploadWithinQuota` once stored.
   *
   * On its own this is only an early answer: it reads a total that a
   * request arriving at the same moment does not see yet.
   */
  async function assertWithinUploadQuota(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    incomingBytes: number,
  ): Promise<void> {
    const quotaBytes = dailyUploadQuotaBytes(actor);
    if (quotaBytes <= 0) return;

    const usedBytes = await attachmentsRepo.sumOwnerUploadBytesSince(
      db,
      actor.userId,
      new Date(Date.now() - UPLOAD_QUOTA_WINDOW_MS),
    );
    if (exceedsUploadQuota(usedBytes, incomingBytes, quotaBytes)) {
      throw httpError(
        429,
        "UPLOAD_QUOTA_EXCEEDED",
        "You have reached your upload limit for today. Please try again tomorrow.",
      );
    }
  }

  /**
   * Counts the allowance and records the upload under it as one step per
   * account, at the size given (the declared size of a slot, the stored
   * size of a streamed file). Done as two steps, a burst of requests each
   * read the total before any of them had recorded its upload, and all of
   * them went through: twelve at once took several times the allowance.
   * Refused with the same answer as `assertWithinUploadQuota`, and nothing
   * is recorded.
   */
  async function recordUploadWithinQuota(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    attachment: Parameters<AttachmentsRepository["createAttachment"]>[1],
  ): Promise<void> {
    if (dailyUploadQuotaBytes(actor) <= 0) {
      await attachmentsRepo.createAttachment(db, attachment);
      return;
    }

    await withWriteTransaction(db, async (trx) => {
      await attachmentsRepo.lockOwnerUploadAllowance(trx, actor.userId);
      await assertWithinUploadQuota(trx, actor, attachment.fileSize);
      await attachmentsRepo.createAttachment(trx, attachment);
    });
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
    async initiateUpload(db, actor, input) {
      await assertUploadAuthorized(db, actor, input);

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

      await assertWithinUploadQuota(db, actor, input.fileSize);

      const dimensions = validateDimensions(input.mimeType, input);

      const id = crypto.randomUUID();
      const ext = resolveExtension(input.fileName, input.mimeType);
      const storageKey = discussionUploadStorageKey(`${id}${ext}`);
      const kind =
        input.kind || getAttachmentKind(input.mimeType, input.fileName);

      const uploadUrl = await storage.getPresignedPutUrl(
        storageKey,
        input.mimeType,
        input.fileSize,
      );

      await recordUploadWithinQuota(db, actor, {
        id,
        ownerId: actor.userId,
        kind,
        storageKey,
        fileName: input.fileName,
        fileUrl: "",
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        status: "uploading",
        metadata: {
          initiatedAt: new Date().toISOString(),
          courseId: input.courseId,
          lessonId: input.lessonId,
          ...dimensions,
        },
      });

      return { attachmentId: id, uploadUrl };
    },

    async uploadFile(db, attachmentId, userId, file, logger) {
      if (!isSupportedDiscussionUploadMimeType(file.mimetype)) {
        throw httpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Choose a supported image, video, or document file.",
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

      // A slot takes one file, before it is attached to anything. Without
      // this the owner could swap the file behind a post that is already
      // published, or bring back an attachment that was removed with it.
      if (existing.status !== "uploading" || existing.targetId !== null) {
        throw httpError(
          400,
          "UPLOAD_SLOT_CLOSED",
          "This attachment can no longer receive a file.",
        );
      }

      // The slot was counted against the daily allowance at the size the
      // client declared for it, and only for a while. Without both checks a
      // slot declared at one byte took a full-size file, at any later time.
      const initiatedAt =
        typeof existing.metadata?.initiatedAt === "string"
          ? Date.parse(existing.metadata.initiatedAt)
          : Number.NaN;
      if (
        Number.isFinite(initiatedAt) &&
        Date.now() - initiatedAt > UPLOAD_SLOT_TTL_MS
      ) {
        throw httpError(
          400,
          "UPLOAD_SLOT_CLOSED",
          "This attachment can no longer receive a file.",
        );
      }

      const dimensions = validateDimensions(file.mimetype, file);
      const existingDimensions = getAttachmentDimensionFields(
        existing.metadata,
      );
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
      const stored = await uploadStore.putNamedFromStream({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        stream: file.stream,
      });
      if (
        stored.size > DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES ||
        stored.size > existing.fileSize ||
        file.isTruncated()
      ) {
        await uploadStore.remove(sanitizedName);
        throw httpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The selected file is too large.",
        );
      }
      const fileUrl = discussionUploadPublicUrl(sanitizedName);
      const storedStorageKey = discussionUploadStorageKey(sanitizedName);

      let slotFilled: boolean;
      try {
        // Only while the slot is still open, as checked above: the file
        // took a while to arrive, and the slot may have been filled since.
        slotFilled = await attachmentsRepo.fillUploadSlot(db, {
          attachmentId,
          storageKey: storedStorageKey,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          fileSize: stored.size,
          metadata: JSON.stringify(
            mergeDimensions(
              {
                ...(existing.metadata || {}),
                uploadedAt: new Date().toISOString(),
              },
              persistedDimensions,
            ),
          ),
        });
      } catch (error) {
        await uploadStore.remove(sanitizedName);
        throw error;
      }

      // The slot was filled while this file was arriving: two files posted
      // to one slot at the same moment both pass the check above. Both used
      // to be accepted, the record kept whichever was written last, and the
      // other stayed in storage with no record pointing at it, where the
      // clean-up job, which works from the records, never finds it. This
      // file is now refused like one posted after the slot was filled, and
      // removed. The refusal is the answer either way, so a failure to
      // remove is recorded, not returned.
      if (!slotFilled) {
        const current = await attachmentsRepo.findAttachmentById(
          db,
          attachmentId,
        );
        if (isUnrecordedUpload(storedStorageKey, current?.storageKey)) {
          try {
            await uploadStore.removeOrThrow(sanitizedName);
          } catch (error) {
            logger?.warn(
              { err: error, attachmentId, storageKey: storedStorageKey },
              "Could not remove a file sent to an upload slot that was already filled",
            );
          }
        }
        throw httpError(
          400,
          "UPLOAD_SLOT_CLOSED",
          "This attachment can no longer receive a file.",
        );
      }

      // The record now points at the file just stored. If bytes were also
      // put at the address the slot was opened with, under another name,
      // nothing points at them any more: they go now, because the clean-up
      // job works from the records and would never find them. The upload
      // has succeeded either way, so a failure here is recorded, not
      // returned.
      const supersededName = supersededUploadFileName(
        existing.storageKey,
        storedStorageKey,
      );
      if (supersededName) {
        try {
          await uploadStore.removeOrThrow(supersededName);
        } catch (error) {
          logger?.warn(
            { err: error, attachmentId, storageKey: existing.storageKey },
            "Could not remove the file an upload slot was first given",
          );
        }
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
      return presentUploadedAttachment(updated);
    },

    async completeUpload(db, attachmentId, userId, logger) {
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

      if (existing.status === "ready") {
        return presentUploadedAttachment(existing);
      }

      // The store answers "no such object" with null, which is the upload
      // not having arrived yet. Anything it throws is the store itself not
      // answering: nothing is wrong with the upload, and asking again later
      // can succeed, so it is not reported as a server fault.
      let uploadedObject: Awaited<ReturnType<typeof storage.headObject>>;
      try {
        uploadedObject = await storage.headObject(existing.storageKey);
      } catch (error) {
        logger?.warn(
          { err: error, attachmentId, storageKey: existing.storageKey },
          "Could not reach the file store to confirm an upload",
        );
        throw httpError(
          503,
          "STORAGE_UNAVAILABLE",
          "The file store could not be reached. Try again.",
        );
      }
      if (!uploadedObject) {
        throw httpError(
          400,
          "UPLOAD_INCOMPLETE",
          "Upload has no file data yet",
        );
      }

      if (
        uploadedObject.contentLength !== undefined &&
        uploadedObject.contentLength !== existing.fileSize
      ) {
        throw httpError(
          400,
          "FILE_SIZE_MISMATCH",
          "Uploaded file size does not match the initiated upload.",
        );
      }

      if (
        uploadedObject.contentType &&
        uploadedObject.contentType.split(";", 1)[0]!.trim().toLowerCase() !==
          existing.mimeType.split(";", 1)[0]!.trim().toLowerCase()
      ) {
        throw httpError(
          400,
          "MIME_TYPE_MISMATCH",
          "Uploaded file type does not match the initiated upload.",
        );
      }

      await attachmentsRepo.markUploadReady(db, {
        attachmentId,
        fileUrl:
          storage.getCdnObjectUrl(existing.storageKey) || existing.storageKey,
        metadata: JSON.stringify({
          ...(existing.metadata || {}),
          completedAt: new Date().toISOString(),
        }),
      });

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
      return presentUploadedAttachment(completed);
    },

    async processUpload(db, actor, context, file) {
      await assertUploadAuthorized(db, actor, context);

      if (!isSupportedDiscussionUploadMimeType(file.mimetype)) {
        throw httpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Choose a supported image, video, or document file.",
        );
      }

      await assertWithinUploadQuota(db, actor, 0);

      const dimensions = validateDimensions(file.mimetype, file);

      const id = crypto.randomUUID();
      const ext = resolveExtension(file.filename, file.mimetype);
      const sanitizedName = `${id}${ext}`;
      const storageKey = discussionUploadStorageKey(sanitizedName);
      const kind = getAttachmentKind(file.mimetype, file.filename);
      const mediaType = getMediaType(kind, file.mimetype);

      const stored = await uploadStore.putNamedFromStream({
        fileName: sanitizedName,
        mimeType: file.mimetype,
        stream: file.stream,
      });
      if (
        stored.size > DISCUSSION_CONSTANTS.MAX_ATTACHMENT_SIZE_BYTES ||
        file.isTruncated()
      ) {
        await uploadStore.remove(sanitizedName);
        throw httpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The selected file is too large.",
        );
      }
      const fileUrl = discussionUploadPublicUrl(sanitizedName);

      // The size is known now, so this is where the file is counted. One
      // that takes the account past its allowance is refused like a slot
      // declared at that size would have been, and the catch removes it.
      try {
        await recordUploadWithinQuota(db, actor, {
          id,
          ownerId: actor.userId,
          kind,
          storageKey,
          fileName: file.filename,
          fileUrl,
          mimeType: file.mimetype,
          fileSize: stored.size,
          status: "ready",
          metadata: {
            uploadedAt: new Date().toISOString(),
            courseId: context.courseId,
            lessonId: context.lessonId,
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
        fileName: file.filename,
        kind,
        mediaType,
        mimeType: file.mimetype,
        size: stored.size,
        status: "ready",
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    },

    async purgeAbandonedUploads(db, options) {
      const result: PurgeAbandonedUploadsResult = {
        examined: 0,
        referenced: 0,
        removable: 0,
        removableBytes: 0,
        skipped: 0,
        failed: 0,
      };
      let afterId: string | undefined;

      while (result.removable < options.limit) {
        const page = await attachmentsRepo.listUnattachedAttachments(db, {
          olderThan: options.olderThan,
          limit: PURGE_PAGE_SIZE,
          afterId,
        });
        if (page.length === 0) break;

        // An upload shown inline in a post, or linked from anywhere else, is
        // in use even though no post lists it as an attachment. Looked up
        // for the whole page at once, just before the page is acted on.
        const pageIds = page.map((attachment) => attachment.id.toLowerCase());
        const referencedIds = new Set(
          [
            ...(await attachmentsRepo.findAttachmentsMentionedInPosts(
              db,
              pageIds,
            )),
            ...(options.findReferencedElsewhere
              ? await options.findReferencedElsewhere(pageIds)
              : []),
          ].map((id) => id.toLowerCase()),
        );

        for (const attachment of page) {
          if (result.removable >= options.limit) break;
          result.examined += 1;
          afterId = attachment.id;

          if (referencedIds.has(attachment.id.toLowerCase())) {
            result.referenced += 1;
            continue;
          }

          // Only a file kept where discussion uploads are kept is removed,
          // and by its own stored address.
          const fileName = attachment.storageKey.slice(
            attachment.storageKey.lastIndexOf("/") + 1,
          );
          if (
            attachment.storageKey !== discussionUploadStorageKey(fileName) ||
            !isSafeDiscussionUploadFileName(fileName)
          ) {
            result.failed += 1;
            continue;
          }

          if (options.apply) {
            // The row goes first, and only while it is still unattached: an
            // upload attached to a post a moment ago is left alone, and a
            // removed row can no longer be attached, so the file is not
            // taken from under a post.
            const marked =
              await attachmentsRepo.markUnattachedAttachmentDeleted(db, {
                attachmentId: attachment.id,
                olderThan: options.olderThan,
              });
            if (!marked) {
              result.skipped += 1;
              continue;
            }

            try {
              await uploadStore.removeOrThrow(fileName);
            } catch {
              // The file is still there: the row goes back to what it was,
              // so the next run tries again instead of losing track of it.
              await attachmentsRepo.restoreUnattachedAttachment(db, {
                attachmentId: attachment.id,
                status: attachment.status,
              });
              result.failed += 1;
              continue;
            }
          }

          result.removable += 1;
          result.removableBytes += Number(attachment.fileSize);
        }
      }

      return result;
    },
  };
}
