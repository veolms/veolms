import { runBackgroundItem } from "@veolms/api-core";
import {
  readMarketingDesign,
  marketingAudienceSchema,
  marketingAutomationKeySchema,
  marketingAutomationSettingsSchema,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { EmailService } from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";
import { sql, type Kysely } from "kysely";

import { classifyEmailFailure } from "../notifications/email-failure.ts";
import { addEmailSuppression } from "../notifications/email-suppressions.repository.ts";
import {
  unsubscribeHeaders,
  unsubscribeUrlFor,
} from "../notifications/email-unsubscribe.ts";
import {
  qualifyingQuery,
  stillQualifiesQuery,
} from "./marketing-automations.ts";
import { renderMarketingEmail } from "./marketing-render.ts";
import * as repository from "./marketing.repository.ts";

/**
 * Sends marketing email (creator-features/34 §3). It runs inside the
 * notification sender, under the same lock and after the queued notices,
 * so sign-in codes and receipts always go first and one provider throttle
 * rests both.
 *
 * `prepare` starts due broadcasts (copying their audience into the queue)
 * and, every few minutes, queues the people each active automation found.
 * `send` sends up to `budget` due copies.
 */

export interface MarketingSendResult {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

export interface MarketingSender {
  prepare(): Promise<{ started: number; queued: number }>;
  send(options: {
    budget: number;
    /** Sending must rest (a provider throttled us): stop for this cycle. */
    isPaused: () => boolean;
    pause: (reason: string) => void;
  }): Promise<MarketingSendResult>;
}

export interface MarketingSenderConfig {
  NOTIFICATION_EMAIL_MAX_ATTEMPTS: number;
  NOTIFICATION_RETRY_SECONDS: readonly number[];
  NOTIFICATION_THROTTLE_PAUSE_SECONDS: number;
  NOTIFICATION_LEASE_SECONDS: number;
}

const AUTOMATION_EVERY_MS = 5 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMarketingSender({
  database,
  email,
  logger,
  config,
}: {
  database: Kysely<Database>;
  email: EmailService;
  logger: FastifyBaseLogger;
  config: MarketingSenderConfig;
}): MarketingSender {
  const log = logger.child({ job: "marketing-email" });
  let automationsCheckedAt = 0;

  async function startBroadcasts(now: Date): Promise<number> {
    let started = 0;
    // One transaction per broadcast: marked sending and its queue filled
    // together, so a crash leaves it scheduled, never half-queued.
    for (;;) {
      const done = await database.transaction().execute(async (trx) => {
        const due = await sql<{ id: string }>`
          select id from marketing_emails
          where kind = 'broadcast' and status = 'scheduled'
            and scheduled_at <= ${now} and deleted_at is null
          order by scheduled_at
          limit 1
          for update skip locked
        `.execute(trx);
        const id = due.rows[0]?.id;
        if (!id) return false;
        const email = await repository.findEmail(trx, id);
        const audience = marketingAudienceSchema.safeParse(email?.audience);
        if (audience.success) {
          await repository.queueAudience(trx, id, audience.data);
        }
        await sql`
          update marketing_emails
          set status = 'sending', started_at = ${now}, updated_at = ${now}
          where id = ${id}
        `.execute(trx);
        return true;
      });
      if (!done) break;
      started += 1;
    }
    return started;
  }

  async function queueAutomations(): Promise<number> {
    let queued = 0;
    for (const automation of await repository.listActiveAutomations(database)) {
      const key = marketingAutomationKeySchema.safeParse(
        automation.automation_key,
      );
      const settings = marketingAutomationSettingsSchema.safeParse(
        automation.settings,
      );
      if (!key.success || !settings.success || !automation.enabled_at) continue;
      await runBackgroundItem(
        "marketing-automation",
        { table: "marketing_emails", id: automation.id },
        async () => {
          try {
            const result = await sql`
              insert into marketing_email_recipients (email_id, user_id, email, course_id, due_at)
              select ${automation.id}::uuid, q.user_id, q.email, q.course_id, q.due_at
              from (${qualifyingQuery(key.data, settings.data, automation.enabled_at!)}) q
              on conflict do nothing
            `.execute(database);
            queued += Number(result.numAffectedRows ?? 0);
          } catch (error) {
            log.error(
              { err: error, automationId: automation.id },
              "Automation check failed",
            );
          }
        },
      );
    }
    return queued;
  }

  async function prepare() {
    const now = new Date();
    const started = await startBroadcasts(now);
    let queued = 0;
    if (Date.now() - automationsCheckedAt >= AUTOMATION_EVERY_MS) {
      automationsCheckedAt = Date.now();
      queued = await queueAutomations();
    }
    return { started, queued };
  }

  async function send({
    budget,
    isPaused,
    pause,
  }: Parameters<MarketingSender["send"]>[0]): Promise<MarketingSendResult> {
    const result: MarketingSendResult = {
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
    };
    if (budget <= 0 || isPaused()) return result;
    const now = new Date();
    const leaseUntil = new Date(
      now.getTime() + config.NOTIFICATION_LEASE_SECONDS * 1000,
    );
    const claimed = await repository.claimDueRecipients(database, {
      limit: budget,
      now,
      leaseUntil,
      maxAttempts: config.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
    });
    if (claimed.length === 0) {
      await repository.finishBroadcasts(database, now);
      return result;
    }

    const emails = new Map<string, repository.MarketingEmailRow | null>();
    for (const id of new Set(claimed.map((row) => row.email_id))) {
      emails.set(id, await repository.findEmail(database, id));
    }
    const people = await repository.findPeople(
      database,
      claimed.map((row) => row.user_id),
    );
    const courses = await repository.findCourses(
      database,
      claimed.flatMap((row) => (row.course_id ? [row.course_id] : [])),
    );

    for (const copy of claimed) {
      const key = { emailId: copy.email_id, userId: copy.user_id };
      if (isPaused()) {
        // Back to the queue for after the rest, no try used up.
        await repository.markRecipient(database, key, {
          status: "pending",
          retryAt: new Date(
            Date.now() + config.NOTIFICATION_THROTTLE_PAUSE_SECONDS * 1000,
          ),
          error: "Paused after a provider throttle",
          rewindAttempt: true,
        });
        result.retried += 1;
        continue;
      }
      await runBackgroundItem(
        "marketing-email",
        { table: "marketing_emails", id: copy.email_id },
        async () => {
          const message = emails.get(copy.email_id);
          const person = people.get(copy.user_id);
          if (!message || !person || person.is_deleted || !person.email) {
            await repository.markRecipient(database, key, {
              status: "skipped",
              error: "The account or its email address is gone",
            });
            result.skipped += 1;
            return;
          }
          if (
            !(await repository.canStillReceive(
              database,
              copy.user_id,
              person.email,
            ))
          ) {
            await repository.markRecipient(database, key, {
              status: "skipped",
              error: "Unsubscribed or address bounced",
            });
            result.skipped += 1;
            return;
          }
          const automationKey = marketingAutomationKeySchema.safeParse(
            message.automation_key,
          );
          const settings = marketingAutomationSettingsSchema.safeParse(
            message.settings,
          );
          if (automationKey.success && settings.success) {
            const check = stillQualifiesQuery(
              automationKey.data,
              settings.data,
              copy.user_id,
              copy.course_id,
            );
            if (check && (await check.execute(database)).rows[0]?.ok !== true) {
              await repository.markRecipient(database, key, {
                status: "skipped",
                error: "No longer needed",
              });
              result.skipped += 1;
              return;
            }
          }

          const unsubscribeUrl = `${unsubscribeUrlFor(copy.user_id, "marketing.email")!}?m=${copy.email_id}`;
          try {
            const course = copy.course_id
              ? (courses.get(copy.course_id) ?? null)
              : null;
            const content = await renderMarketingEmail(database, {
              subject: message.subject,
              preheader: message.preheader,
              blocks: message.blocks,
              design: readMarketingDesign(message.design),
              person: { displayName: person.display_name },
              course,
              tracking: {
                emailId: copy.email_id,
                userId: copy.user_id,
                unsubscribeUrl,
              },
            });
            const sendResult = await email.send(person.email, content, {
              headers: {
                ...unsubscribeHeaders(unsubscribeUrl),
                Precedence: "bulk",
                "X-Entity-Ref-ID": `${copy.email_id}:${copy.user_id}`,
              },
            });
            if (sendResult.status === "failed") throw sendResult.error;
            await repository.markRecipient(database, key, {
              status: "sent",
              at: new Date(),
            });
            result.sent += 1;
          } catch (error) {
            const text = errorMessage(error);
            const failure = classifyEmailFailure(error);
            if (failure.pauseLane) pause(failure.reason);
            if (failure.suppress) {
              await addEmailSuppression(database, {
                email: person.email,
                reason: "hard_bounce",
                source: "smtp",
                detail: text,
              });
            }
            if (failure.kind === "throttled") {
              await repository.markRecipient(database, key, {
                status: "pending",
                retryAt: new Date(
                  Date.now() +
                    config.NOTIFICATION_THROTTLE_PAUSE_SECONDS * 1000,
                ),
                error: `${failure.reason}: ${text}`,
                rewindAttempt: true,
              });
              result.retried += 1;
            } else if (
              failure.kind === "permanent" ||
              copy.attempt_count >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS
            ) {
              await repository.markRecipient(database, key, {
                status: "failed",
                error: `${failure.reason}: ${text}`,
              });
              result.failed += 1;
            } else {
              const schedule = config.NOTIFICATION_RETRY_SECONDS;
              const wait =
                schedule[
                  Math.min(
                    Math.max(copy.attempt_count - 1, 0),
                    schedule.length - 1,
                  )
                ] ?? 60;
              await repository.markRecipient(database, key, {
                status: "pending",
                retryAt: new Date(Date.now() + wait * 1000),
                error: `${failure.reason}: ${text}`,
              });
              result.retried += 1;
            }
            log.warn(
              { err: error, emailId: copy.email_id },
              "Marketing email not sent",
            );
          }
        },
      );
    }
    await repository.failExhausted(
      database,
      new Date(),
      config.NOTIFICATION_EMAIL_MAX_ATTEMPTS,
    );
    await repository.finishBroadcasts(database, new Date());
    return result;
  }

  return { prepare, send };
}
