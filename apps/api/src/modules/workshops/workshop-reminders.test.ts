import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isReminderWindowDue,
  reminderDedupeKey,
} from "./workshop-reminders.ts";

const startsAt = new Date("2026-11-12T13:30:00Z");
const minutesBefore = (minutes: number) =>
  new Date(startsAt.getTime() - minutes * 60_000);

await test("the day-before reminder is due from 24 h out until 20 h out", () => {
  assert.equal(
    isReminderWindowDue("day", startsAt, minutesBefore(25 * 60)),
    false,
  );
  assert.equal(
    isReminderWindowDue("day", startsAt, minutesBefore(24 * 60)),
    true,
  );
  assert.equal(
    isReminderWindowDue("day", startsAt, minutesBefore(22 * 60)),
    true,
  );
  assert.equal(
    isReminderWindowDue("day", startsAt, minutesBefore(20 * 60)),
    false,
  );
});

await test("the hour-before reminder is due from 60 min out until 45 min out", () => {
  assert.equal(isReminderWindowDue("hour", startsAt, minutesBefore(61)), false);
  assert.equal(isReminderWindowDue("hour", startsAt, minutesBefore(60)), true);
  assert.equal(isReminderWindowDue("hour", startsAt, minutesBefore(50)), true);
  assert.equal(isReminderWindowDue("hour", startsAt, minutesBefore(45)), false);
});

await test("the live-now notice is due at the start and for ten minutes after", () => {
  assert.equal(isReminderWindowDue("now", startsAt, minutesBefore(1)), false);
  assert.equal(isReminderWindowDue("now", startsAt, startsAt), true);
  assert.equal(isReminderWindowDue("now", startsAt, minutesBefore(-9)), true);
  assert.equal(isReminderWindowDue("now", startsAt, minutesBefore(-10)), false);
});

await test("a session created with little lead time skips the windows it has passed", () => {
  const soon = new Date(Date.now() + 30 * 60_000);
  const now = new Date();
  assert.equal(isReminderWindowDue("day", soon, now), false);
  assert.equal(isReminderWindowDue("hour", soon, now), false);
  assert.equal(isReminderWindowDue("now", soon, now), false);
});

await test("dedupe keys name the session and the window", () => {
  assert.equal(
    reminderDedupeKey("7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f", "hour"),
    "workshop.reminder:7f0c2a4e-1d1b-4c55-9f7e-2a9b3c4d5e6f:hour",
  );
});
