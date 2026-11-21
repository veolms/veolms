import { runBackgroundPass } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";

import {
  approveDueCommissions,
  flagHighRefundRates,
  purgeOldClicks,
  reconcileCommissions,
  remindOverduePayouts,
} from "./affiliate-commissions.service.ts";

const APPROVAL_PASS = "affiliate-commission-approval";
const DAILY_PASS = "affiliate-daily";
const APPROVAL_INTERVAL_MS = 15 * 60 * 1000;
const DAILY_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** The daily work starts at 22:00 UTC (03:30 in India), a quiet hour. */
const DAILY_HOUR_UTC = 22;

/**
 * The affiliate program's background work (PRD section 14.2), in process
 * like the other pollers: commissions approved every 15 minutes; once a
 * day the repair of anything a failure missed, the refund-rate flag, the
 * purge of old clicks and the reminder about payouts open over a week. Every instance may run it; every step is safe to
 * repeat.
 */
export class AffiliateCommissionWorker {
  private readonly database: Kysely<Database>;
  private readonly logger?: FastifyBaseLogger;
  private approvalTimer: NodeJS.Timeout | null = null;
  private dailyTimer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;
  private active: Promise<void> | null = null;
  private lastDailyRun: string | null = null;

  constructor(options: {
    database: Kysely<Database>;
    logger?: FastifyBaseLogger;
  }) {
    this.database = options.database;
    this.logger = options.logger;
  }

  start(): void {
    if (this.approvalTimer) return;
    this.firstTimer = setTimeout(() => void this.approve(), 60_000);
    this.firstTimer.unref();
    this.approvalTimer = setInterval(
      () => void this.approve(),
      APPROVAL_INTERVAL_MS,
    );
    this.approvalTimer.unref();
    this.dailyTimer = setInterval(
      () => void this.daily(),
      DAILY_CHECK_INTERVAL_MS,
    );
    this.dailyTimer.unref();
  }

  async stop(): Promise<void> {
    for (const timer of [
      this.firstTimer,
      this.approvalTimer,
      this.dailyTimer,
    ]) {
      if (timer) clearTimeout(timer);
    }
    this.firstTimer = this.approvalTimer = this.dailyTimer = null;
    await this.active;
  }

  /** One approval pass; exported for tests and operators. */
  async approve(): Promise<void> {
    await this.run(async () => {
      const result = await runBackgroundPass(APPROVAL_PASS, () =>
        approveDueCommissions(this.database),
      );
      if (result.approved || result.flagged) {
        this.logger?.info(
          { job: APPROVAL_PASS, ...result },
          "Affiliate commissions approved",
        );
      }
    }, APPROVAL_PASS);
  }

  /** The daily work, once per UTC day after DAILY_HOUR_UTC. */
  async daily(now = new Date()): Promise<void> {
    const today = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < DAILY_HOUR_UTC || this.lastDailyRun === today) {
      return;
    }
    this.lastDailyRun = today;
    await this.run(async () => {
      const repaired = await runBackgroundPass(DAILY_PASS, () =>
        reconcileCommissions(this.database, { logger: this.logger }),
      );
      const flagged = await runBackgroundPass(DAILY_PASS, () =>
        flagHighRefundRates(this.database),
      );
      const purged = await runBackgroundPass(DAILY_PASS, () =>
        purgeOldClicks(this.database),
      );
      const reminded = await runBackgroundPass(DAILY_PASS, () =>
        remindOverduePayouts(this.database),
      );
      this.logger?.info(
        { job: DAILY_PASS, ...repaired, flagged, purged, reminded },
        "Affiliate daily work done",
      );
    }, DAILY_PASS);
  }

  private async run(work: () => Promise<void>, job: string): Promise<void> {
    if (this.active) return;
    const cycle = work().catch((error: unknown) => {
      this.logger?.error(
        { err: error, job },
        "Affiliate background work failed",
      );
    });
    this.active = cycle;
    try {
      await cycle;
    } finally {
      if (this.active === cycle) this.active = null;
    }
  }
}
