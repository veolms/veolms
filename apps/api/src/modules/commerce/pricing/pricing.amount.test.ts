import assert from "node:assert/strict";
import { test } from "node:test";

import { raiseToMinimumCharge } from "./pricing.amount.ts";

await test("a total under the minimum is raised to it, out of the last item's discount first", () => {
  const items = [
    { discountAmount: 500, finalAmount: 499 },
    { discountAmount: 989, finalAmount: 10 },
  ];
  const raised = raiseToMinimumCharge({
    totalAmount: 509,
    discountAmount: 1489,
    minimum: 600,
    items,
  });
  assert.equal(raised, 91);
  assert.deepEqual(items, [
    { discountAmount: 500, finalAmount: 499 },
    { discountAmount: 898, finalAmount: 101 },
  ]);
});

await test("a 99% coupon on $9.99 is charged $1, not 10 cents", () => {
  const items = [{ discountAmount: 989, finalAmount: 10 }];
  assert.equal(
    raiseToMinimumCharge({
      totalAmount: 10,
      discountAmount: 989,
      minimum: 100,
      items,
    }),
    90,
  );
  assert.deepEqual(items, [{ discountAmount: 899, finalAmount: 100 }]);
});

await test("a free total, a total at the minimum and a currency with none are left alone", () => {
  for (const [totalAmount, minimum] of [
    [0, 100],
    [100, 100],
    [5, 0],
  ] as const) {
    const items = [{ discountAmount: 50, finalAmount: totalAmount }];
    assert.equal(
      raiseToMinimumCharge({ totalAmount, discountAmount: 50, minimum, items }),
      0,
    );
    assert.equal(items[0]!.discountAmount, 50);
  }
});

await test("a price under the minimum before any discount is raised only by the discount", () => {
  const items = [{ discountAmount: 20, finalAmount: 30 }];
  assert.equal(
    raiseToMinimumCharge({
      totalAmount: 30,
      discountAmount: 20,
      minimum: 100,
      items,
    }),
    20,
  );
  assert.deepEqual(items, [{ discountAmount: 0, finalAmount: 50 }]);
});
