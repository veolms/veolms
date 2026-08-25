import { z } from "zod";
import {
  courseAccessRuleSchema,
  updateCourseAccessRuleRequestSchema,
  coursePricingSchema,
  updateCoursePricingRequestSchema,
  courseSettingsSchema,
  updateCourseSettingsRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createConfigurationController } from "./configuration.controller.ts";
import { createConfigurationService } from "./configuration.service.ts";

const configurationRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createConfigurationService({
    database: options.database,
  });
  const controller = createConfigurationController({ service });

  app.put(
    "/courses/:id/access-rules",
    {
      schema: {
        operationId: "upsertCourseAccessRules",
        tags: ["Course Configuration"],
        summary: "Configure course visibility and durations",
        params: z.object({ id: z.uuid() }),
        body: updateCourseAccessRuleRequestSchema,
        response: {
          200: jsonResponse("Access rules updated", courseAccessRuleSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCourseAccessRules,
  );

  app.put(
    "/courses/:id/pricing",
    {
      schema: {
        operationId: "upsertCoursePricing",
        tags: ["Course Configuration"],
        summary: "Configure pricing tiers and currencies",
        params: z.object({ id: z.uuid() }),
        body: updateCoursePricingRequestSchema,
        response: {
          200: jsonResponse(
            "Pricing configuration updated",
            coursePricingSchema,
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCoursePricing,
  );

  app.put(
    "/courses/:id/settings",
    {
      schema: {
        operationId: "upsertCourseSettings",
        tags: ["Course Configuration"],
        summary: "Configure QA, certificates, and features",
        params: z.object({ id: z.uuid() }),
        body: updateCourseSettingsRequestSchema,
        response: {
          200: jsonResponse("Settings updated", courseSettingsSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.upsertCourseSettings,
  );
};

export default configurationRoutes;
