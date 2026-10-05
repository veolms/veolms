import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";
import type { Database } from "@veolms/database";

import { createOutboxService } from "../../events/outbox.service.ts";
import * as learningProgressRepository from "./learning-progress.repository.ts";

export interface LearningReminderWorkerOptions {
  database: Kysely<Database>;
  logger?: FastifyBaseLogger;
  /** Interval between reminder scans. Default: 15 minutes. */
  intervalMs?: number;
}

interface DueReminderRow {
  user_id: string;
  daily_goal_minutes: number;
  time_zone: string;
  local_date: string;
}

/**
 * Produces the `learning.reminder` outbox events the notification
 * pipeline already knows how to deliver (preferences default-on,
 * NotificationSettings lists the type under reminders).
 *
 * Cadence: a 15-minute tick (fulfillment-scheduler pattern) behind a
 * pg advisory lock, so multi-replica deployments scan once. A user is
 * due when, in THEIR IANA time zone: reminders are on, a daily goal is
 * configured, today is an enabled reminder day, the wall clock passed
 * their reminder time, and today has no qualifying activity yet
 * (>= 60 credited seconds or a completion). The outbox dedupe key
 * `learning.reminder:{user}:{localDate}` makes delivery once per local
 * day; the scan also skips users whose key already exists so quiet
 * evenings cost zero outbox writes.
 */
export class LearningReminderWorker {
  private readonly database: Kysely<Database>;
  private readonly logger?: FastifyBaseLogger;
  private readonly intervalMs: number;
  private readonly outbox = createOutboxService();
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeCycle: Promise<void> | null = null;

  constructor(options: LearningReminderWorkerOptions) {
    this.database = options.database;
    this.logger = options.logger;
    this.intervalMs = options.intervalMs ?? 15 * 60 * 1000;
  }

  start(): void {
    if (this.timer) return;
    this.logger?.info("Starting Learning Reminder Worker");

    // First scan shortly after startup, off the boot hot path.
    this.initialTimer = setTimeout(() => {
      void this.runCycle();
    }, 30_000);
    this.initialTimer.unref();

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger?.info("Stopped Learning Reminder Worker");
    }
    await this.activeCycle;
  }

  async runCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    const cycle = this.executeCycle();
    this.activeCycle = cycle;
    try {
      await cycle;
    } catch (error) {
      this.logger?.error(
        { err: error, job: "learning-reminder-worker" },
        "Learning reminder cycle failed",
      );
    } finally {
      if (this.activeCycle === cycle) this.activeCycle = null;
      this.isRunning = false;
    }
  }

  private async executeCycle(): Promise<void> {
    await this.database.connection().execute(async (connection) => {
      const lock = await sql<{ locked: boolean }>`
        select pg_try_advisory_lock(
          hashtext('veolms:learning-reminder-worker')
        ) as locked
      `.execute(connection);
      if (!lock.rows[0]?.locked) return;

      try {
        await this.publishDueReminders();
      } finally {
        await sql`
          select pg_advisory_unlock(
            hashtext('veolms:learning-reminder-worker')
          )
        `.execute(connection);
      }
    });
  }

  private async publishDueReminders(): Promise<void> {
    const due = await sql<DueReminderRow>`
      select
        s.user_id,
        s.daily_goal_minutes,
        s.time_zone,
        to_char((now() at time zone s.time_zone)::date, 'YYYY-MM-DD')
          as local_date
      from user_learning_settings s
      where s.reminders_enabled
        and s.daily_goal_minutes is not null
        and lower(to_char(now() at time zone s.time_zone, 'dy'))
          = any(s.reminder_days)
        and (now() at time zone s.time_zone)::time >= s.reminder_time
        and not exists (
          select 1 from learning_daily_activity a
          where a.user_id = s.user_id
            and a.activity_date = (now() at time zone s.time_zone)::date
            and (a.seconds >= 60 or a.completions >= 1)
        )
        and not exists (
          select 1 from outbox_events o
          where o.dedupe_key = 'learning.reminder:' || s.user_id || ':'
            || to_char((now() at time zone s.time_zone)::date, 'YYYY-MM-DD')
        )
      limit 500
    `.execute(this.database);

    if (due.rows.length === 0) return;

    for (const row of due.rows) {
      // Streak context for the copy: the streak that ends yesterday is
      // what tonight's inactivity would break.
      const aggregates =
        await learningProgressRepository.getLearningSummaryAggregates(
          this.database,
          { userId: row.user_id, timeZone: row.time_zone },
        );

      await this.database.transaction().execute(async (transaction) => {
        await this.outbox.publish(transaction, {
          type: "learning.reminder",
          version: 1,
          dedupeKey: `learning.reminder:${row.user_id}:${row.local_date}`,
          occurredAt: new Date(),
          payload: {
            recipientUserId: row.user_id,
            dailyGoalMinutes: row.daily_goal_minutes,
            streakDays: aggregates.currentStreakDays,
            localDate: row.local_date,
          },
        });
      });
    }

    this.logger?.info(
      { job: "learning-reminder-worker", published: due.rows.length },
      "Learning reminders published",
    );
  }
}
