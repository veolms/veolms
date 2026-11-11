import assert from "node:assert/strict";
import { test } from "node:test";

import { addAccessPeriod, extensionBase } from "@veolms/contracts";

const at = (iso: string) => new Date(iso);

void test("days, months and years are added to the end date, keeping its time", () => {
  const end = at("2028-10-28T18:30:00.000Z");
  assert.equal(
    addAccessPeriod(end, 30, "days").toISOString(),
    "2028-11-27T18:30:00.000Z",
  );
  assert.equal(
    addAccessPeriod(end, 6, "months").toISOString(),
    "2029-04-28T18:30:00.000Z",
  );
  assert.equal(
    addAccessPeriod(end, 1, "years").toISOString(),
    "2029-10-28T18:30:00.000Z",
  );
});

void test("a month without the day ends on its last day", () => {
  assert.equal(
    addAccessPeriod(at("2027-01-31T10:00:00.000Z"), 1, "months").toISOString(),
    "2027-02-28T10:00:00.000Z",
  );
  assert.equal(
    addAccessPeriod(at("2028-02-29T10:00:00.000Z"), 1, "years").toISOString(),
    "2029-02-28T10:00:00.000Z",
  );
});

void test("an extension of access that has run out starts today", () => {
  const now = at("2026-11-10T00:00:00.000Z");
  assert.equal(extensionBase(at("2026-10-01T00:00:00.000Z"), now), now);
  assert.equal(extensionBase(null, now), now);
  const later = at("2027-01-01T00:00:00.000Z");
  assert.equal(extensionBase(later, now), later);
});
