import type { DatabaseExecutor } from "@veolms/database";
import type {
  AttachmentKind,
  LearningThreadAttachmentSummary,
} from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import { getCdnDeliveryUrl } from "../../../../services/cdn-delivery.ts";
import { getAttachmentDimensionFields } from "./discussion-attachment-metadata.ts";

/** The attachment columns a thread or reply response is built from. */
export interface DiscussionAttachmentRow {
  id: string;
  kind: AttachmentKind;
  file_name: string;
  storage_key: string;
  file_url: string;
  mime_type: string;
  file_size: number;
  /** Read for the stored width and height only; never sent as it is. */
  metadata: unknown;
}

/**
 * The ready attachments of the given threads or replies, grouped by the post
 * they belong to and in upload order.
 */
export async function listReadyAttachments(
  db: DatabaseExecutor,
  targetType: "thread" | "reply",
  targetIds: readonly string[],
): Promise<Map<string, DiscussionAttachmentRow[]>> {
  const byTargetId = new Map<string, DiscussionAttachmentRow[]>();
  if (targetIds.length === 0) return byTargetId;

  const rows = await db
    .selectFrom("learning_attachments")
    .select([
      "id",
      "target_id",
      "kind",
      "file_name",
      "storage_key",
      "file_url",
      "mime_type",
      "file_size",
      "metadata",
    ])
    .where("target_type", "=", targetType)
    .where("target_id", "in", [...targetIds])
    .where("status", "=", "ready")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();

  for (const { target_id: targetId, ...attachment } of rows) {
    if (!targetId) continue;
    const group = byTargetId.get(targetId);
    if (group) group.push(attachment);
    else byTargetId.set(targetId, [attachment]);
  }
  return byTargetId;
}

export function presentDiscussionAttachment(
  attachment: DiscussionAttachmentRow,
  storage?: S3StorageService,
): LearningThreadAttachmentSummary {
  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.file_name,
    fileUrl: storage
      ? getCdnDeliveryUrl(storage, attachment.storage_key).url
      : attachment.file_url,
    mimeType: attachment.mime_type,
    fileSize: Number(attachment.file_size || 0),
    ...getAttachmentDimensionFields(attachment.metadata),
  };
}
