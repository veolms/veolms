import type { Database } from "@veolms/database";
import { questionGenerationSettingsSchema } from "@veolms/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { createQuestionAiServices } from "./question-ai.factory.ts";
import * as repo from "./question-jobs.repository.ts";

const POLL_MS = 5_000;
/** A server holds a run this long; it renews while it works. */
const LEASE_MS = 3 * 60_000;
const HEARTBEAT_MS = 30_000;
/** A lecture is tried this many times before it is marked failed. */
const MAX_ATTEMPTS = 3;
/** After the provider says "slow down", the run waits this long. */
const BACKOFF_MS = 60_000;

/** The run cannot go on (no key, AI off, budget used): it stops with this. */
const FATAL = new Set([
  "AI_INVALID_KEY",
  "AI_WORKSPACE_REQUIRED",
  "AI_BUDGET_REACHED",
  "AI_DISABLED",
  "AI_NOT_CONFIGURED",
  "AI_UNAVAILABLE",
]);
/** Worth trying the same lecture again later. */
const TRANSIENT = new Set([
  "AI_RATE_LIMITED",
  "AI_OVERLOADED",
  "AI_NETWORK",
  "AI_UNKNOWN",
]);

/**
 * Works through course-wide question runs, one lecture at a time. Any API
 * server may run it: a run is claimed with a lease, so one server works on
 * it, and another picks it up if that one stops (restart, deploy). What a
 * lecture already got is kept, so a resumed run does not make it twice.
 */
export function startQuestionJobsWorker(input: {
  database: Kysely<Database>;
  services: AppServices;
  logger: FastifyBaseLogger;
}) {
  const { database, logger } = input;
  const { jobs } = createQuestionAiServices(input);
  let stopping = false;
  let busy = false;
  let current: AbortController | null = null;

  async function finish(
    jobId: string,
    status: "done" | "failed",
    error?: string,
  ) {
    await repo.updateJob(database, jobId, {
      status,
      error: error ?? null,
      finished_at: new Date(),
      lease_until: null,
    });
  }

  async function work(jobId: string) {
    while (!stopping) {
      const job = await repo.findJob(database, jobId);
      if (!job || job.status !== "running") return;
      const item = await repo.nextItem(database, jobId);
      if (!item) {
        await finish(jobId, "done");
        return;
      }
      const settings = questionGenerationSettingsSchema.parse(job.settings);
      const controller = new AbortController();
      current = controller;
      // Keeps the lease while a long AI call runs, and notices "Stop".
      const heartbeat = setInterval(() => {
        void (async () => {
          const fresh = await repo.findJob(database, jobId);
          if (!fresh || fresh.status !== "running") {
            controller.abort();
            return;
          }
          await repo.updateJob(database, jobId, {
            lease_until: new Date(Date.now() + LEASE_MS),
          });
        })().catch(() => undefined);
      }, HEARTBEAT_MS);
      try {
        await repo.updateJob(database, jobId, {
          lease_until: new Date(Date.now() + LEASE_MS),
        });
        await jobs.runItem(job, item, settings, controller.signal);
      } catch (error) {
        const code = error instanceof AppError ? error.code : "AI_FAILED";
        const message =
          error instanceof AppError
            ? error.message
            : "Something went wrong while writing this lecture's questions.";
        if (controller.signal.aborted || code === "AI_CANCELLED") {
          // Stopped by staff, or the server is shutting down.
          await repo.updateItem(database, item.id, {
            status: stopping ? "pending" : "skipped",
            message: stopping ? null : "Stopped.",
          });
          return;
        }
        if (FATAL.has(code)) {
          await repo.updateItem(database, item.id, { status: "pending" });
          await finish(jobId, "failed", message);
          return;
        }
        if (TRANSIENT.has(code) && item.attempts + 1 < MAX_ATTEMPTS) {
          // Again later: the item stays pending, the lease runs out soon.
          await repo.updateItem(database, item.id, { status: "pending" });
          await repo.updateJob(database, jobId, {
            lease_until: new Date(Date.now() + BACKOFF_MS),
          });
          return;
        }
        if (!(error instanceof AppError))
          logger.error(
            { err: error, job: jobId, lesson: item.lesson_id },
            "question run: a lecture failed",
          );
        await repo.updateItem(database, item.id, {
          status: "failed",
          message: message.slice(0, 500),
        });
        await repo.countOn(database, jobId, { done: 1, failed: 1 });
      } finally {
        clearInterval(heartbeat);
        current = null;
      }
    }
  }

  async function tick() {
    if (busy || stopping) return;
    busy = true;
    try {
      const jobId = await repo.claimJob(
        database,
        new Date(Date.now() + LEASE_MS),
      );
      if (jobId) await work(jobId);
    } catch (error) {
      logger.error({ err: error }, "question run worker failed");
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void tick(), POLL_MS);
  timer.unref?.();

  return async () => {
    stopping = true;
    clearInterval(timer);
    current?.abort();
    // Give the current lecture a moment to note where it stopped.
    for (let wait = 0; busy && wait < 50; wait += 1)
      await new Promise((resolve) => setTimeout(resolve, 100));
  };
}
