import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateCommission,
  calculateReversal,
  commissionAvailableAt,
  commissionBase,
  convertToPayoutCurrency,
  resolveCommissionRule,
  type CommissionRule,
} from "./affiliate-commission.ts";

// The worked examples of the PRD (section 10), one test each. Amounts are
// minor units: ₹5,000.00 is 500000.

const RAHUL = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222222";
const COURSE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COURSE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKSHOP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function rule(partial: Partial<CommissionRule>): CommissionRule {
  return {
    id: crypto.randomUUID(),
    affiliateId: null,
    targetType: null,
    targetId: null,
    rateType: "percent",
    rateValue: 2000,
    currency: null,
    ...partial,
  };
}

const programDefault = rule({ id: "default" });

await test("1: a course with tax inside its price earns 20% of the price without the tax", () => {
  const base = commissionBase({ finalAmount: 590000, taxAmount: 90000 });
  assert.equal(base, 500000);
  assert.equal(calculateCommission(base, programDefault), 100000);
});

await test("1b: while checkout charges no tax, the base is what the buyer paid", () => {
  assert.equal(commissionBase({ finalAmount: 499900, taxAmount: 0 }), 499900);
});

await test("2: a 10% code lowers the base before the rate is applied", () => {
  // ₹5,000 before tax, 10% off → ₹4,500.
  assert.equal(calculateCommission(450000, programDefault), 90000);
});

await test("3: one order with three items earns three commissions, each by its own rule", () => {
  const rules = [
    programDefault,
    rule({
      id: "b-30",
      targetType: "course",
      targetId: COURSE_B,
      rateValue: 3000,
    }),
    rule({
      id: "workshop-fixed",
      targetType: "workshop",
      targetId: WORKSHOP,
      rateType: "fixed",
      rateValue: 10000,
      currency: "INR",
    }),
  ];
  const items = [
    { targetType: "course" as const, targetId: COURSE_A, base: 500000 },
    { targetType: "course" as const, targetId: COURSE_B, base: 200000 },
    { targetType: "workshop" as const, targetId: WORKSHOP, base: 49900 },
  ];
  const amounts = items.map((item) => {
    const chosen = resolveCommissionRule(rules, {
      affiliateId: RAHUL,
      targetType: item.targetType,
      targetId: item.targetId,
      currency: "INR",
    });
    assert.ok(chosen);
    return calculateCommission(item.base, chosen);
  });
  assert.deepEqual(amounts, [100000, 60000, 10000]);
  assert.equal(
    amounts.reduce((sum, amount) => sum + amount, 0),
    170000,
  );
});

await test("4: a fixed amount larger than the base is capped at the base", () => {
  assert.equal(
    calculateCommission(8000, { rateType: "fixed", rateValue: 10000 }),
    8000,
  );
});

await test("5: a fraction of a paisa rounds half up", () => {
  // ₹333.33 at 12.5% = 4,166.625 paise → 4,167.
  assert.equal(
    calculateCommission(33333, { rateType: "percent", rateValue: 1250 }),
    4167,
  );
});

await test("6: an affiliate's own rate beats the product's rate, which beats the default", () => {
  const rules = [
    programDefault,
    rule({
      id: "product-30",
      targetType: "course",
      targetId: COURSE_A,
      rateValue: 3000,
    }),
    rule({ id: "rahul-35", affiliateId: RAHUL, rateValue: 3500 }),
  ];
  const forRahul = resolveCommissionRule(rules, {
    affiliateId: RAHUL,
    targetType: "course",
    targetId: COURSE_A,
    currency: "INR",
  });
  assert.equal(forRahul?.id, "rahul-35");
  const forPriya = resolveCommissionRule(rules, {
    affiliateId: PRIYA,
    targetType: "course",
    targetId: COURSE_A,
    currency: "INR",
  });
  assert.equal(forPriya?.id, "product-30");
});

await test("6b: an affiliate's rate for one product beats every other rule", () => {
  const rules = [
    programDefault,
    rule({ id: "rahul-35", affiliateId: RAHUL, rateValue: 3500 }),
    rule({
      id: "rahul-a-40",
      affiliateId: RAHUL,
      targetType: "course",
      targetId: COURSE_A,
      rateValue: 4000,
    }),
  ];
  assert.equal(
    resolveCommissionRule(rules, {
      affiliateId: RAHUL,
      targetType: "course",
      targetId: COURSE_A,
      currency: "INR",
    })?.id,
    "rahul-a-40",
  );
});

await test("7: half the order refunded reverses half the commission", () => {
  assert.equal(
    calculateReversal({
      sale: { amount: 100000, status: "pending" },
      refundedAmount: 295000,
      itemAmount: 590000,
      alreadyReversed: 0,
    }),
    -50000,
  );
});

await test("8: a second half refund reverses the rest and no more", () => {
  assert.equal(
    calculateReversal({
      sale: { amount: 100000, status: "approved" },
      refundedAmount: 295000,
      itemAmount: 590000,
      alreadyReversed: -50000,
    }),
    -50000,
  );
  // Two partial refunds that together exceed the item stop at the commission.
  assert.equal(
    calculateReversal({
      sale: { amount: 100000, status: "approved" },
      refundedAmount: 400000,
      itemAmount: 590000,
      alreadyReversed: -50000,
    }),
    -50000,
  );
  assert.equal(
    calculateReversal({
      sale: { amount: 100000, status: "approved" },
      refundedAmount: 10000,
      itemAmount: 590000,
      alreadyReversed: -100000,
    }),
    0,
  );
});

await test("8b: refunding a rejected sale reverses nothing, because it never counted", () => {
  assert.equal(
    calculateReversal({
      sale: { amount: 100000, status: "rejected" },
      refundedAmount: 590000,
      itemAmount: 590000,
      alreadyReversed: 0,
    }),
    0,
  );
});

await test("9: a dollar order is converted to rupees with the order's own settlement", () => {
  // $50.00 at 20% is $10.00; Razorpay settled the $50 as ₹4,150.
  const commission = calculateCommission(5000, programDefault);
  assert.equal(commission, 1000);
  assert.equal(
    convertToPayoutCurrency(commission, {
      totalAmount: 5000,
      settlementAmount: 415000,
    }),
    83000,
  );
  assert.equal(
    convertToPayoutCurrency(commission, {
      totalAmount: 5000,
      settlementAmount: null,
    }),
    null,
  );
});

await test("9b: a reversal converts with the same ratio as the sale it reverses", () => {
  assert.equal(
    convertToPayoutCurrency(-500, {
      totalAmount: 5000,
      settlementAmount: 415000,
    }),
    -41500,
  );
});

await test("9c: a fixed rule in another currency is passed over for the next rule", () => {
  const rules = [
    programDefault,
    rule({
      id: "workshop-fixed-inr",
      targetType: "workshop",
      targetId: WORKSHOP,
      rateType: "fixed",
      rateValue: 10000,
      currency: "INR",
    }),
  ];
  const target = {
    affiliateId: RAHUL,
    targetType: "workshop" as const,
    targetId: WORKSHOP,
  };
  assert.equal(
    resolveCommissionRule(rules, { ...target, currency: "INR" })?.id,
    "workshop-fixed-inr",
  );
  assert.equal(
    resolveCommissionRule(rules, { ...target, currency: "USD" })?.id,
    "default",
  );
});

await test("10: a refund after payout leaves a negative balance the next sale makes up", () => {
  // Rahul was paid ₹1,000; the order is refunded; he then earns ₹1,500.
  const reversal = calculateReversal({
    sale: { amount: 100000, status: "approved" },
    refundedAmount: 590000,
    itemAmount: 590000,
    alreadyReversed: 0,
  });
  assert.equal(reversal, -100000);
  const nextSale = calculateCommission(750000, programDefault);
  assert.equal(reversal + nextSale, 50000);
});

await test("12: a course made free by a 100% coupon earns nothing", () => {
  const base = commissionBase({ finalAmount: 0, taxAmount: 0 });
  assert.equal(calculateCommission(base, programDefault), 0);
});

await test("a 0% product rule excludes the product even when the default pays", () => {
  const rules = [
    programDefault,
    rule({
      id: "a-excluded",
      targetType: "course",
      targetId: COURSE_A,
      rateValue: 0,
    }),
  ];
  const chosen = resolveCommissionRule(rules, {
    affiliateId: RAHUL,
    targetType: "course",
    targetId: COURSE_A,
    currency: "INR",
  });
  assert.equal(chosen?.id, "a-excluded");
  assert.equal(calculateCommission(500000, chosen!), 0);
});

await test("with no rule at all, no rule is chosen", () => {
  assert.equal(
    resolveCommissionRule([], {
      affiliateId: RAHUL,
      targetType: "course",
      targetId: COURSE_A,
      currency: "INR",
    }),
    null,
  );
});

await test("a base that is not whole minor units is refused", () => {
  assert.throws(() => calculateCommission(100.5, programDefault), RangeError);
});

await test("a commission is owed once the hold period has passed", () => {
  const paidAt = new Date("2026-11-01T10:00:00Z");
  assert.equal(
    commissionAvailableAt(paidAt, 30).toISOString(),
    "2026-12-01T10:00:00.000Z",
  );
  assert.equal(
    commissionAvailableAt(paidAt, 0).toISOString(),
    paidAt.toISOString(),
  );
});
