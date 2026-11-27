import { Readable } from "node:stream";

import type { ChatMessage, ChatUploadKind } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { createMessagesService } from "../messages/messages.service.ts";
import { encodeChatEvent } from "../realtime/chat-bus.ts";
import { directKey } from "../shared/chat.access.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import { presentMessage } from "../shared/chat.presenters.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import { createUploadsService } from "../uploads/uploads.service.ts";

function uploadKindOf(mimeType: string): ChatUploadKind {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "file";
}

function hasObjectStorage(): boolean {
  return Boolean(
    config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY,
  );
}

/**
 * What the assistant module may do in chat: open a person's private chat
 * with an assistant, read what people wrote there, and write, edit and
 * attach files as the assistant. Everything goes through chat's own rules
 * (the assistant is a real member of the chat); only the assistant's
 * exceptions (no edit window, staff-size files) live in chat itself.
 */
export function createChatAssistantBridge(
  app: FastifyInstance,
  database: Kysely<Database>,
  storage: S3StorageService,
) {
  const runtime = getChatRuntime(app, database);
  const { repository, access } = runtime;
  const messages = createMessagesService(runtime);
  const uploads = createUploadsService(runtime, messages, storage);

  return {
    canUseAssistant(userId: string) {
      return access.canUseAssistant(database, userId);
    },

    /**
     * The person's private chat with the assistant: created once (already
     * accepted, pinned for the person), reopened if they deleted it.
     */
    async openConversation(userId: string, assistantId: string) {
      const key = directKey(userId, assistantId);
      let room = await repository.findDirectRoom(database, key);
      let created = false;
      if (!room) {
        const inserted = await repository.insertRoom(database, {
          id: crypto.randomUUID(),
          kind: "direct",
          direct_key: key,
          direct_status: "accepted",
          requested_by: null,
          created_by: userId,
        });
        room =
          inserted.room ?? (await repository.findDirectRoom(database, key));
        created = inserted.created;
      }
      if (!room) throw ChatErrors.roomNotFound();
      await repository.ensureMembers(database, [
        { roomId: room.id, userId },
        { roomId: room.id, userId: assistantId },
      ]);
      const member = await repository.findMember(database, room.id, userId);
      if (member && (member.state !== "active" || member.deleted_at)) {
        await repository.updateMember(database, room.id, userId, {
          state: "active",
          deleted_at: null,
        });
      }
      if (created) {
        await repository.updateMember(database, room.id, userId, {
          pinned_at: new Date(),
        });
        try {
          await repository.publish(
            database,
            encodeChatEvent({
              type: "added",
              roomId: room.id,
              userIds: [userId],
            }),
          );
        } catch {
          // Best effort: the chat list catches up on its next load.
        }
      }
      return { roomId: room.id, created };
    },

    /** Newest message number per room. */
    async lastSeqs(roomIds: readonly string[]) {
      const rows = await repository.roomLastSeqs(database, roomIds);
      return new Map(rows.map((row) => [row.id, Number(row.last_seq)]));
    },

    /** Messages after `afterSeq`, oldest first, as everyone sees them. */
    async messagesAfter(
      roomId: string,
      afterSeq: number,
      limit: number,
    ): Promise<ChatMessage[]> {
      const page = await repository.listMessages(database, null, roomId, {
        mode: "after",
        seq: afterSeq,
        limit,
      });
      return page.rows.map((row) => presentMessage(row));
    },

    send(
      assistantId: string,
      roomId: string,
      input: {
        clientId: string;
        body: string;
        replyToSeq?: number | undefined;
        attachmentIds?: string[] | undefined;
      },
    ) {
      return messages.send(assistantId, roomId, {
        clientId: input.clientId,
        body: input.body,
        ...(input.replyToSeq !== undefined
          ? { replyToSeq: input.replyToSeq }
          : {}),
        ...(input.attachmentIds ? { attachmentIds: input.attachmentIds } : {}),
      });
    },

    edit(assistantId: string, roomId: string, seq: number, body: string) {
      return messages.edit(assistantId, roomId, seq, body);
    },

    /** Stores a file as the assistant's upload in this chat, ready to attach. */
    async uploadFile(
      assistantId: string,
      roomId: string,
      file: { name: string; mimeType: string; bytes: Buffer },
    ) {
      const mimeType = file.mimeType.split(";")[0]!.trim().toLowerCase();
      const created = await uploads.create(assistantId, roomId, {
        kind: uploadKindOf(mimeType),
        name: file.name,
        mimeType,
        size: file.bytes.length,
      });
      if (hasObjectStorage()) {
        const row = await repository.findUpload(database, created.uploadId);
        if (!row) throw ChatErrors.uploadNotFound();
        await storage.putObject(
          row.storage_key,
          file.bytes,
          mimeType,
          file.bytes.length,
        );
      } else {
        await uploads.putContent(
          assistantId,
          created.uploadId,
          Readable.from(file.bytes),
        );
      }
      await uploads.complete(assistantId, created.uploadId);
      return { uploadId: created.uploadId };
    },

    /** A file someone attached in this chat, read as the assistant. */
    async readFile(assistantId: string, roomId: string, uploadId: string) {
      const row = await repository.findUpload(database, uploadId);
      if (!row || row.room_id !== roomId) throw ChatErrors.uploadNotFound();
      return uploads.read(assistantId, uploadId, true);
    },
  };
}

export type ChatAssistantBridge = ReturnType<typeof createChatAssistantBridge>;
