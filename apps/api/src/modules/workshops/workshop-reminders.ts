/**
 * When a session's reminders are due. Each window is a range of "lead
 * time" (how far away the start is), wide enough that a worker that was
 * down for a while still sends the reminder a little late rather than
 * never, and narrow enough that a session created an hour before it starts
 * does not get a "tomorrow" reminder. The outbox dedupe key
 * `workshop.reminder:<sessionId>:<window>` sends each one once.
 */
export type WorkshopReminderWindow = "day" | "hour" | "now";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface ReminderLeadRange {
  /** Due while `startsAt - now` is above this (exclusive) ... */
  minLeadMs: number;
  /** ... and at most this (inclusive). */
  maxLeadMs: number;
}

export const WORKSHOP_REMINDER_WINDOWS: Readonly<
  Record<WorkshopReminderWindow, ReminderLeadRange>
> = {
  day: { minLeadMs: 20 * HOUR, maxLeadMs: 24 * HOUR },
  hour: { minLeadMs: 45 * MINUTE, maxLeadMs: 60 * MINUTE },
  now: { minLeadMs: -10 * MINUTE, maxLeadMs: 0 },
};

export const WORKSHOP_REMINDER_WINDOW_ORDER: readonly WorkshopReminderWindow[] =
  ["day", "hour", "now"];

export function isReminderWindowDue(
  window: WorkshopReminderWindow,
  startsAt: Date,
  now: Date,
): boolean {
  const lead = startsAt.getTime() - now.getTime();
  const range = WORKSHOP_REMINDER_WINDOWS[window];
  return lead > range.minLeadMs && lead <= range.maxLeadMs;
}

export function reminderDedupeKey(
  sessionId: string,
  window: WorkshopReminderWindow,
): string {
  return `workshop.reminder:${sessionId}:${window}`;
}
