import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createUnsubscribeToken,
  renderUnsubscribePage,
  unsubscribeHeaders,
  verifyUnsubscribeToken,
} from "./email-unsubscribe.ts";

const secret = "a-test-secret-that-is-long-enough-for-hmac";
const userId = "3f2a9c1e-8b7d-4e6f-a5c4-1b2d3e4f5a6b";
const now = new Date("2026-11-10T10:00:00Z");
const inAWeek = Math.floor(now.getTime() / 1000) + 7 * 24 * 60 * 60;

await test("a token names its recipient and group and reads back", () => {
  const token = createUnsubscribeToken(
    { userId, group: "courseUpdates", expiresAt: inAWeek },
    secret,
  );
  assert.deepEqual(verifyUnsubscribeToken(token, secret, now), {
    userId,
    group: "courseUpdates",
    expiresAt: inAWeek,
  });
});

await test("a tampered token, another secret or an unknown group is refused", () => {
  const token = createUnsubscribeToken(
    { userId, group: "reminders", expiresAt: inAWeek },
    secret,
  );
  const [payload, signature] = token.split(".") as [string, string];
  assert.equal(verifyUnsubscribeToken(token, "another-secret", now), null);
  assert.equal(
    verifyUnsubscribeToken(`${payload}x.${signature}`, secret, now),
    null,
  );
  const forged = Buffer.from(`${userId}.everything.${inAWeek}`).toString(
    "base64url",
  );
  assert.equal(
    verifyUnsubscribeToken(`${forged}.${signature}`, secret, now),
    null,
  );
  assert.equal(verifyUnsubscribeToken("not-a-token", secret, now), null);
});

await test("an expired token is refused", () => {
  const token = createUnsubscribeToken(
    { userId, group: "reminders", expiresAt: inAWeek },
    secret,
  );
  const later = new Date((inAWeek + 1) * 1000);
  assert.equal(verifyUnsubscribeToken(token, secret, later), null);
});

await test("the headers are the RFC 8058 one-click pair", () => {
  const headers = unsubscribeHeaders(
    "https://api.example.com/v1/email/unsubscribe/abc.def",
  );
  assert.deepEqual(headers, {
    "List-Unsubscribe":
      "<https://api.example.com/v1/email/unsubscribe/abc.def>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

await test("the page escapes what it shows and offers the settings page", () => {
  const html = renderUnsubscribePage({
    academyName: "Rock & Code <Academy>",
    state: "ask",
    groupLabel: "Learning reminders",
    settingsUrl: "https://example.com/settings/notifications",
  });
  assert.match(html, /Rock &amp; Code &lt;Academy&gt;/);
  assert.match(html, /<form method="post">/);
  assert.match(html, /settings\/notifications/);
  assert.doesNotMatch(html, /<Academy>/);
});
