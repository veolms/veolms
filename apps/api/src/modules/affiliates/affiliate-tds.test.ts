import assert from "node:assert/strict";
import test from "node:test";

import { financialYearOf, indiaToday, suggestTds } from "./affiliate-tds.ts";

void test("TDS: nothing while the year's total stays at or under ₹20,000", () => {
  assert.deepEqual(
    suggestTds({
      yearPaidMinor: 1_400_000,
      grossMinor: 600_000,
      panOnFile: true,
    }),
    { rate: 200, suggested: 0, crossesThreshold: false },
  );
});

void test("TDS: the PRD's example, ₹18,000 paid and ₹6,000 now, suggests ₹120", () => {
  assert.deepEqual(
    suggestTds({
      yearPaidMinor: 1_800_000,
      grossMinor: 600_000,
      panOnFile: true,
    }),
    { rate: 200, suggested: 12_000, crossesThreshold: true },
  );
});

void test("TDS: after the limit, every payout is taxed and no longer 'crosses'", () => {
  assert.deepEqual(
    suggestTds({
      yearPaidMinor: 2_400_000,
      grossMinor: 240_000,
      panOnFile: true,
    }),
    { rate: 200, suggested: 4_800, crossesThreshold: false },
  );
});

void test("TDS: 20% without a PAN", () => {
  assert.equal(
    suggestTds({
      yearPaidMinor: 2_400_000,
      grossMinor: 100_000,
      panOnFile: false,
    }).suggested,
    20_000,
  );
});

void test("financial year runs 1 April to 31 March", () => {
  assert.deepEqual(financialYearOf("2026-04-01"), {
    from: "2026-04-01",
    to: "2027-03-31",
  });
  assert.deepEqual(financialYearOf("2027-03-31"), {
    from: "2026-04-01",
    to: "2027-03-31",
  });
  assert.deepEqual(financialYearOf("2026-12-21"), {
    from: "2026-04-01",
    to: "2027-03-31",
  });
});

void test("India's date turns at 18:30 UTC", () => {
  assert.equal(indiaToday(new Date("2026-03-31T18:29:00Z")), "2026-03-31");
  assert.equal(indiaToday(new Date("2026-03-31T18:30:00Z")), "2026-04-01");
});
