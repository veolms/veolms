import { sql } from "kysely";

import { healthResponseSchema } from "@veolms/contracts";
import { listPendingMigrations } from "@veolms/database";

import { AppError } from "../../lib/errors.ts";
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
};

export default healthRoutes;
