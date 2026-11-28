import assert from "node:assert/strict";
import { test } from "node:test";

import { chatTokenExpiry } from "./chat.direct-links.ts";

const HOUR = 60 * 60;
const ANA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";

void test("a chat token has 6 to 12 hours left when handed out", () => {
  const start = 1_800_000_000;
  for (let now = start; now < start + 24 * HOUR; now += 7 * 60) {
    const left = chatTokenExpiry(ANA, now) - now;
    assert.ok(left > 6 * HOUR && left <= 12 * HOUR, `left ${left}s`);
  }
});

void test("one person gets the same link for a while, so the browser keeps it", () => {
  const now = 1_800_000_000;
  const expiry = chatTokenExpiry(ANA, now);
  let same = 0;
  for (let t = now; t < now + 6 * HOUR; t += 60) {
    if (chatTokenExpiry(ANA, t) === expiry) same += 1;
  }
  // It changes once at most in six hours.
  assert.ok(same > 0);
  const changes = new Set(
    Array.from({ length: 6 * 60 }, (_, i) =>
      chatTokenExpiry(ANA, now + i * 60),
    ),
  );
  assert.ok(changes.size <= 2);
});

void test("two people get different tokens for the same file", () => {
  // The CDN binds a token to the first client that uses it.
  const now = 1_800_000_000;
  assert.notEqual(chatTokenExpiry(ANA, now), chatTokenExpiry(BEN, now));
});
