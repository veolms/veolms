import {
  ANDROID_PRIORITY_FOR_IMPORTANCE,
  type AndroidChannelImportance,
} from "@veolms/contracts";
import type { PushPlatform } from "@veolms/database";
import { z } from "zod";

import { clampText } from "../../../lib/text.ts";

/**
 * What a queued push says (push_deliveries.payload), and how it becomes one
 * Firebase HTTP v1 message for one install.
 *
 * Android: notifications are "notification" messages the system shows even
 * when the app is not running, on the named channel, with the Android 7.x
 * priority beside it. Chat messages are data-only: the app draws them
 * (grouped per chat, WhatsApp-style) from `data`.
 * iOS: always an alert, stacked per `threadId`.
 */

const importanceSchema = z.enum(["HIGH", "DEFAULT", "LOW", "MIN"]);

export const pushPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.enum(["notification", "chat_message"]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  androidChannelId: z.string().min(1).max(100),
  importance: importanceSchema,
  collapseKey: z.string().min(1).max(100).nullable(),
  threadId: z.string().min(1).max(200),
  androidDataOnly: z.boolean(),
  /** Everything the app needs, as strings (Firebase data values are strings). */
  data: z.record(z.string(), z.string()),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;
export type PushImportance = AndroidChannelImportance;

export type PushTargetField = "fid" | "token";

/**
 * FCM refuses a message whose data and notification text pass 4096 bytes
 * (and does not retry it). This leaves room for the keys and the rest.
 */
const FCM_TEXT_BYTE_BUDGET = 3_600;

/**
 * The title, body and `data` of one FCM message, cut to fit FCM's limit.
 * Chat messages are drawn by the app from `data`, so they carry the text
 * there; ordinary notifications carry it only in the notification block,
 * which the app reads. Long text is cut by characters, longest first, then
 * checked in bytes again (non-Latin scripts take 3 bytes a character).
 */
function fitFcmBudget(
  payload: PushPayload,
  textOutsideData: boolean,
): { title: string; body: string; data: Record<string, string> } {
  const chat = payload.kind === "chat_message";
  const text: Record<string, string> = {
    title: payload.title,
    body: payload.body,
  };
  if (chat) {
    for (const key of ["text", "roomTitle", "senderName"]) {
      const value = payload.data[key];
      if (value !== undefined) text[key] = value;
    }
  }
  const assemble = () => ({
    title: text.title!,
    body: text.body!,
    data: {
      ...payload.data,
      ...(chat ? { ...text, androidChannelId: payload.androidChannelId } : {}),
      kind: payload.kind,
    },
  });
  const bytes = (fitted: ReturnType<typeof assemble>) =>
    Buffer.byteLength(JSON.stringify(fitted.data), "utf8") +
    (textOutsideData
      ? Buffer.byteLength(fitted.title + fitted.body, "utf8")
      : 0);

  let fitted = assemble();
  let over = bytes(fitted) - FCM_TEXT_BYTE_BUDGET;
  while (over > 0) {
    const longest = Object.keys(text)
      .filter((key) => text[key]!.length > 2)
      .sort((a, b) => text[b]!.length - text[a]!.length)[0];
    if (!longest) break;
    const value = text[longest]!;
    // Each character cut frees at least one byte.
    text[longest] = clampText(value, Math.max(2, value.length - over));
    fitted = assemble();
    over = bytes(fitted) - FCM_TEXT_BYTE_BUDGET;
  }
  return fitted;
}

/** The JSON body of one HTTP v1 send: `{ message }`. */
export function buildFcmMessage(input: {
  payload: PushPayload;
  fid: string;
  platform: PushPlatform;
  targetField: PushTargetField;
  expiresAt: Date;
  now: Date;
}): { message: Record<string, unknown> } {
  const { payload } = input;
  const ttlSeconds = Math.max(
    0,
    Math.floor((input.expiresAt.getTime() - input.now.getTime()) / 1000),
  );
  const urgent = payload.importance === "HIGH";
  const { title, body, data } = fitFcmBudget(
    payload,
    // Shown by the system: the text travels outside `data` too.
    input.platform === "ios" || !payload.androidDataOnly,
  );

  const message: Record<string, unknown> = {
    [input.targetField]: input.fid,
    data,
  };

  if (input.platform === "android") {
    message.android = {
      // Wakes the phone at once only for what pops up on screen; Android
      // may throttle apps that send high priority and show nothing.
      priority: urgent ? "HIGH" : "NORMAL",
      ttl: `${ttlSeconds}s`,
      ...(payload.collapseKey ? { collapse_key: payload.collapseKey } : {}),
      ...(payload.androidDataOnly
        ? {}
        : {
            notification: {
              title,
              body,
              channel_id: payload.androidChannelId,
              notification_priority:
                ANDROID_PRIORITY_FOR_IMPORTANCE[payload.importance],
              ...(payload.collapseKey ? { tag: payload.collapseKey } : {}),
            },
          }),
    };
  } else {
    message.apns = {
      headers: {
        "apns-priority": urgent ? "10" : "5",
        "apns-push-type": "alert",
        "apns-expiration": String(Math.floor(input.expiresAt.getTime() / 1000)),
        ...(payload.collapseKey
          ? { "apns-collapse-id": payload.collapseKey }
          : {}),
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          "thread-id": payload.threadId,
          "mutable-content": 1,
        },
      },
    };
  }

  return { message };
}

/** What the service worker gets (JSON, encrypted): small and flat. */
export interface WebPushMessage {
  v: 1;
  kind: PushPayload["kind"];
  title: string;
  body: string;
  /** One notification per chat: a newer message replaces it. */
  tag: string;
  /** Opened on click (an app path). */
  url: string;
  roomId?: string;
  roomKind?: string;
  seq?: number;
  senderName?: string;
  /** The message text alone (body has "Sender: " in groups). */
  text?: string;
  isMention?: boolean;
  unread?: number;
  sentAt?: string;
}

/** Room ids are UUIDs: without dashes, a Topic header (≤ 32 characters). */
function topicFor(roomId: string | undefined): string | undefined {
  const compact = roomId?.replace(/-/gu, "");
  return compact && /^[A-Za-z0-9_-]{1,32}$/u.test(compact)
    ? compact
    : undefined;
}

/** Leaves room for the JSON around it; the push service limit is ~4 KB. */
const WEB_PUSH_JSON_BUDGET = 3_000;

/**
 * The push for one browser: the JSON the service worker shows, how long
 * the push service keeps it, its urgency and topic (a chat's newer push
 * replaces an older one still waiting for an offline browser).
 */
export function buildWebPushMessage(input: {
  payload: PushPayload;
  expiresAt: Date;
  now: Date;
}): {
  json: string;
  ttlSeconds: number;
  urgency: "high" | "normal" | "low";
  topic: string | undefined;
} {
  const { payload } = input;
  const data = payload.data;
  const chat = payload.kind === "chat_message";
  const seq = Number(data.seq);
  const unread = Number(data.unreadCount);
  const message: WebPushMessage = {
    v: 1,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    tag: chat
      ? `chat:${data.roomId ?? ""}`
      : (payload.collapseKey ?? `notification:${data.notificationId ?? ""}`),
    url: data.deepLink || (chat ? `/chat/${data.roomId ?? ""}` : "/"),
    ...(chat
      ? {
          roomId: data.roomId,
          roomKind: data.roomKind,
          ...(Number.isFinite(seq) ? { seq } : {}),
          senderName: data.senderName,
          text: data.text,
          isMention: data.isMention === "true",
          ...(Number.isFinite(unread) ? { unread } : {}),
          sentAt: data.sentAt,
        }
      : {}),
  };
  let json = JSON.stringify(message);
  // Long text is cut (by characters, then checked in bytes: emoji and
  // non-Latin scripts take several bytes each).
  while (Buffer.byteLength(json, "utf8") > WEB_PUSH_JSON_BUDGET) {
    const over = Buffer.byteLength(json, "utf8") - WEB_PUSH_JSON_BUDGET;
    // clampText never cuts an emoji in half.
    const cut = (value: string | undefined) =>
      value === undefined
        ? undefined
        : clampText(value, Math.max(2, value.length - over));
    message.body = cut(message.body) ?? "";
    if (message.text !== undefined) message.text = cut(message.text);
    message.title = clampText(message.title, 120);
    json = JSON.stringify(message);
  }
  return {
    json,
    ttlSeconds: Math.max(
      0,
      Math.floor((input.expiresAt.getTime() - input.now.getTime()) / 1000),
    ),
    urgency:
      payload.importance === "HIGH"
        ? "high"
        : payload.importance === "DEFAULT"
          ? "normal"
          : "low",
    topic: chat ? topicFor(data.roomId) : undefined,
  };
}
