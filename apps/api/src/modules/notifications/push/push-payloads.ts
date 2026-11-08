import {
  ANDROID_FALLBACK_CHANNEL_ID,
  androidChannel,
  pushRouteFor,
} from "@veolms/contracts";
import type { Json } from "@veolms/database";

import type { ChatMessagePush } from "../notifications.types.ts";
import type { NewPushDelivery } from "./push-deliveries.repository.ts";
import type { PushPayload } from "./push-message.ts";

/** The push type for chat messages (preferences, PUSH_ROUTES). */
export const CHAT_MESSAGE_PUSH_TYPE = "chat.message";

function clip(text: string, max: number): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** Whether a notification of `type` is pushed at all. */
export function isPushedType(type: string): boolean {
  return pushRouteFor(type) !== undefined;
}

/** The queued push for one notification (shown as the bell item shows it). */
export function notificationPushDelivery(input: {
  notificationId: string;
  recipientUserId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  deepLink: string | null;
  now: Date;
}): NewPushDelivery | null {
  const route = pushRouteFor(input.type);
  if (!route) return null;
  const channel =
    androidChannel(route.androidChannelId) ??
    androidChannel(ANDROID_FALLBACK_CHANNEL_ID)!;
  const payload: PushPayload = {
    v: 1,
    kind: "notification",
    title: clip(input.title, 200) || "Notification",
    body: clip(input.body, 1000) || " ",
    androidChannelId: channel.id,
    importance: channel.importance,
    collapseKey: route.collapse ? input.type : null,
    threadId: channel.group ?? channel.id,
    androidDataOnly: false,
    data: {
      notificationId: input.notificationId,
      type: input.type,
      category: input.category,
      deepLink: input.deepLink ?? "",
    },
  };
  return {
    userId: input.recipientUserId,
    source: "notification",
    notificationId: input.notificationId,
    dedupeKey: `notification:${input.notificationId}`,
    payload: payload as unknown as Json,
    expiresAt: new Date(input.now.getTime() + route.ttlSeconds * 1000),
  };
}

/**
 * The queued pushes for one chat message, WhatsApp-style: Android gets a
 * data-only message the app draws itself (one notification per chat,
 * messages stacked under the sender's name, the chat's unread count); iOS
 * an alert stacked per chat. Groups read "Sender: text".
 */
export function chatPushDeliveries(
  message: ChatMessagePush,
  recipientUserIds: ReadonlySet<string>,
  now: Date,
): NewPushDelivery[] {
  const route = pushRouteFor(CHAT_MESSAGE_PUSH_TYPE)!;
  const channel = androidChannel(route.androidChannelId)!;
  const direct = message.roomKind === "direct";
  const expiresAt = new Date(now.getTime() + route.ttlSeconds * 1000);
  const text = clip(message.text, 500) || "New message";

  return message.recipients
    .filter((recipient) => recipientUserIds.has(recipient.userId))
    .map((recipient) => {
      const title = clip(
        direct
          ? message.isRequest
            ? `${message.senderName} (message request)`
            : message.senderName
          : message.roomTitle,
        200,
      );
      const payload: PushPayload = {
        v: 1,
        kind: "chat_message",
        title: title || "New message",
        body: direct ? text : clip(`${message.senderName}: ${text}`, 1000),
        androidChannelId: channel.id,
        importance: channel.importance,
        collapseKey: null,
        // iOS stacks a chat's messages together.
        threadId: `chat:${message.roomId}`,
        androidDataOnly: true,
        data: {
          roomId: message.roomId,
          roomKind: message.roomKind,
          roomTitle: clip(message.roomTitle, 200),
          messageId: message.messageId,
          seq: String(message.seq),
          senderId: message.senderId,
          senderName: clip(message.senderName, 200),
          text,
          sentAt: message.sentAt.toISOString(),
          isMention: String(recipient.isMention),
          isRequest: String(message.isRequest),
          unreadCount: String(Math.min(recipient.unreadCount, 99)),
          deepLink: `/chat/${message.roomId}?seq=${message.seq}`,
        },
      };
      return {
        userId: recipient.userId,
        source: "chat" as const,
        notificationId: null,
        dedupeKey: `chat:${message.messageId}:${recipient.userId}`,
        payload: payload as unknown as Json,
        expiresAt,
      };
    });
}
