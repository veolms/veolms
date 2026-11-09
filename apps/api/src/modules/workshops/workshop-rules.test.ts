import assert from "node:assert/strict";
import { test } from "node:test";

import {
  workshopPublishIssues,
  workshopSlugFromTitle,
} from "./workshop-rules.ts";

const now = new Date("2026-11-11T10:00:00Z");
const tomorrow = {
  startsAt: "2026-11-12T13:30:00Z",
  endsAt: "2026-11-12T15:00:00Z",
  joinUrl: "https://zoom.us/j/123",
};
const ready = {
  title: "React performance day",
  summary: "One afternoon on rendering, memo and profiling.",
  priceMinor: null,
  currency: "INR",
};

await test("a complete draft has nothing in its way", () => {
  assert.deepEqual(workshopPublishIssues(ready, [tomorrow], now), []);
});

await test("a draft without sessions, summary or links is told what is missing", () => {
  const issues = workshopPublishIssues({ ...ready, summary: "  " }, [], now);
  assert.deepEqual(
    issues.map((issue) => issue.field),
    ["summary", "sessions"],
  );
  const noLink = workshopPublishIssues(
    ready,
    [{ ...tomorrow, joinUrl: null }],
    now,
  );
  assert.deepEqual(
    noLink.map((issue) => issue.field),
    ["joinUrl"],
  );
});

await test("sessions all in the past cannot be published", () => {
  const issues = workshopPublishIssues(
    ready,
    [
      {
        startsAt: "2026-11-01T13:30:00Z",
        endsAt: "2026-11-01T15:00:00Z",
        joinUrl: "https://meet.google.com/abc-defg-hij",
      },
    ],
    now,
  );
  assert.deepEqual(
    issues.map((issue) => issue.field),
    ["sessions"],
  );
});

await test("a paid workshop needs a currency", () => {
  const issues = workshopPublishIssues(
    { ...ready, priceMinor: 49900, currency: "" },
    [tomorrow],
    now,
  );
  assert.deepEqual(
    issues.map((issue) => issue.field),
    ["price"],
  );
});

await test("slugs come from the title, lower-case and hyphenated", () => {
  assert.equal(
    workshopSlugFromTitle("  React Performance Day: Memo & Profiling! "),
    "react-performance-day-memo-profiling",
  );
  assert.equal(workshopSlugFromTitle("!!!"), "");
});
