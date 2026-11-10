import { monitorEventLoopDelay } from "node:perf_hooks";

import { getDatabasePoolMetrics } from "@veolms/database";
import type { FastifyInstance } from "fastify";

import { AppError } from "./errors.ts";

/**
 * Sheds the requests that can wait while the server is overloaded.
 *
 * Without it, an overloaded process slows every request alike until the
 * database pool's wait runs out and they fail. With it, routes marked
 * `config: { shedUnderLoad: true }` (progress heartbeats, badge polls:
 * requests the page sends again by itself, losing nothing) are answered at
 * once with 503 and Retry-After, which leaves the capacity to sign-in,
 * payment, course pages and video starts. Nothing else is ever shed.
 *
 * Overloaded means either of:
 *  - the event loop has been late by more than EVENT_LOOP_DELAY_LIMIT_MS
 *    (p99 of each second) for LATE_SECONDS_TO_SHED seconds in a row: the
 *    process is out of CPU. A pause shorter than that (start-up after a
 *    deploy, a garbage collection) sheds nothing;
 *  - more requests wait for a database connection than a pool holds: the
 *    database (or the wait for its replica) is the limit.
 */
const EVENT_LOOP_DELAY_LIMIT_MS = 250;
const SAMPLE_INTERVAL_MS = 1_000;
const LATE_SECONDS_TO_SHED = 3;
const RETRY_AFTER_SECONDS = 15;

function poolsOverloaded(): boolean {
  return getDatabasePoolMetrics().some((pool) => pool.waiting > pool.max);
}

export function registerLoadShedding(app: FastifyInstance): void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let lateSeconds = 0;
  const timer = setInterval(() => {
    const late = delay.percentile(99) / 1e6 > EVENT_LOOP_DELAY_LIMIT_MS;
    lateSeconds = late ? lateSeconds + 1 : 0;
    delay.reset();
  }, SAMPLE_INTERVAL_MS);
  timer.unref();

  app.addHook("onClose", async () => {
    clearInterval(timer);
    delay.disable();
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.config?.shedUnderLoad !== true) return;
    const eventLoopLate = lateSeconds >= LATE_SECONDS_TO_SHED;
    if (!eventLoopLate && !poolsOverloaded()) return;
    reply.header("Retry-After", String(RETRY_AFTER_SECONDS));
    throw new AppError(
      503,
      "SERVER_BUSY",
      "The server is busy. Please try again shortly.",
    );
  });
}
