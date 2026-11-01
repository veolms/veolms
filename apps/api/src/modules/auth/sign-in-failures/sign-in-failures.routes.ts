import {
  authMessageResponseSchema,
  signInFailureReportRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createSignInFailuresController } from "./sign-in-failures.controller.ts";

const signInFailuresRoutes: RoutePlugin = async (app) => {
  const controller = createSignInFailuresController();

  app.post(
    "/auth/sign-in-failures",
    {
      // Unauthenticated and only written to the log, so a low cap per IP keeps
      // it from being used to flood the log.
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "reportSignInFailures",
        tags: ["Auth"],
        summary: "Report sign-in requests that failed in the browser",
        description:
          "Records sign-in requests that got no answer, or a server error, in a visitor's browser. The browser keeps them until this request goes through, so failures that never reached the server are still logged.",
        body: signInFailureReportRequestSchema,
        response: {
          200: jsonResponse("Reports logged.", authMessageResponseSchema),
          400: errorResponse("Validation error."),
          429: errorResponse("Rate limit exceeded."),
        },
      },
    },
    controller.report,
  );
};

export default signInFailuresRoutes;
