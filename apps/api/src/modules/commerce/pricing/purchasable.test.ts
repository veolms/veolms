import assert from "node:assert/strict";
import { test } from "node:test";

import { courseSaleState, resolveCoursePricing } from "./purchasable.ts";

await test("only a published course is on sale; an archived one says so; anything else is hidden", () => {
  assert.equal(courseSaleState("published"), "on_sale");
  assert.equal(courseSaleState("archived"), "archived");
  assert.equal(courseSaleState("draft"), "hidden");
  assert.equal(courseSaleState(undefined), "hidden");
  assert.equal(courseSaleState(null), "hidden");
});

await test("a priced course costs its sale price when it has one, else its price", () => {
  assert.deepEqual(
    resolveCoursePricing({
      pricing_type: "paid",
      price: 499,
      sale_price: null,
    }),
    { pricingType: "paid", catalogPrice: 499 },
  );
  assert.deepEqual(
    resolveCoursePricing({ pricing_type: "paid", price: 499, sale_price: 299 }),
    { pricingType: "paid", catalogPrice: 299 },
  );
});

await test("a sale price of zero makes a priced course free", () => {
  assert.deepEqual(
    resolveCoursePricing({ pricing_type: "paid", price: 499, sale_price: 0 }),
    { pricingType: "free", catalogPrice: 0 },
  );
  // As the pricing form stores it: the type already says free.
  assert.deepEqual(
    resolveCoursePricing({ pricing_type: "free", price: 499, sale_price: 0 }),
    { pricingType: "free", catalogPrice: 0 },
  );
});

await test("a course with no price, a price of zero, or no pricing row is free", () => {
  assert.deepEqual(
    resolveCoursePricing({ pricing_type: "paid", price: 0, sale_price: null }),
    { pricingType: "free", catalogPrice: 0 },
  );
  assert.deepEqual(
    resolveCoursePricing({ pricing_type: "free", price: 0, sale_price: null }),
    { pricingType: "free", catalogPrice: 0 },
  );
  assert.deepEqual(resolveCoursePricing(undefined), {
    pricingType: "free",
    catalogPrice: 0,
  });
});

await test("a price left on a course marked free is not charged", () => {
  assert.deepEqual(
    resolveCoursePricing({
      pricing_type: "free",
      price: 499,
      sale_price: null,
    }),
    { pricingType: "free", catalogPrice: 0 },
  );
});
