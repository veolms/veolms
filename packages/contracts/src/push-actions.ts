import { z } from "zod";

import { CHAT_BODY_MAX_CHARS } from "./chat.ts";

/**
 * Push actions: "Reply" and "Mark as read" from a chat notification on the
 * phone. The app's native code calls these with the single-use token from
 * the chat push (`actionToken` in its data), in the header
 * `Authorization: PushAction pat_...`, never with the session cookie.
 * See docs/mobile-push.md, "Reply from a notification".
 */

/** The scheme of the Authorization header. */
export const PUSH_ACTION_AUTH_SCHEME = "PushAction";
/** Every token starts with this, so leaks are easy to find and redact. */
export const PUSH_ACTION_TOKEN_PREFIX = "pat_";

/** Chat push data keys (strings, like every Firebase data value). */
export const PUSH_ACTION_DATA_KEYS = {
  token: "actionToken",
  expiresAt: "actionTokenExpiresAt",
} as const;

export const PUSH_ACTION_ERROR_CODES = {
  /** Unknown, used, revoked, the wrong action, or the phone is gone. */
  invalid: "PUSH_ACTION_INVALID",
  expired: "PUSH_ACTION_EXPIRED",
  /** The phone's login was signed out or ran out: sign in to reply. */
  signedOut: "PUSH_ACTION_SIGNED_OUT",
  /** The chat was read here or elsewhere since the push. */
  stale: "PUSH_ACTION_STALE",
} as const;

export const pushActionReplyRequestSchema = z.strictObject({
  /** The same id on a retry: the message is sent once. */
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(CHAT_BODY_MAX_CHARS),
});

export const pushActionReplyResponseSchema = z.strictObject({
  message: z.strictObject({
    seq: z.number().int(),
    sentAt: z.string(),
  }),
  /** For the next reply from the same notification. */
  nextToken: z.string(),
  nextTokenExpiresAt: z.string(),
});

export const pushActionReadResponseSchema = z.strictObject({
  readSeq: z.number().int(),
});

export type PushActionReplyRequest = z.infer<
  typeof pushActionReplyRequestSchema
>;
export type PushActionReplyResponse = z.infer<
  typeof pushActionReplyResponseSchema
>;
export type PushActionReadResponse = z.infer<
  typeof pushActionReadResponseSchema
>;
