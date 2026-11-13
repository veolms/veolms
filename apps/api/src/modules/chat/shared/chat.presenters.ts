import {
  CHAT_RESTORE_DAYS,
  type ChatMessage,
  type ChatPerson,
  type ChatSenderRole,
} from "@veolms/contracts";

import { clampText } from "../../../lib/text.ts";
import type { MessageRow, PersonRow } from "./chat.repository.ts";

const DELETED_USER = "Deleted user";

/** Where a browser reads an attachment (the API checks access, then redirects). */
export function chatUploadUrl(uploadId: string): string {
  return `/v1/chat/uploads/${uploadId}`;
}
/**
 * Where a group's picture is read (the API picks the icon an admin set, else
 * the course's picture, and redirects). `v` changes with the picture, so
 * a browser's cached copy is never shown after a change.
 */
export function chatRoomIconUrl(row: {
  id: string;
  kind: string;
  icon_upload_id: string | null;
  course_thumbnail_media_id: string | null;
  course_thumbnail: string | null;
}): string | null {
  if (row.kind === "direct") return null;
  const version =
    row.icon_upload_id ??
    row.course_thumbnail_media_id ??
    (row.course_thumbnail ? "course" : null);
  return version
    ? `/v1/chat/rooms/${row.id}/icon?v=${encodeURIComponent(version)}`
    : null;
}
const PREVIEW_CHARS = 120;

export function preview(text: string): string {
  // Never cuts an emoji in half: a lone surrogate is refused in jsonb, and
  // would fail the whole chat push.
  return clampText(text.replace(/\s+/g, " ").trim(), PREVIEW_CHARS);
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

/** The quoted message's first file, for the quote's label and thumbnail. */
function replyMedia(row: MessageRow) {
  const files =
    row.reply_deleted_at === null ? (row.reply_attachments ?? []) : [];
  const first = files[0];
  if (!first) return {};
  return {
    media: {
      kind: first.kind,
      url: chatUploadUrl(first.id),
      name: first.name,
      durationMs: first.durationMs ?? null,
      count: files.length,
    },
  };
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
            ...replyMedia(row),
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
