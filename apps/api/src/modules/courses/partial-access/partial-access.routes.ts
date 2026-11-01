import { z } from "zod";
import {
  createPartialAccessRequestSchema,
  partialAccessListResponseSchema,
  partialAccessOfferSchema,
  partialAccessOptionsResponseSchema,
  updatePartialAccessRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createPartialAccessController } from "./partial-access.controller.ts";
import { createPartialAccessService } from "./partial-access.service.ts";

const partialAccessRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createPartialAccessService({ database: options.database });
  const controller = createPartialAccessController({ service });

  // Public: the page a part of a course is sold from reads it. Outside
  // `/courses`, whose answers the CDN in front of the API may keep for
  // days: a change of price or of sale must show at once.
  app.get(
    "/course-offers/:idOrSlug/:offerSlug",
    {
      schema: {
        operationId: "getPartialAccessOffer",
        tags: ["Partial Access"],
        summary:
          "A part of a course sold on its own: its price and the sections it opens",
        params: z.object({
          idOrSlug: z.string().min(1).max(160),
          offerSlug: z.string().min(1).max(160),
        }),
        response: {
          200: jsonResponse("Partial access offer", partialAccessOfferSchema),
          404: errorResponse("Offer not found"),
        },
      },
    },
    controller.getOffer,
  );

  // For the coupon builder: a coupon can be limited to a partial access.
  app.get(
    "/course-offers",
    {
      schema: {
        operationId: "listPartialAccessOptions",
        tags: ["Partial Access"],
        summary: "List every partial access, for a coupon to name",
        response: {
          200: jsonResponse(
            "Partial access options",
            partialAccessOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
      preHandler: ctx.authorize("coupon.manage", "platform"),
    },
    controller.listOptions,
  );

  app.get(
    "/courses/:id/partial-access",
    {
      schema: {
        operationId: "listPartialAccess",
        tags: ["Partial Access"],
        summary:
          "List the unlisted courses that open only some sections of a course",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse("Partial access", partialAccessListResponseSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.listPartialAccess,
  );

  app.post(
    "/courses/:id/partial-access",
    {
      schema: {
        operationId: "createPartialAccess",
        tags: ["Partial Access"],
        summary:
          "Sell some sections of a course on their own, as an unlisted course",
        params: z.object({ id: z.uuid() }),
        body: createPartialAccessRequestSchema,
        response: {
          200: jsonResponse("Partial access", partialAccessListResponseSchema),
          400: errorResponse("A section is not part of the course"),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.createPartialAccess,
  );

  app.patch(
    "/courses/:id/partial-access/:partialCourseId",
    {
      schema: {
        operationId: "updatePartialAccess",
        tags: ["Partial Access"],
        summary:
          "Change a partial access: its title, price or sections (applied to its learners at once)",
        params: z.object({ id: z.uuid(), partialCourseId: z.uuid() }),
        body: updatePartialAccessRequestSchema,
        response: {
          200: jsonResponse("Partial access", partialAccessListResponseSchema),
          400: errorResponse("A section is not part of the course"),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Partial access not found"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.updatePartialAccess,
  );

  app.delete(
    "/courses/:id/partial-access/:partialCourseId",
    {
      schema: {
        operationId: "deletePartialAccess",
        tags: ["Partial Access"],
        summary: "Delete a partial access nobody has bought or been given",
        params: z.object({ id: z.uuid(), partialCourseId: z.uuid() }),
        response: {
          200: jsonResponse("Partial access", partialAccessListResponseSchema),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Partial access not found"),
          409: errorResponse("Learners or orders have it"),
        },
      },
      preHandler: ctx.authorize("course.pricing.update", "course"),
    },
    controller.deletePartialAccess,
  );
};

export default partialAccessRoutes;
