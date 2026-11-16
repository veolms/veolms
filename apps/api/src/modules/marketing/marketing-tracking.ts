import crypto from "node:crypto";

import { config } from "../../config.ts";
import { apiBaseUrl } from "../notifications/email-unsubscribe.ts";

/**
 * Open and click tracking for marketing emails (creator-features/34 §3).
 *
 * A token names the email, the person and, for a click, the block whose
 * link was clicked — never the address itself, so a token cannot be made
 * to send anyone elsewhere. It is signed so nobody can mark someone
 * else's email as opened, and needs no sign-in.
 */

export type TrackingKind = "open" | "click";

export interface TrackingClaims {
  kind: TrackingKind;
  emailId: string;
  userId: string;
  /** The block's place in the email (clicks only). */
  blockIndex: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function signature(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", `marketing-tracking:${secret}`)
    .update(payload)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
}

export function createTrackingToken(
  claims: TrackingClaims,
  secret: string = config.SESSION_SECRET,
): string {
  const payload = Buffer.from(
    `${claims.kind === "open" ? "o" : "c"}.${claims.emailId}.${claims.userId}.${claims.blockIndex}`,
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function readTrackingToken(
  token: string,
  secret: string = config.SESSION_SECRET,
): TrackingClaims | null {
  const [payload, signed, extra] = token.split(".");
  if (!payload || !signed || extra !== undefined) return null;
  const expected = signature(payload, secret);
  if (
    signed.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expected))
  ) {
    return null;
  }
  const fields = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (fields.length !== 4) return null;
  const [kind, emailId, userId, indexText] = fields as [
    string,
    string,
    string,
    string,
  ];
  const blockIndex = Number(indexText);
  if (
    (kind !== "o" && kind !== "c") ||
    !UUID.test(emailId) ||
    !UUID.test(userId) ||
    !Number.isInteger(blockIndex) ||
    blockIndex < 0 ||
    blockIndex > 1000
  ) {
    return null;
  }
  return { kind: kind === "o" ? "open" : "click", emailId, userId, blockIndex };
}

export function openPixelUrl(emailId: string, userId: string): string {
  return `${apiBaseUrl()}/v1/email/o/${createTrackingToken({ kind: "open", emailId, userId, blockIndex: 0 })}`;
}

export function clickUrl(
  emailId: string,
  userId: string,
  blockIndex: number,
): string {
  return `${apiBaseUrl()}/v1/email/c/${createTrackingToken({ kind: "click", emailId, userId, blockIndex })}`;
}

/** A transparent 1×1 GIF. */
export const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
