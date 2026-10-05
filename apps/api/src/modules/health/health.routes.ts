import { sql } from "kysely";

import { healthResponseSchema } from "@veolms/contracts";

import { AppError } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";

const healthRoutes: RoutePlugin = async (app, { database }) => {
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
          "Succeeds only when the API can reach PostgreSQL. Use this (not " +
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
      return { status: "ok" as const };
    },
  );
};

export default healthRoutes;
