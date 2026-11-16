import crypto from "node:crypto";

import {
  isOptionalNotificationGroup,
  OPTIONAL_NOTIFICATION_GROUP_LABELS,
  optionalNotificationGroupOf,
  type OptionalNotificationGroup,
} from "@veolms/contracts";
import { escapeHtml, type EmailContent } from "@veolms/services/email";

import { config } from "../../config.ts";

/**
 * One-click unsubscribe, as Gmail and Yahoo require of anyone sending
 * notices to many people (RFC 8058).
 *
 * Every optional notification email carries a `List-Unsubscribe` header
 * and a footer link to `/v1/email/unsubscribe/<token>`. The token names the
 * recipient and the group of emails (course updates, reminders, ...) and is
 * signed, so nobody can turn off someone else's mail by guessing, and it
 * needs no sign-in: the person acting is holding the email, which is proof
 * enough for turning a kind of email off (and only off).
 */

/** Long enough for an old email in an inbox; short enough to limit a leak. */
export const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface UnsubscribeClaims {
  userId: string;
  group: OptionalNotificationGroup;
  /** Seconds since the epoch. */
  expiresAt: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return base64url(
    crypto.createHmac("sha256", secret).update(payload).digest(),
  );
}

export function createUnsubscribeToken(
  claims: UnsubscribeClaims,
  secret: string,
): string {
  const payload = base64url(
    `${claims.userId}.${claims.group}.${claims.expiresAt}`,
  );
  return `${payload}.${sign(payload, secret)}`;
}

/** The claims of a valid, unexpired token, or null. */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): UnsubscribeClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const expected = sign(payload, secret);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const fields = decoded.split(".");
  if (fields.length !== 3) return null;
  const [userId, group, expiresAtText] = fields as [string, string, string];
  const expiresAt = Number(expiresAtText);
  if (
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    !isOptionalNotificationGroup(group) ||
    !Number.isInteger(expiresAt) ||
    expiresAt * 1000 <= now.getTime()
  ) {
    return null;
  }
  return { userId, group, expiresAt };
}

function unsubscribeSecret(): string {
  return config.SESSION_SECRET;
}

/** Where the API answers, for links that must reach the API itself. */
function apiBaseUrl(): string {
  const base =
    config.EMAIL_API_URL ?? new URL("/api", config.WEB_URL).toString();
  return base.replace(/\/+$/, "");
}

/**
 * The unsubscribe link for one recipient and one notification type, or null
 * when the type cannot be turned off (security and moderation notices).
 */
export function unsubscribeUrlFor(
  userId: string,
  notificationType: string,
  now: Date = new Date(),
): string | null {
  const group = optionalNotificationGroupOf(notificationType);
  if (!group) return null;
  const token = createUnsubscribeToken(
    {
      userId,
      group,
      expiresAt:
        Math.floor(now.getTime() / 1000) + UNSUBSCRIBE_TOKEN_TTL_SECONDS,
    },
    unsubscribeSecret(),
  );
  return `${apiBaseUrl()}/v1/email/unsubscribe/${token}`;
}

export function readUnsubscribeToken(
  token: string,
  now: Date = new Date(),
): UnsubscribeClaims | null {
  return verifyUnsubscribeToken(token, unsubscribeSecret(), now);
}

/**
 * The headers Gmail and Yahoo look for. `List-Unsubscribe-Post` makes the
 * https link a one-click action: the mail client POSTs to it without
 * showing a page.
 */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function unsubscribeGroupLabel(
  group: OptionalNotificationGroup,
): string {
  return OPTIONAL_NOTIFICATION_GROUP_LABELS[group];
}

/**
 * The small page behind the footer link. `state` "ask" shows the group and
 * a button that POSTs to the same address; "done" confirms; "invalid" says
 * the link is old or broken and points to the settings page instead.
 */
export function renderUnsubscribePage(input: {
  academyName: string;
  state: "ask" | "done" | "invalid";
  groupLabel?: string;
  settingsUrl: string;
}): string {
  const name = escapeHtml(input.academyName);
  const settings = escapeHtml(input.settingsUrl);
  const group = input.groupLabel ? escapeHtml(input.groupLabel) : "these";
  const body =
    input.state === "ask"
      ? `<h1>Stop receiving ${group} emails?</h1>
<p>You will no longer get ${group} emails from ${name}. Security and purchase receipts are not affected.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>
<p class="small">Changed your mind later? Turn them back on in your <a href="${settings}">notification settings</a>.</p>`
      : input.state === "done"
        ? `<h1>You're unsubscribed</h1>
<p>${name} will not send you ${group} emails any more.</p>
<p class="small">You can turn them back on any time in your <a href="${settings}">notification settings</a>.</p>`
        : `<h1>This link has expired</h1>
<p>Open your <a href="${settings}">notification settings</a> to choose which emails you receive.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${name} emails</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1f2328;margin:0;padding:40px 16px}
main{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 12px}p{line-height:1.5;margin:0 0 16px}
button{background:#1f2328;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;cursor:pointer}
.small{font-size:13px;color:#636c76}a{color:#0969da}
</style></head><body><main>${body}</main></body></html>`;
}

/** The rendered email with an "Unsubscribe" line after the settings line. */
export function withUnsubscribeFooter(
  content: EmailContent,
  url: string | null,
): EmailContent {
  if (!url) return content;
  const link = `<p style="margin-top: 8px; font-size: 12px; color: #777;"><a href="${escapeHtml(url)}" style="color: #777;">Unsubscribe from these emails</a></p>`;
  const closing = ["</body>", "</div>"]
    .map((tag) => ({ tag, index: content.html.lastIndexOf(tag) }))
    .find((candidate) => candidate.index !== -1);
  const html = closing
    ? content.html.slice(0, closing.index) +
      link +
      content.html.slice(closing.index)
    : content.html + link;
  return {
    ...content,
    text: `${content.text}\nUnsubscribe from these emails: ${url}`,
    html,
  };
}
