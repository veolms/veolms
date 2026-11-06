import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allocateCouponDiscount,
  type CouponAllocationItem,
} from "./coupon-allocation.ts";

const rupees = (price: number, rule: CouponAllocationItem["rule"] = null) => ({
  couponBase: price,
  domesticCouponBase: price,
  rule,
});
const pct = (value: number, max: number | null = null) => ({
  discountType: "percentage" as const,
  discountValue: value,
  maxDiscountAmount: max,
});

await test("one coupon, a different percentage per course, the default for the rest", () => {
  // HAPPYDIWALI: 50% by default, Node.js and TypeScript 40%.
  const discounts = allocateCouponDiscount({
    coupon: pct(50),
    items: [
      rupees(1999, pct(40)), // Node.js
      rupees(999, pct(40)), // TypeScript
      rupees(2999), // JavaScript, the default
    ],
  });
  assert.deepEqual(discounts, [799, 399, 1499]);
});

await test("without rules a percentage is shared in proportion to price, as before", () => {
  const discounts = allocateCouponDiscount({
    coupon: pct(33),
    items: [rupees(1000), rupees(2000)],
  });
  // 33% of 3000 = 990; 1000/3000 of it rounded down, the last takes the rest.
  assert.deepEqual(discounts, [330, 660]);
});

await test("without rules a fixed amount and the coupon maximum work as before", () => {
  assert.deepEqual(
    allocateCouponDiscount({
      coupon: {
        discountType: "fixed",
        discountValue: 300,
        maxDiscountAmount: null,
      },
      items: [rupees(500), rupees(1000)],
    }),
    [100, 200],
  );
  assert.deepEqual(
    allocateCouponDiscount({ coupon: pct(50, 400), items: [rupees(1000)] }),
    [400],
  );
});

await test("a rule's own maximum caps only its item", () => {
  const discounts = allocateCouponDiscount({
    coupon: pct(50),
    items: [rupees(2000, pct(40, 500)), rupees(1000)],
  });
  assert.deepEqual(discounts, [500, 500]);
});

await test("with rules, the coupon maximum caps the whole order", () => {
  const discounts = allocateCouponDiscount({
    coupon: pct(50, 600),
    items: [rupees(1000, pct(40)), rupees(1000)],
  });
  // 400 + 500 = 900 is cut to 600, in proportion: 266 and the rest 334.
  assert.deepEqual(discounts, [266, 334]);
  assert.equal(
    discounts.reduce((a, b) => a + b, 0),
    600,
  );
});

await test("a fixed rule never takes more than the item's price", () => {
  const discounts = allocateCouponDiscount({
    coupon: pct(10),
    items: [
      rupees(499, {
        discountType: "fixed",
        discountValue: 800,
        maxDiscountAmount: null,
      }),
    ],
  });
  assert.deepEqual(discounts, [499]);
});

await test("a fixed rule on an item priced in cents is converted at the item's rate", () => {
  // ₹2000 sells for $25.00 (2500 cents): ₹400 off is 500 cents.
  const discounts = allocateCouponDiscount({
    coupon: pct(50),
    items: [
      {
        couponBase: 2500,
        domesticCouponBase: 2000,
        rule: {
          discountType: "fixed",
          discountValue: 400,
          maxDiscountAmount: null,
        },
      },
    ],
  });
  assert.deepEqual(discounts, [500]);
});

await test("only rules: the default is never used", () => {
  const discounts = allocateCouponDiscount({
    coupon: pct(90),
    items: [rupees(1000, pct(20))],
  });
  assert.deepEqual(discounts, [200]);
});
