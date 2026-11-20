import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasHighRefundRate,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  saleFraudFlags,
} from "./affiliate-fraud.ts";

const clean = {
  buyer: { email: "asha@example.com", phone: "+91 98765 43210" },
  affiliate: {
    email: "rahul@example.com",
    phone: "+91 91234 56789",
    suspended: false,
  },
  clickIpHash: "a".repeat(64),
  affiliateSignInHashes: ["b".repeat(64)],
};

await test("an unrelated buyer raises no flag, so the commission is approved on time", () => {
  assert.deepEqual(saleFraudFlags(clean), []);
});

await test("the affiliate's own email apart from dots or a +tag is flagged", () => {
  assert.equal(
    normalizeEmailForMatch("R.a.hul+yt@Example.com"),
    "rahul@example.com",
  );
  assert.deepEqual(
    saleFraudFlags({
      ...clean,
      buyer: { ...clean.buyer, email: "ra.hul+second@example.com" },
    }),
    ["email_match"],
  );
});

await test("the same mobile number, however it is written, is flagged", () => {
  assert.equal(normalizePhoneForMatch("+91 91234-56789"), "9123456789");
  assert.deepEqual(
    saleFraudFlags({
      ...clean,
      buyer: { ...clean.buyer, phone: "09123456789" },
    }),
    ["phone_match"],
  );
});

await test("a click from an address the affiliate signed in from is flagged", () => {
  assert.deepEqual(
    saleFraudFlags({ ...clean, affiliateSignInHashes: ["a".repeat(64)] }),
    ["ip_match"],
  );
});

await test("an affiliate suspended after the order was made has the commission held", () => {
  assert.deepEqual(
    saleFraudFlags({
      ...clean,
      affiliate: { ...clean.affiliate, suspended: true },
    }),
    ["affiliate_suspended"],
  );
});

await test("more than 30% of the last ten sales refunded is a high refund rate; fewer than three sales are not judged", () => {
  const sales = (refunded: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ refunded: i < refunded }));
  assert.equal(hasHighRefundRate(sales(4, 10)), true);
  assert.equal(hasHighRefundRate(sales(3, 10)), false);
  assert.equal(hasHighRefundRate(sales(2, 2)), false);
  // Only the latest ten count.
  assert.equal(hasHighRefundRate([...sales(0, 10), ...sales(10, 10)]), false);
});
