import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";
import type { Database } from "@veolms/database";

import { createOutboxService } from "../../events/outbox.service.ts";
import {
  WORKSHOP_REMINDER_WINDOWS,
  WORKSHOP_REMINDER_WINDOW_ORDER,
  reminderDedupeKey,
  type WorkshopReminderWindow,
} from "./workshop-reminders.ts";

export interface WorkshopReminderWorkerOptions {
  database: Kysely<Database>;
  logger?: FastifyBaseLogger;
  /** Interval between scans. Default: one minute. */
  intervalMs?: number;
}

interface DueSessionRow {
  session_id: string;
  session_title: string | null;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  workshop_id: string;
  slug: string;
  title: string;
}

/**
 * Publishes one `workshop.reminder` outbox event per session and window
 * (a day before, an hour before, at the start); the notification pipeline
 * fans it out to every registrant. Same shape as the learning reminders:
 * a tick behind a pg advisory lock so one process scans, and dedupe keys
 * so a restart or a second process never sends twice. Only sessions of
 * published workshops with at least one active registration are looked at.
 */
export class WorkshopReminderWorker {
  private readonly database: Kysely<Database>;
  private readonly logger?: FastifyBaseLogger;
  private readonly intervalMs: number;
  private readonly outbox = createOutboxService();
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeCycle: Promise<void> | null = null;

  constructor(options: WorkshopReminderWorkerOptions) {
    this.database = options.database;
    this.logger = options.logger;
    this.intervalMs = options.intervalMs ?? 60_000;
  }

  start(): void {
    if (this.timer) return;
    this.logger?.info("Starting Workshop Reminder Worker");
    this.initialTimer = setTimeout(() => {
      void this.runCycle();
    }, 20_000);
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
      this.logger?.info("Stopped Workshop Reminder Worker");
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
        { err: error, job: "workshop-reminder-worker" },
        "Workshop reminder cycle failed",
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
          hashtext('veolms:workshop-reminder-worker')
        ) as locked
      `.execute(connection);
      if (!lock.rows[0]?.locked) return;
      try {
        const published = await this.publishDue(new Date());
        if (published > 0) {
          this.logger?.info(
            { job: "workshop-reminder-worker", published },
            "Workshop reminders published",
          );
        }
      } finally {
        await sql`
          select pg_advisory_unlock(
            hashtext('veolms:workshop-reminder-worker')
          )
        `.execute(connection);
      }
    });
  }

  /** Publishes every reminder due at `now`; returns how many. Public for tests. */
  async publishDue(now: Date): Promise<number> {
    let published = 0;
    for (const window of WORKSHOP_REMINDER_WINDOW_ORDER) {
      published += await this.publishWindow(window, now);
    }
    return published;
  }

  private async publishWindow(
    window: WorkshopReminderWindow,
    now: Date,
  ): Promise<number> {
    const range = WORKSHOP_REMINDER_WINDOWS[window];
    // lead = starts_at - now must be in (min, max]: starts_at in
    // (now + min, now + max].
    const lowest = new Date(now.getTime() + range.minLeadMs);
    const highest = new Date(now.getTime() + range.maxLeadMs);
    const keyPrefix = "workshop.reminder:";
    const due = await sql<DueSessionRow>`
      select
        s.id as session_id,
        s.title as session_title,
        s.starts_at,
        s.ends_at,
        s.time_zone,
        w.id as workshop_id,
        w.slug,
        w.title
      from workshop_sessions s
      join workshops w on w.id = s.workshop_id
      where w.status = 'published'
        and w.deleted_at is null
        and s.starts_at > ${lowest}
        and s.starts_at <= ${highest}
        and exists (
          select 1 from workshop_registrations r
          where r.workshop_id = w.id and r.cancelled_at is null
        )
        and not exists (
          select 1 from outbox_events o
          where o.dedupe_key = ${keyPrefix} || s.id || ${`:${window}`}
        )
      order by s.starts_at asc
      limit 500
    `.execute(this.database);

    for (const row of due.rows) {
      await this.database.transaction().execute(async (transaction) => {
        await this.outbox.publish(transaction, {
          type: "workshop.reminder",
          version: 1,
          dedupeKey: reminderDedupeKey(row.session_id, window),
          occurredAt: now,
          payload: {
            workshopId: row.workshop_id,
            workshopSlug: row.slug,
            workshopTitle: row.title,
            sessionId: row.session_id,
            sessionTitle: row.session_title,
            startsAt: new Date(row.starts_at).toISOString(),
            endsAt: new Date(row.ends_at).toISOString(),
            timeZone: row.time_zone,
            window,
          },
        });
      });
    }
    return due.rows.length;
  }
}
