import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { z } from "zod";

import type {
  ChatMessagePush,
  ChatPushSource,
} from "../../notifications/index.ts";
import { createChatAccess } from "../shared/chat.access.ts";
import { preview } from "../shared/chat.presenters.ts";
import { createChatRepository } from "../shared/chat.repository.ts";

/**
 * Who gets a phone push for a chat message, and what it says, by the
 * chat's own rules (WhatsApp-like):
 *
 * - everyone in the chat but the sender, unless they muted it (a chat set
 *   to "mentions" pushes only when they are mentioned), already read it on
 *   another device, blocked the sender, or left;
 * - groups larger than CHAT_PUSH_GROUP_MAX_MEMBERS push only mentions and
 *   @everyone, so one message cannot wake thousands of phones;
 * - deleted and system messages, and declined private chats, push nothing.
 *
 * Read when the push is queued (seconds after sending), so a message read
 * or deleted meanwhile is not pushed.
 */

export const chatMessageSentEventSchema = z.object({
  roomId: z.uuid(),
  messageId: z.uuid(),
  seq: z.number().int().positive(),
  senderId: z.uuid(),
  /**
   * A reaction, not a message: `senderId` reacted with `emoji` to the
   * message, and only its author hears ("Reacted 👍 to: …", WhatsApp).
   */
  reaction: z.object({ emoji: z.string().min(1).max(32) }).optional(),
});

export type ChatMessageSentEvent = z.infer<typeof chatMessageSentEventSchema>;

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Video",
  audio: "🎤 Voice message",
  file: "📄 Document",
};

/** The one line a push shows for a message. */
export function messagePushText(
  body: string,
  attachments: readonly { kind: string }[],
): string {
  const text = preview(body);
  const first = attachments[0];
  if (!first) return text;
  const label =
    attachments.length > 1 && attachments.every((a) => a.kind === first.kind)
      ? `${ATTACHMENT_LABELS[first.kind] ?? "📎 File"} ×${attachments.length}`
      : (ATTACHMENT_LABELS[first.kind] ?? "📎 File");
  return text ? `${label.split(" ")[0]} ${text}` : label;
}

export function createChatPushSource({
  database,
  groupMaxMembers,
}: {
  database: Kysely<Database>;
  groupMaxMembers: number;
}): ChatPushSource {
  const repository = createChatRepository();
  const access = createChatAccess(repository);

  async function resolveMessagePush(
    payload: unknown,
  ): Promise<ChatMessagePush | null> {
    const event = chatMessageSentEventSchema.parse(payload);
    const room = await repository.findRoom(database, event.roomId);
    if (!room || room.status === "archived") return null;
    if (room.kind === "direct" && room.direct_status === "declined") {
      return null;
    }

    const message = await repository.findMessage(
      database,
      event.roomId,
      event.seq,
    );
    if (
      !message ||
      message.id !== event.messageId ||
      message.kind !== "text" ||
      message.deleted_at
    ) {
      return null;
    }

    const recipients = event.reaction
      ? await repository.reactionPushRecipient(database, {
          roomId: room.id,
          seq: event.seq,
          reactorId: event.senderId,
        })
      : await repository.listPushRecipients(database, {
          roomId: room.id,
          seq: event.seq,
          senderId: event.senderId,
          mentionsOnly:
            room.kind !== "direct" &&
            (await repository.countActiveMembers(database, room.id)) >
              groupMaxMembers,
        });
    if (recipients.length === 0) return null;

    let senderName =
      message.sender_deleted || !message.sender_name
        ? "Deleted user"
        : message.sender_name;
    let text = messagePushText(message.body, message.attachments ?? []);
    if (event.reaction) {
      const [reactor] = await repository.getPeople(database, [event.senderId]);
      if (!reactor || reactor.is_deleted) return null;
      senderName = reactor.display_name;
      text = `Reacted ${event.reaction.emoji} to: ${text || "your message"}`;
    }
    const roomTitle =
      room.kind === "direct"
        ? senderName
        : room.kind === "course" && room.course_id
          ? ((await access.courseGate(database, room.course_id))?.title ??
            room.title ??
            "Group")
          : (room.title ?? "Group");

    return {
      roomId: room.id,
      roomKind: room.kind as ChatMessagePush["roomKind"],
      roomTitle,
      messageId: message.id,
      seq: event.seq,
      senderId: event.senderId,
      senderName,
      text,
      sentAt: event.reaction ? new Date() : message.created_at,
      isRequest: room.kind === "direct" && room.direct_status === "requested",
      recipients,
    };
  }

  return { resolveMessagePush };
}
