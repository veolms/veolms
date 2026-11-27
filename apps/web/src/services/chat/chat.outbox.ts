import type { QueryClient } from "@tanstack/react-query";
import {
  isStorageErrorCode,
  type ChatAttachment,
  type ChatMessage,
  type ChatRoomDetail,
  type ChatUploadKind,
  type StorageErrorCode,
} from "@veolms/contracts";

import { getApiError } from "../../lib/api-error";
import { storageKeys } from "../storage";
import { applyMessages, applyToRoomList, markRoomRead } from "./chat.cache";
import { chatKeys } from "./chat.keys";
import { chatService } from "./chat.service";
import { getChatPrefs } from "../../store/chatPrefs.store";
import type { SendQuality } from "../../chat/mediaQuality";
import { sentPop } from "./chat.sounds";

/**
 * Messages on their way (WhatsApp's clock icon). A message shows at once;
 * its files upload with progress, then it is sent with a client id, so a
 * retry after a network failure is never stored twice. Messages of one
 * chat go out in order. This is local UI state for things the server does
 * not have yet; once sent, the message lives in the query cache.
 */

export interface OutgoingFile {
  localId: string;
  file: Blob;
  kind: ChatUploadKind;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  waveform?: number[];
  /** A local preview (object URL) for photos and videos. */
  previewUrl: string | null;
  progress: number;
  attachment: ChatAttachment | null;
  /** The file as picked; `file` becomes the copy sent (Standard / HD). */
  original?: Blob;
  /** Done making the copy to send (kept across a retry). */
  prepared?: boolean;
  /** 0–1 while the copy to send is being made (a video takes a while). */
  preparing?: number;
}

export interface OutgoingMessage {
  clientId: string;
  roomId: string;
  body: string;
  replyTo: {
    seq: number;
    senderName: string | null;
    preview: string;
    media?: NonNullable<ChatMessage["replyTo"]>["media"];
    /**
     * A reply to a message still on its way (no number yet): it is sent
     * after that one, with that one's number.
     */
    clientId?: string;
    /** "Reply privately": the group the quoted message is in. */
    roomId?: string;
    roomName?: string | null;
  } | null;
  mentions: string[];
  mentionAll: boolean;
  files: OutgoingFile[];
  /** How photos, videos and audio go: smaller (Standard) or HD. */
  quality?: SendQuality;
  status: "sending" | "failed";
  error: string | null;
  /**
   * Why it failed, when it was the sender's storage space (full, or uploads
   * turned off): the message then offers "Request more space".
   */
  errorCode?: StorageErrorCode | null;
  createdAt: string;
}

const outbox = new Map<string, OutgoingMessage[]>();
const listeners = new Set<() => void>();
const running = new Set<string>();
let snapshot = new Map<string, OutgoingMessage[]>();

function publish() {
  snapshot = new Map([...outbox].map(([roomId, list]) => [roomId, [...list]]));
  for (const listener of listeners) listener();
}

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutboxSnapshot() {
  return snapshot;
}

function update(
  roomId: string,
  clientId: string,
  change: Partial<OutgoingMessage>,
) {
  const list = outbox.get(roomId);
  const index = list?.findIndex((m) => m.clientId === clientId) ?? -1;
  if (!list || index < 0) return;
  list[index] = { ...list[index]!, ...change };
  publish();
}

function remove(roomId: string, clientId: string) {
  const list = outbox.get(roomId);
  if (!list) return;
  const message = list.find((m) => m.clientId === clientId);
  // This browser's copies are let go a while later: a photo just sent may
  // still be open in the viewer (it showed broken when let go at once).
  const previews = (message?.files ?? [])
    .map((file) => file.previewUrl)
    .filter((url): url is string => Boolean(url));
  if (previews.length > 0) {
    setTimeout(() => {
      for (const url of previews) URL.revokeObjectURL(url);
    }, 5 * 60_000);
  }
  outbox.set(
    roomId,
    list.filter((m) => m.clientId !== clientId),
  );
  publish();
}

async function uploadFile(
  roomId: string,
  message: OutgoingMessage,
  file: OutgoingFile,
): Promise<ChatAttachment> {
  if (file.attachment) return file.attachment;
  if (!file.prepared) {
    // The copy to send: a smaller one in Standard (made here, in the
    // browser), or the original. Kept, so a retry doesn't make it again.
    const { prepareForSending } = await import("../../chat/mediaQuality");
    file.original ??= file.file;
    const ready = await prepareForSending(
      file,
      message.quality ?? "standard",
      (fraction) => {
        file.preparing = fraction;
        update(roomId, message.clientId, { files: [...message.files] });
      },
    ).catch(() => null);
    if (ready) Object.assign(file, ready);
    file.prepared = true;
    file.preparing = undefined;
    update(roomId, message.clientId, { files: [...message.files] });
  }
  const start = await chatService.startUpload(roomId, {
    kind: file.kind,
    name: file.name,
    mimeType: file.mimeType,
    size: file.file.size,
    ...(file.width ? { width: file.width } : {}),
    ...(file.height ? { height: file.height } : {}),
    ...(file.durationMs !== undefined ? { durationMs: file.durationMs } : {}),
    ...(file.waveform ? { waveform: file.waveform } : {}),
  });
  await chatService.putFile(start, file.file, (fraction) => {
    file.progress = fraction;
    update(roomId, message.clientId, { files: [...message.files] });
  });
  const { attachment } = await chatService.completeUpload(
    start.uploadId,
    start.multipart?.storageUploadId,
  );
  file.attachment = attachment;
  file.progress = 1;
  return attachment;
}

/**
 * Your first message of a request (a private chat they have not accepted):
 * the box closes until they answer, without a reload, as the server will
 * refuse a second one.
 */
function markRequestPending(
  client: QueryClient,
  roomId: string,
  viewerId: string | null,
) {
  const key = chatKeys.room(roomId);
  const room = client.getQueryData<ChatRoomDetail>(key);
  if (
    !room ||
    !viewerId ||
    room.kind !== "direct" ||
    room.directStatus !== "requested" ||
    !room.requestedByMe ||
    room.me.cannotPostReason === "request_pending"
  ) {
    return;
  }
  client.setQueryData<ChatRoomDetail>(key, {
    ...room,
    me: { ...room.me, canPost: false, cannotPostReason: "request_pending" },
  });
  void client.invalidateQueries({ queryKey: key });
}

/** Numbers of messages this tab sent, by their client id (replies to them). */
const sentSeqs = new Map<string, number>();

/** The number to quote: the message's own, or once it has been sent. */
function replySeq(
  roomId: string,
  replyTo: NonNullable<OutgoingMessage["replyTo"]>,
): number | "waiting" | null {
  if (replyTo.seq > 0) return replyTo.seq;
  if (!replyTo.clientId) return null;
  const sent = sentSeqs.get(replyTo.clientId);
  if (sent) return sent;
  // Still in the queue (sending or not sent): this reply waits for it.
  return outbox.get(roomId)?.some((m) => m.clientId === replyTo.clientId)
    ? "waiting"
    : null;
}

/**
 * What a learner reads under a message that did not go: never a code or a
 * server's own words ("Upload failed (403)", a schema error).
 */
function sendErrorText(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "NotReadableError" || error.name === "NotFoundError")
  ) {
    return "This file can’t be read any more. Discard it and pick it again.";
  }
  if (error instanceof Error && error.message.startsWith("Upload failed")) {
    return "Couldn’t upload. Check your connection and tap Retry.";
  }
  if (error instanceof Error && error.message.startsWith("Not sent:")) {
    return error.message;
  }
  return getApiError(error).message;
}

async function deliver(
  client: QueryClient,
  viewerId: string | null,
  roomId: string,
) {
  if (running.has(roomId)) return;
  running.add(roomId);
  /** Failed messages sent again ahead of a reply to them, this round. */
  const retriedFirst = new Set<string>();
  try {
    for (;;) {
      const next = outbox.get(roomId)?.find((m) => m.status === "sending");
      if (!next) break;
      try {
        const quoted = next.replyTo ? replySeq(roomId, next.replyTo) : null;
        if (quoted === "waiting") {
          // The message it replies to did not go (it failed): that one is
          // sent again first, once, then this one follows it.
          const first = next.replyTo?.clientId;
          if (first && !retriedFirst.has(first)) {
            retriedFirst.add(first);
            update(roomId, first, {
              status: "sending",
              error: null,
              errorCode: null,
            });
            continue;
          }
          throw new Error(
            "Not sent: the message you replied to didn’t send. Tap Retry.",
          );
        }
        const attachments: ChatAttachment[] = [];
        for (const file of next.files) {
          attachments.push(await uploadFile(roomId, next, file));
        }
        // Deleted (discarded) while its files went up: not sent after all.
        if (!outbox.get(roomId)?.some((m) => m.clientId === next.clientId)) {
          continue;
        }
        const { message } = await chatService.send(roomId, {
          clientId: next.clientId,
          body: next.body,
          ...(quoted ? { replyToSeq: quoted } : {}),
          ...(quoted && next.replyTo?.roomId
            ? { replyToRoomId: next.replyTo.roomId }
            : {}),
          ...(next.mentions.length > 0 ? { mentions: next.mentions } : {}),
          ...(next.mentionAll ? { mentionAll: true } : {}),
          ...(attachments.length > 0
            ? { attachmentIds: attachments.map((a) => a.id) }
            : {}),
        });
        sentSeqs.set(next.clientId, message.seq);
        markRequestPending(client, roomId, viewerId);
        applyMessages(client, roomId, [message]);
        applyToRoomList(client, message, { viewerId, isNew: true, open: true });
        markRoomRead(client, roomId, message.seq);
        remove(roomId, next.clientId);
        if (getChatPrefs().sentSound) sentPop();
      } catch (error) {
        const code = getApiError(error).code;
        const storageCode = isStorageErrorCode(code) ? code : null;
        // Fresh numbers (and any request already sent) for its notice.
        if (storageCode) {
          void client.invalidateQueries({ queryKey: storageKeys.mine() });
        }
        update(roomId, next.clientId, {
          status: "failed",
          error: sendErrorText(error),
          errorCode: storageCode,
        });
      }
    }
  } finally {
    running.delete(roomId);
  }
}

export function enqueueMessage(
  client: QueryClient,
  viewerId: string | null,
  draft: Omit<OutgoingMessage, "clientId" | "status" | "error" | "createdAt">,
) {
  const message: OutgoingMessage = {
    ...draft,
    clientId: crypto.randomUUID(),
    status: "sending",
    error: null,
    createdAt: new Date().toISOString(),
  };
  outbox.set(draft.roomId, [...(outbox.get(draft.roomId) ?? []), message]);
  publish();
  void deliver(client, viewerId, draft.roomId);
  return message.clientId;
}

/** "Not sent. Tap to retry" — same client id, so never sent twice. */
export function retryMessage(
  client: QueryClient,
  viewerId: string | null,
  roomId: string,
  clientId: string,
) {
  update(roomId, clientId, { status: "sending", error: null, errorCode: null });
  void deliver(client, viewerId, roomId);
}

export function discardMessage(roomId: string, clientId: string) {
  remove(roomId, clientId);
}
