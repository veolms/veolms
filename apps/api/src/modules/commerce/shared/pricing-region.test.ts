import assert from "node:assert/strict";
import { test } from "node:test";

import { pricingAmountToMinorUnits } from "./currency.ts";
import { pricingRegionForCountry } from "./pricing-region.ts";

await test("India and an unknown country get the rupee prices", () => {
  for (const country of ["IN", null, undefined, "", "XX", "T1"]) {
    assert.equal(pricingRegionForCountry(country, ["IN"]), "domestic");
  }
});

await test("everywhere else gets the prices for buyers outside India", () => {
  for (const country of ["JP", "US", "NP", "PK"]) {
    assert.equal(pricingRegionForCountry(country, ["IN"]), "international");
  }
});

await test("the domestic list decides, not India alone", () => {
  assert.equal(pricingRegionForCountry("NP", ["IN", "NP"]), "domestic");
});

await test("a calculation in cents is kept as it is; one in major units is converted", () => {
  assert.equal(pricingAmountToMinorUnits(4399, "USD", "minor"), 4399);
  assert.equal(pricingAmountToMinorUnits(3499, "INR", "major"), 349900);
  assert.equal(pricingAmountToMinorUnits(3499, "INR"), 349900);
  assert.throws(() => pricingAmountToMinorUnits(43.99, "USD", "minor"));
});
