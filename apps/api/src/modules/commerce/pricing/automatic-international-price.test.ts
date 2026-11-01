import assert from "node:assert/strict";
import { test } from "node:test";

import {
  automaticInternationalPrice,
  createExchangeRates,
} from "./automatic-international-price.ts";

await test("rounds up to the next whole dollar less a cent", () => {
  // ₹5,999 at ₹94.95 is $63.18; ₹9,999 is $105.31.
  assert.deepEqual(
    automaticInternationalPrice({
      salePrice: 5999,
      price: 9999,
      inrPerUsd: 94.95,
    }),
    { currency: "USD", priceMinor: 10599, salePriceMinor: 6399 },
  );
  // ₹8,999 is $94.78 → $94.99; ₹699 is $7.36 → $7.99.
  assert.equal(
    automaticInternationalPrice({
      salePrice: 8999,
      price: 8999,
      inrPerUsd: 94.95,
    }).salePriceMinor,
    9499,
  );
  assert.equal(
    automaticInternationalPrice({
      salePrice: 699,
      price: 699,
      inrPerUsd: 94.95,
    }).salePriceMinor,
    799,
  );
});

await test("no discount in rupees is none in dollars", () => {
  const price = automaticInternationalPrice({
    salePrice: 799,
    price: 799,
    inrPerUsd: 95,
  });
  assert.equal(price.priceMinor, price.salePriceMinor);
});

await test("a tiny price is $1.99 at the least", () => {
  assert.equal(
    automaticInternationalPrice({ salePrice: 49, price: 49, inrPerUsd: 95 })
      .salePriceMinor,
    199,
  );
});

function fakeFetch(answers: Array<unknown | Error>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

await test("a fixed rate is used as it is, without asking anyone", async () => {
  const { impl, calls } = fakeFetch([]);
  const rates = createExchangeRates({ fixedRate: 95, fetchImpl: impl });
  assert.equal(await rates.inrPerUsd(), 95);
  assert.equal(calls.length, 0);
});

await test("the second source is asked when the first fails, and the rate is kept", async () => {
  const { impl, calls } = fakeFetch([
    new Error("down"),
    { rates: { INR: 94.5 } },
  ]);
  let clock = 0;
  const rates = createExchangeRates({
    fixedRate: undefined,
    fetchImpl: impl,
    now: () => clock,
  });
  assert.equal(await rates.inrPerUsd(), 94.5);
  assert.equal(calls.length, 2);
  clock += 60 * 60 * 1000;
  assert.equal(await rates.inrPerUsd(), 94.5);
  assert.equal(calls.length, 2, "kept for a while, not asked again");
});

await test("an implausible answer is refused, and an older rate stands in", async () => {
  const { impl } = fakeFetch([
    { rates: { INR: 95 } },
    { rates: { INR: 0.0105 } },
    { rates: {} },
  ]);
  let clock = 0;
  const rates = createExchangeRates({
    fixedRate: undefined,
    fetchImpl: impl,
    now: () => clock,
  });
  assert.equal(await rates.inrPerUsd(), 95);
  clock += 7 * 60 * 60 * 1000;
  assert.equal(await rates.inrPerUsd(), 95);
});

await test("no source and no older rate: none", async () => {
  const { impl } = fakeFetch([new Error("down"), new Error("down")]);
  const rates = createExchangeRates({ fixedRate: undefined, fetchImpl: impl });
  assert.equal(await rates.inrPerUsd(), null);
});
