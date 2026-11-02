import assert from "node:assert/strict";
import { test } from "node:test";

import { decidePace } from "./viewer-access.pace.ts";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

await test("no pace before the learner has studied at all", () => {
  assert.equal(
    decidePace({
      now: NOW,
      firstActivityOn: null,
      recentCompletions: 0,
      lessonsLeft: 10,
    }),
    null,
  );
});

await test("no pace until two weeks of study", () => {
  assert.equal(
    decidePace({
      now: NOW,
      firstActivityOn: daysAgo(12),
      recentCompletions: 6,
      lessonsLeft: 10,
    }),
    null,
  );
});

await test("lessons a week over the last four weeks, and the finish at that rate", () => {
  assert.deepEqual(
    decidePace({
      now: NOW,
      firstActivityOn: daysAgo(90),
      recentCompletions: 8,
      lessonsLeft: 10,
    }),
    {
      lessonsPerWeek: 2,
      projectedFinishAt: new Date(
        NOW.getTime() + 35 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
  );
});

await test("a learner newer than four weeks is measured over the days they have", () => {
  const pace = decidePace({
    now: NOW,
    firstActivityOn: daysAgo(21),
    recentCompletions: 3,
    lessonsLeft: 4,
  });
  assert.equal(pace?.lessonsPerWeek, 1);
});

await test("no finish date when nothing was finished lately or nothing is left", () => {
  assert.deepEqual(
    decidePace({
      now: NOW,
      firstActivityOn: daysAgo(60),
      recentCompletions: 0,
      lessonsLeft: 5,
    }),
    { lessonsPerWeek: 0, projectedFinishAt: null },
  );
  assert.equal(
    decidePace({
      now: NOW,
      firstActivityOn: daysAgo(60),
      recentCompletions: 4,
      lessonsLeft: 0,
    })?.projectedFinishAt,
    null,
  );
});
