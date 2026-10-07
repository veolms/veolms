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
