import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { claimNextQueuedVideoJob, type Database } from "@veolms/database";
import type { FleetEventType } from "@veolms/fleet-types";
import type { MediaWorkerConfig } from "@veolms/config";

export interface MediaWorkerContext {
  readonly workerId: string;
  readonly db: Kysely<Database>;
  readonly config: MediaWorkerConfig;
  stopHeartbeat: () => Promise<void>;
  recordEvent: (
    event: FleetEventType,
    jobId?: string | null,
    metadata?: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}

export async function initMediaWorker(options: {
  config: MediaWorkerConfig;
  db: Kysely<Database>;
}): Promise<MediaWorkerContext> {
  const { config, db } = options;
  const workerId = config.WORKER_ID;

  // 1. Mark worker status as READY
  await db
    .updateTable("workers")
    .set({
      status: "ready",
      started_at: new Date(),
      last_heartbeat_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", workerId)
    .execute();

  const recordEvent = async (
    event: FleetEventType,
    jobId: string | null = config.JOB_ID ?? null,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<void> => {
    try {
      await db
        .insertInto("worker_events")
        .values({
          id: randomUUID(),
          worker_id: workerId,
          job_id: jobId,
          event,
          metadata: { ...metadata },
          created_at: new Date(),
        })
        .execute();
    } catch (err) {
      console.error(`Failed to record worker event ${event}:`, err);
    }
  };

  // Record WORKER_READY event
  await recordEvent("worker_ready", config.JOB_ID ?? null, {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });

  // 2. Start recurring direct heartbeat loop
  let stopped = false;
  let inFlightHeartbeat: Promise<void> | null = null;
  const heartbeatInterval = setInterval(() => {
    if (stopped || inFlightHeartbeat) {
      return;
    }
    try {
      inFlightHeartbeat = db
        .updateTable("workers")
        .set({
          last_heartbeat_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", workerId)
        .execute()
        .then(() => undefined)
        .catch((err) => {
          console.error(
            `Failed to write heartbeat for worker ${workerId}:`,
            err,
          );
        })
        .finally(() => {
          inFlightHeartbeat = null;
        });
    } catch (err) {
      // Guards against a synchronous throw from the query builder itself
      // (as opposed to the query's own promise rejecting) — without this,
      // that throw would escape setInterval's callback as an uncaught
      // exception and crash the whole worker process.
      console.error(
        `Failed to build heartbeat query for worker ${workerId}:`,
        err,
      );
    }
  }, config.HEARTBEAT_INTERVAL_MS);

  // Do not hold Node event loop open solely for heartbeat
  heartbeatInterval.unref();

  // Stops future ticks and awaits any write already in flight, so callers
  // can safely destroy the db connection pool right after this resolves
  // without racing an in-progress heartbeat query against it. Bounded by
  // config.HEARTBEAT_DRAIN_TIMEOUT_MS so a stuck DB call can't block
  // shutdown forever — callers still need to reach db.destroy() and the
  // final worker-status update even if this particular write never
  // resolves.
  const stopHeartbeat = async (): Promise<void> => {
    stopped = true;
    clearInterval(heartbeatInterval);
    if (!inFlightHeartbeat) {
      return;
    }
    await Promise.race([
      inFlightHeartbeat,
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, config.HEARTBEAT_DRAIN_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
  };

  return {
    workerId,
    db,
    config,
    stopHeartbeat,
    recordEvent,
  };
}

/**
 * Looks for the next job to keep this already-booted worker busy instead
 * of it terminating after a single job. Checks once immediately; if the
 * queue is empty, waits WORKER_IDLE_POLL_SECONDS and checks exactly once
 * more before giving up — a single grace retry, not indefinite polling, so
 * an idle worker costs at most one extra wait cycle before it self-
 * terminates (via the existing UserData shutdown path once this process
 * exits).
 */
export async function pollForNextJob(
  ctx: MediaWorkerContext,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) {
    return null;
  }

  const claimed = await claimNextQueuedVideoJob(ctx.db, ctx.workerId);
  if (claimed) {
    return claimed.id;
  }

  // If the worker is no longer in READY status (e.g. FAILED, TERMINATING, TERMINATED),
  // do not wait idle — exit immediately.
  if (typeof ctx.db?.selectFrom === "function") {
    const worker = await ctx.db
      .selectFrom("workers")
      .select("status")
      .where("id", "=", ctx.workerId)
      .executeTakeFirst();

    if (worker && worker.status !== "ready") {
      return null;
    }
  }

  console.info(
    `[media-worker] Queue empty — waiting ${ctx.config.WORKER_IDLE_POLL_SECONDS}s for one more check before shutting down...`,
  );
  await new Promise<void>((resolve) => {
    const finish = () => {
      signal?.removeEventListener("abort", abortWait);
      resolve();
    };
    const timeout = setTimeout(
      finish,
      ctx.config.WORKER_IDLE_POLL_SECONDS * 1000,
    );
    const abortWait = () => {
      clearTimeout(timeout);
      finish();
    };
    signal?.addEventListener("abort", abortWait, { once: true });
  });

  if (signal?.aborted) {
    return null;
  }

  const claimedAfterWait = await claimNextQueuedVideoJob(ctx.db, ctx.workerId);
  return claimedAfterWait?.id ?? null;
}
