import type { DatabaseExecutor } from "@veolms/database";
import type {
  AttachmentKind,
  AttachmentStatus,
  AttachmentTargetType,
  LearningAttachment,
} from "@veolms/contracts";

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
  ): Promise<LearningAttachment | null>;

  listAttachmentsByTarget(
    db: DatabaseExecutor,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<LearningAttachment[]>;

  linkAttachmentsToTarget(
    db: DatabaseExecutor,
    attachmentIds: string[],
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<void>;
}

export function createAttachmentsRepository(): AttachmentsRepository {
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
          metadata: attachment.metadata ? JSON.stringify(attachment.metadata) : null,
        })
        .execute();
    },

    async findAttachmentById(db, attachmentId) {
      const row = await db
        .selectFrom("learning_attachments")
        .selectAll()
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
        fileUrl: row.file_url,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        status: row.status as AttachmentStatus,
        metadata:
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : (row.metadata as Record<string, unknown> | null),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      };
    },

    async listAttachmentsByTarget(db, targetType, targetId) {
      const rows = await db
        .selectFrom("learning_attachments")
        .selectAll()
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .where("status", "=", "ready")
        .orderBy("created_at", "asc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        targetType: (row.target_type as AttachmentTargetType) ?? null,
        targetId: row.target_id ?? null,
        kind: row.kind as AttachmentKind,
        storageKey: row.storage_key,
        fileName: row.file_name,
        fileUrl: row.file_url,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        status: row.status as AttachmentStatus,
        metadata:
          typeof row.metadata === "string"
            ? JSON.parse(row.metadata)
            : (row.metadata as Record<string, unknown> | null),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      }));
    },

    async linkAttachmentsToTarget(db, attachmentIds, targetType, targetId) {
      if (attachmentIds.length === 0) return;
      await db
        .updateTable("learning_attachments")
        .set({
          target_type: targetType,
          target_id: targetId,
        })
        .where("id", "in", attachmentIds)
        .execute();
    },
  };
}
