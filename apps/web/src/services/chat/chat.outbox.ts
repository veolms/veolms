import type { QueryClient } from "@tanstack/react-query";
import type { ChatAttachment, ChatUploadKind } from "@veolms/contracts";

import { getApiError } from "../../lib/api-error";
import { applyMessages, applyToRoomList, markRoomRead } from "./chat.cache";
import { chatService } from "./chat.service";
import { getChatPrefs } from "../../store/chatPrefs.store";
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
}

export interface OutgoingMessage {
  clientId: string;
  roomId: string;
  body: string;
  replyTo: { seq: number; senderName: string | null; preview: string } | null;
  mentions: string[];
  mentionAll: boolean;
  files: OutgoingFile[];
  status: "sending" | "failed";
  error: string | null;
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
  for (const file of message?.files ?? []) {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
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
  const { attachment } = await chatService.completeUpload(start.uploadId);
  file.attachment = attachment;
  file.progress = 1;
  return attachment;
}

async function deliver(
  client: QueryClient,
  viewerId: string | null,
  roomId: string,
) {
  if (running.has(roomId)) return;
  running.add(roomId);
  try {
    for (;;) {
      const next = outbox.get(roomId)?.find((m) => m.status === "sending");
      if (!next) break;
      try {
        const attachments: ChatAttachment[] = [];
        for (const file of next.files) {
          attachments.push(await uploadFile(roomId, next, file));
        }
        const { message } = await chatService.send(roomId, {
          clientId: next.clientId,
          body: next.body,
          ...(next.replyTo ? { replyToSeq: next.replyTo.seq } : {}),
          ...(next.mentions.length > 0 ? { mentions: next.mentions } : {}),
          ...(next.mentionAll ? { mentionAll: true } : {}),
          ...(attachments.length > 0
            ? { attachmentIds: attachments.map((a) => a.id) }
            : {}),
        });
        applyMessages(client, roomId, [message]);
        applyToRoomList(client, message, { viewerId, isNew: true, open: true });
        markRoomRead(client, roomId, message.seq);
        remove(roomId, next.clientId);
        if (getChatPrefs().sentSound) sentPop();
      } catch (error) {
        update(roomId, next.clientId, {
          status: "failed",
          error: getApiError(error).message,
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
  update(roomId, clientId, { status: "sending", error: null });
  void deliver(client, viewerId, roomId);
}

export function discardMessage(roomId: string, clientId: string) {
  remove(roomId, clientId);
}
