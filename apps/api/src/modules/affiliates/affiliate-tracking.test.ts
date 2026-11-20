import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideAttribution,
  hashAddress,
  isBotUserAgent,
  normalizeAffiliateCode,
  normalizeLandingPath,
  referrerHost,
  type AttributionCandidate,
} from "./affiliate-tracking.ts";

const BUYER = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2026-11-20T12:00:00Z");
const LATER = new Date("2026-12-01T00:00:00Z");
const EARLIER = new Date("2026-11-01T00:00:00Z");

function candidate(
  id: string,
  partial: Partial<AttributionCandidate> & {
    status?: "approved" | "pending" | "rejected" | "suspended";
    userId?: string | null;
  } = {},
): AttributionCandidate {
  return {
    affiliate: {
      id,
      userId: partial.userId ?? `${id}-user`,
      status: partial.status ?? "approved",
    },
    clickId: "clickId" in partial ? (partial.clickId ?? null) : `${id}-click`,
    couponId: partial.couponId ?? null,
    expiresAt: partial.expiresAt === undefined ? LATER : partial.expiresAt,
  };
}

await test("link A, then link B, then a purchase: B gets the credit", () => {
  // The cookie holds the last click (B); the account still points at A.
  const decision = decideAttribution({
    buyerUserId: BUYER,
    now: NOW,
    code: null,
    link: candidate("B"),
    account: candidate("A"),
  });
  assert.equal(decision?.affiliateId, "B");
  assert.equal(decision?.source, "link");
});

await test("link A, then B's code typed at checkout: the code's owner gets the credit", () => {
  const decision = decideAttribution({
    buyerUserId: BUYER,
    now: NOW,
    code: candidate("B", {
      clickId: null,
      couponId: "coupon-b",
      expiresAt: null,
    }),
    link: candidate("A"),
    account: null,
  });
  assert.deepEqual(decision, {
    affiliateId: "B",
    source: "code",
    clickId: null,
    couponId: "coupon-b",
  });
});

await test("a purchase after the window has passed has no affiliate", () => {
  assert.equal(
    decideAttribution({
      buyerUserId: BUYER,
      now: NOW,
      code: null,
      link: candidate("A", { expiresAt: EARLIER }),
      account: candidate("A", { expiresAt: EARLIER }),
    }),
    null,
  );
});

await test("with no cookie, the click tied to the buyer's account still credits (another device)", () => {
  const decision = decideAttribution({
    buyerUserId: BUYER,
    now: NOW,
    code: null,
    link: null,
    account: candidate("A"),
  });
  assert.equal(decision?.affiliateId, "A");
  assert.equal(decision?.source, "account");
});

await test("11: an affiliate buying through their own link gets no credit, and it does not pass to anyone else", () => {
  assert.equal(
    decideAttribution({
      buyerUserId: BUYER,
      now: NOW,
      code: null,
      link: candidate("RAHUL", { userId: BUYER }),
      account: candidate("PRIYA"),
    }),
    null,
  );
});

await test("a suspended or pending affiliate's click earns nothing", () => {
  for (const status of ["suspended", "pending", "rejected"] as const) {
    assert.equal(
      decideAttribution({
        buyerUserId: BUYER,
        now: NOW,
        code: null,
        link: candidate("A", { status }),
        account: null,
      }),
      null,
      status,
    );
  }
});

await test("nothing to go on means no affiliate", () => {
  assert.equal(
    decideAttribution({
      buyerUserId: BUYER,
      now: NOW,
      code: null,
      link: null,
      account: null,
    }),
    null,
  );
});

await test("crawlers, link previews and scripts are not clicks; browsers are", () => {
  for (const agent of [
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "facebookexternalhit/1.1",
    "WhatsApp/2.23.20.0",
    "curl/8.4.0",
    "",
    undefined,
  ]) {
    assert.equal(isBotUserAgent(agent), true, String(agent));
  }
  assert.equal(
    isBotUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    false,
  );
});

await test("a code is checked by pattern and compared without case", () => {
  assert.equal(normalizeAffiliateCode(" RAHUL "), "rahul");
  assert.equal(normalizeAffiliateCode("rahul-2026"), "rahul-2026");
  assert.equal(normalizeAffiliateCode("ra"), null);
  assert.equal(normalizeAffiliateCode("rahul'; drop table"), null);
  assert.equal(normalizeAffiliateCode("a".repeat(21)), null);
});

await test("only a same-site path is stored, and only the referrer's host", () => {
  assert.equal(
    normalizeLandingPath("/courses/react?x=1#top"),
    "/courses/react",
  );
  assert.equal(normalizeLandingPath("https://evil.example/x"), "/");
  assert.equal(normalizeLandingPath("//evil.example/x"), "/");
  assert.equal(normalizeLandingPath(undefined), "/");
  assert.equal(
    referrerHost("https://www.youtube.com/watch?v=1"),
    "www.youtube.com",
  );
  assert.equal(referrerHost("javascript:alert(1)"), null);
  assert.equal(referrerHost("not a url"), null);
});

await test("an address is stored only as a keyed hash", () => {
  const hash = hashAddress("203.0.113.7", "a".repeat(40));
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(hash, hashAddress("203.0.113.7", "a".repeat(40)));
  assert.notEqual(hash, hashAddress("203.0.113.8", "a".repeat(40)));
  assert.notEqual(hash, hashAddress("203.0.113.7", "b".repeat(40)));
});
