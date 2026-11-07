import {
  CHAT_RESTORE_DAYS,
  type ChatMessage,
  type ChatPerson,
  type ChatSenderRole,
} from "@veolms/contracts";

import type { MessageRow, PersonRow } from "./chat.repository.ts";

const DELETED_USER = "Deleted user";

/** Where a browser reads an attachment (the API checks access, then redirects). */
export function chatUploadUrl(uploadId: string): string {
  return `/v1/chat/uploads/${uploadId}`;
}
const PREVIEW_CHARS = 120;

export function preview(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > PREVIEW_CHARS
    ? `${single.slice(0, PREVIEW_CHARS - 1)}…`
    : single;
}

export function presentPerson(row: PersonRow): ChatPerson {
  return {
    id: row.id,
    name: row.is_deleted ? DELETED_USER : row.display_name,
    avatarUrl: row.is_deleted ? null : row.avatar_data_url,
  };
}

function asRole(value: string): ChatSenderRole {
  return value === "admin" ||
    value === "instructor" ||
    value === "staff" ||
    value === "helper"
    ? value
    : "learner";
}

/** A stored message as clients see it. Deleted text is never sent out. */
export function presentMessage(row: MessageRow): ChatMessage {
  const deleted = row.deleted_at !== null;
  const restoreUntil = row.deleted_at
    ? row.deleted_at.getTime() + CHAT_RESTORE_DAYS * 24 * 60 * 60 * 1000
    : 0;
  return {
    id: row.id,
    roomId: row.room_id,
    seq: Number(row.seq),
    eventSeq: Number(row.version_seq),
    kind: row.kind === "system" ? "system" : "text",
    sender: row.sender_id
      ? {
          id: row.sender_id,
          name: row.sender_deleted
            ? DELETED_USER
            : (row.sender_name ?? DELETED_USER),
          avatarUrl: row.sender_deleted ? null : row.sender_avatar,
          role: asRole(row.sender_role),
        }
      : null,
    body: deleted ? "" : row.body,
    replyTo:
      row.reply_to_seq === null
        ? null
        : {
            seq: Number(row.reply_to_seq),
            senderName: row.reply_sender_name,
            preview:
              row.reply_deleted_at !== null || row.reply_body === null
                ? ""
                : preview(row.reply_body),
            deleted: row.reply_deleted_at !== null || row.reply_body === null,
          },
    mentions: deleted ? [] : row.mentions,
    mentionAll: deleted ? false : row.mention_all,
    reactions: deleted ? {} : (row.reaction_counts ?? {}),
    attachments: deleted
      ? []
      : (row.attachments ?? []).map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
          durationMs: attachment.durationMs ?? null,
          waveform: attachment.waveform ?? null,
          url: chatUploadUrl(attachment.id),
        })),
    pinned: !deleted && row.pinned_at !== null,
    createdAt: row.created_at.toISOString(),
    editedAt: deleted ? null : (row.edited_at?.toISOString() ?? null),
    deleted: deleted
      ? {
          by:
            row.deleted_reason === "admin" || row.deleted_reason === "purge"
              ? row.deleted_reason
              : "self",
          byName: row.deleted_reason === "admin" ? row.deleted_by_name : null,
          restorable:
            row.deleted_reason === "admin" &&
            row.body !== "" &&
            Date.now() < restoreUntil,
        }
      : null,
  };
}
