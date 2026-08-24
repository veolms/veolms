import { healthResponseSchema } from "@veolms/contracts";

import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";

const healthRoutes: RoutePlugin = async (app) => {
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
};

export default healthRoutes;
