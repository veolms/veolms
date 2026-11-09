import {
  ANDROID_PRIORITY_FOR_IMPORTANCE,
  type AndroidChannelImportance,
} from "@veolms/contracts";
import type { PushPlatform } from "@veolms/database";
import { z } from "zod";

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
  const data: Record<string, string> = {
    ...payload.data,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    androidChannelId: payload.androidChannelId,
  };

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
              title: payload.title,
              body: payload.body,
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
          alert: { title: payload.title, body: payload.body },
          sound: "default",
          "thread-id": payload.threadId,
          "mutable-content": 1,
        },
      },
    };
  }

  return { message };
}
