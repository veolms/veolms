import type { DatabaseExecutor } from "@veolms/database";
import type {
  AttachmentKind,
  AttachmentStatus,
  AttachmentTargetType,
  DiscussionAttachmentSummary,
} from "@veolms/contracts";
import { sql } from "kysely";
import { getAttachmentDimensionFields } from "../shared/discussion-attachment-metadata.ts";

export interface AttachmentSummaryRow {
  targetId: string;
  attachmentSummary: DiscussionAttachmentSummary;
}

/**
 * A stored attachment as the server works with it. It carries the storage
 * key and ownership, so it is never sent to a client as-is.
 */
export interface AttachmentRecord {
  id: string;
  ownerId: string;
  targetType: AttachmentTargetType | null;
  targetId: string | null;
  kind: AttachmentKind;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: AttachmentStatus;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown> | null;
}

export interface AttachmentsRepository {
  createAttachment(
    db: DatabaseExecutor,
    attachment: {
      id: string;
      ownerId: string;
      targetType?: AttachmentTargetType | null;
      targetId?: string | null;
      kind: AttachmentKind;
      storageKey: string;
      fileName: string;
      fileUrl: string;
      mimeType: string;
      fileSize: number;
      status?: AttachmentStatus;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void>;

  findAttachmentById(
    db: DatabaseExecutor,
    attachmentId: string,
  ): Promise<AttachmentRecord | null>;

  listThreadAttachmentSummaries(
    db: DatabaseExecutor,
    threadIds: readonly string[],
  ): Promise<AttachmentSummaryRow[]>;

  listReplyAttachmentSummaries(
    db: DatabaseExecutor,
    replyIds: readonly string[],
  ): Promise<AttachmentSummaryRow[]>;

  listNoteAttachmentSummaries(
    db: DatabaseExecutor,
    noteIds: readonly string[],
  ): Promise<AttachmentSummaryRow[]>;

  /**
   * Bytes an account has uploaded since `since`, whatever became of the
   * files. Removed uploads still count, so deleting and uploading again
   * does not win the allowance back.
   */
  sumOwnerUploadBytesSince(
    db: DatabaseExecutor,
    ownerId: string,
    since: Date,
  ): Promise<number>;

  /**
   * Holds the account's upload allowance for the rest of the caller's
   * transaction: another transaction asking for the same account waits
   * until this one ends. Counting the allowance and recording an upload
   * under it are then one step, where two requests arriving together used
   * to count the same total and both go through. Call it inside a
   * transaction; outside one it holds nothing.
   */
  lockOwnerUploadAllowance(
    db: DatabaseExecutor,
    ownerId: string,
  ): Promise<void>;

  /**
   * Uploads that were never attached to a post and are older than
   * `olderThan`, in id order, after `afterId`. Paged by id because an id
   * compares exactly; a timestamp read into the application loses the
   * precision the database keeps, and a page boundary on it repeats rows.
   */
  listUnattachedAttachments(
    db: DatabaseExecutor,
    input: {
      olderThan: Date;
      limit: number;
      afterId?: string | undefined;
    },
  ): Promise<UnattachedAttachmentRow[]>;

  /**
   * Which of the given attachments a thread, reply or note mentions in its
   * text, as a post does when it shows an image inline. One pass over the
   * posts for the whole set; `attachmentIds` must be lower-case UUIDs.
   */
  findAttachmentsMentionedInPosts(
    db: DatabaseExecutor,
    attachmentIds: readonly string[],
  ): Promise<string[]>;

  /**
   * Puts back an upload that markUnattachedAttachmentDeleted marked removed,
   * when its file could not be removed after all.
   */
  restoreUnattachedAttachment(
    db: DatabaseExecutor,
    input: { attachmentId: string; status: AttachmentStatus },
  ): Promise<void>;

  /**
   * Marks an upload removed, but only while it is still unattached and
   * older than `olderThan`. False when it was attached, or already
   * removed, in the meantime.
   */
  markUnattachedAttachmentDeleted(
    db: DatabaseExecutor,
    input: { attachmentId: string; olderThan: Date },
  ): Promise<boolean>;

  /**
   * Records the file sent to an upload slot and marks it ready, but only
   * while the slot is still open (uploading and unattached). False when it
   * was filled or attached in the meantime.
   */
  fillUploadSlot(
    db: DatabaseExecutor,
    input: {
      attachmentId: string;
      storageKey: string;
      fileName: string;
      fileUrl: string;
      mimeType: string;
      fileSize: number;
      /** Serialized JSON. */
      metadata: string;
    },
  ): Promise<boolean>;

  /** Marks a directly uploaded attachment ready. `metadata` is serialized JSON. */
  markUploadReady(
    db: DatabaseExecutor,
    input: { attachmentId: string; fileUrl: string; metadata: string },
  ): Promise<void>;
}

export interface UnattachedAttachmentRow {
  id: string;
  storageKey: string;
  fileSize: number;
  status: AttachmentStatus;
}

export function createAttachmentsRepository(): AttachmentsRepository {
  async function listAttachmentSummaries(
    db: DatabaseExecutor,
    targetType: AttachmentTargetType,
    targetIds: readonly string[],
  ): Promise<AttachmentSummaryRow[]> {
    if (targetIds.length === 0) return [];

    const rows = await db
      .selectFrom("learning_attachments")
      .select([
        "target_id as targetId",
        sql<number>`count(*)::int`.as("count"),
        sql<boolean>`bool_or(
          kind in ('image', 'screenshot') or mime_type like 'image/%'
        )`.as("hasImages"),
        sql<boolean>`bool_or(mime_type like 'video/%')`.as("hasVideos"),
        sql<boolean>`bool_or(
          kind in ('code', 'document')
          and mime_type not like 'image/%'
          and mime_type not like 'video/%'
        )`.as("hasFiles"),
      ])
      .where("target_type", "=", targetType)
      .where("target_id", "in", [...targetIds])
      .where("status", "=", "ready")
      .groupBy("target_id")
      .execute();

    return rows.flatMap((row) =>
      row.targetId
        ? [
            {
              targetId: row.targetId,
              attachmentSummary: {
                count: Number(row.count),
                hasImages: Boolean(row.hasImages),
                hasVideos: Boolean(row.hasVideos),
                hasFiles: Boolean(row.hasFiles),
              },
            },
          ]
        : [],
    );
  }

  return {
    async createAttachment(db, attachment) {
      await db
        .insertInto("learning_attachments")
        .values({
          id: attachment.id,
          owner_id: attachment.ownerId,
          target_type: attachment.targetType || null,
          target_id: attachment.targetId || null,
          kind: attachment.kind,
          storage_key: attachment.storageKey,
          file_name: attachment.fileName,
          file_url: attachment.fileUrl,
          mime_type: attachment.mimeType,
          file_size: attachment.fileSize,
          status: attachment.status || "uploading",
          metadata: attachment.metadata
            ? JSON.stringify(attachment.metadata)
            : null,
        })
        .execute();
    },

    async sumOwnerUploadBytesSince(db, ownerId, since) {
      const row = await db
        .selectFrom("learning_attachments")
        .select(sql<string>`coalesce(sum(file_size), 0)`.as("bytes"))
        .where("owner_id", "=", ownerId)
        .where("created_at", ">", since)
        .executeTakeFirst();

      return Number(row?.bytes ?? 0);
    },

    async lockOwnerUploadAllowance(db, ownerId) {
      await sql`select pg_advisory_xact_lock(hashtext(${`veolms:discussion-upload-allowance:${ownerId}`}))`.execute(
        db,
      );
    },

    async listUnattachedAttachments(db, input) {
      let query = db
        .selectFrom("learning_attachments")
        .select([
          "id",
          "storage_key as storageKey",
          "file_size as fileSize",
          "status",
        ])
        .where("target_id", "is", null)
        .where("status", "in", ["uploading", "ready"])
        .where("created_at", "<", input.olderThan);

      if (input.afterId) query = query.where("id", ">", input.afterId);

      return await query.orderBy("id", "asc").limit(input.limit).execute();
    },

    async findAttachmentsMentionedInPosts(db, attachmentIds) {
      if (attachmentIds.length === 0) return [];

      const result = await sql<{ id: string }>`
        select distinct lower(found[1]) as id
        from (
          select content as body from learning_threads
          union all
          select content from learning_replies
          union all
          select content from learning_notes
        ) as texts
        cross join lateral regexp_matches(
          texts.body,
          '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
          'g'
        ) as found
        where lower(found[1]) = any(${[...attachmentIds]}::text[])
      `.execute(db);

      return result.rows.map((row) => row.id);
    },

    async restoreUnattachedAttachment(db, input) {
      await db
        .updateTable("learning_attachments")
        .set({ status: input.status })
        .where("id", "=", input.attachmentId)
        .where("target_id", "is", null)
        .where("status", "=", "deleted")
        .execute();
    },

    async markUnattachedAttachmentDeleted(db, input) {
      const result = await db
        .updateTable("learning_attachments")
        .set({ status: "deleted" })
        .where("id", "=", input.attachmentId)
        .where("target_id", "is", null)
        .where("status", "in", ["uploading", "ready"])
        .where("created_at", "<", input.olderThan)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async fillUploadSlot(db, input) {
      const result = await db
        .updateTable("learning_attachments")
        .set({
          storage_key: input.storageKey,
          file_name: input.fileName,
          file_url: input.fileUrl,
          mime_type: input.mimeType,
          file_size: input.fileSize,
          status: "ready",
          metadata: input.metadata,
        })
        .where("id", "=", input.attachmentId)
        // Only while the slot is still open: the file took a while to
        // arrive, and the slot may have been filled since.
        .where("status", "=", "uploading")
        .where("target_id", "is", null)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async markUploadReady(db, input) {
      await db
        .updateTable("learning_attachments")
        .set({
          status: "ready",
          file_url: input.fileUrl,
          metadata: input.metadata,
        })
        .where("id", "=", input.attachmentId)
        .execute();
    },

    async findAttachmentById(db, attachmentId) {
      const row = await db
        .selectFrom("learning_attachments")
        .select([
          "id",
          "owner_id",
          "target_type",
          "target_id",
          "kind",
          "storage_key",
          "file_name",
          "mime_type",
          "file_size",
          "status",
          "metadata",
        ])
        .where("id", "=", attachmentId)
        .executeTakeFirst();

      if (!row) return null;

      return {
        id: row.id,
        ownerId: row.owner_id,
        targetType: (row.target_type as AttachmentTargetType) ?? null,
        targetId: row.target_id ?? null,
        kind: row.kind as AttachmentKind,
        storageKey: row.storage_key,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        status: row.status as AttachmentStatus,
        ...getAttachmentDimensionFields(row.metadata),
        metadata:
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : (row.metadata as Record<string, unknown> | null),
      };
    },

    async listThreadAttachmentSummaries(db, threadIds) {
      return listAttachmentSummaries(db, "thread", threadIds);
    },

    async listReplyAttachmentSummaries(db, replyIds) {
      return listAttachmentSummaries(db, "reply", replyIds);
    },

    async listNoteAttachmentSummaries(db, noteIds) {
      return listAttachmentSummaries(db, "note", noteIds);
    },
  };
}
