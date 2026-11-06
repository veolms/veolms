import { sql } from "kysely";

import { getCapacity } from "@veolms/api-core";
import {
  capacityResponseSchema,
  healthResponseSchema,
} from "@veolms/contracts";
import { listPendingMigrations } from "@veolms/database";

import { AppError, errorResponse, httpError } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";

const healthRoutes: RoutePlugin = async (app, { database }) => {
  // Migrations this build has that the database has not run. Code that
  // went live without its migrations fails on every request touching the
  // missing tables (it did: a checkout found no `order_item_courses`), so
  // it is said loudly at start and /ready refuses until they are run. Once
  // none are left the answer cannot change until the next deploy, so it is
  // no longer asked.
  let migrationsCurrent = false;
  async function pendingMigrations(): Promise<string[]> {
    if (migrationsCurrent) return [];
    const pending = await listPendingMigrations(database);
    migrationsCurrent = pending.length === 0;
    return pending;
  }

  app.addHook("onReady", async () => {
    try {
      const pending = await pendingMigrations();
      if (pending.length > 0) {
        app.log.error(
          { pendingMigrations: pending },
          "The database is missing migrations this code needs. Run `pnpm db:migrate`",
        );
      }
    } catch (err) {
      app.log.warn({ err }, "Could not check for pending migrations");
    }
  });

  app.get(
    "/health",
    {
      // Polled several times a second by load balancers and probes: its
      // requests are not logged (a failing one still is, as an error).
      logLevel: "warn",
      schema: {
        operationId: "getHealth",
        tags: ["Health"],
        summary: "Liveness probe",
        description:
          "Succeeds as soon as the API process is accepting requests. Does not " +
          "check the database.",
        response: {
          200: jsonResponse(
            "The API is accepting requests.",
            healthResponseSchema,
          ),
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.get(
    "/ready",
    {
      // Polled several times a second by load balancers and probes: its
      // requests are not logged (a failing one still is, as an error).
      logLevel: "warn",
      schema: {
        operationId: "getReadiness",
        tags: ["Health"],
        summary: "Readiness probe",
        description:
          "Succeeds only when the API can reach PostgreSQL and the database " +
          "has run every migration this build has. Use this (not " +
          "/health) for load-balancer readiness and deploy gates: /health " +
          "reports ok even while every request is stuck waiting on the pool.",
        response: {
          200: jsonResponse(
            "The API can serve requests backed by the database.",
            healthResponseSchema,
          ),
        },
      },
    },
    async () => {
      try {
        await sql`select 1`.execute(database);
      } catch {
        throw new AppError(
          503,
          "DATABASE_UNAVAILABLE",
          "The API cannot reach its database.",
        );
      }
      const pending = await pendingMigrations();
      if (pending.length > 0) {
        throw new AppError(
          503,
          "MIGRATIONS_PENDING",
          `The database has not run ${pending.length} migration(s): ${pending.join(", ")}.`,
        );
      }
      return { status: "ok" as const };
    },
  );

  app.get(
    "/ready/capacity",
    {
      // Asked about once a second by the proxy in front of every server: not
      // logged, and a "full" answer is not an error (the monitor logs once
      // when the server becomes full and once when it has room again).
      logLevel: "warn",
      schema: {
        operationId: "getCapacity",
        tags: ["Health"],
        summary: "Room for more requests",
        description:
          "Succeeds while this server has room: its CPU, memory, event loop " +
          "and database pool are under their limits and it is not draining. " +
          "503 means full: the proxy should send new requests to another " +
          "server. Liveness is /health and database readiness is /ready.",
        response: {
          200: jsonResponse(
            "The server has room for more requests.",
            capacityResponseSchema,
          ),
          503: errorResponse("The server is full or draining."),
        },
      },
    },
    async (_request, reply) => {
      const capacity = getCapacity();
      if (capacity.full) {
        return reply
          .code(503)
          .header("Retry-After", "1")
          .send(
            httpError(
              503,
              "SERVER_FULL",
              `This server is full (${capacity.reason ?? "unknown"}); use another server.`,
            ).toJSON(),
          );
      }
      return {
        status: "ok" as const,
        cpuPercent: Math.round(capacity.cpuPercent),
        memoryPercent: Math.round(capacity.memoryPercent),
        eventLoopDelayMs: Math.round(capacity.eventLoopDelayMs),
      };
    },
  );
};

export default healthRoutes;
