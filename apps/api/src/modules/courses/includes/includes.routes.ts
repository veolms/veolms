import { z } from "zod";
import {
  courseIncludeItemSchema,
  courseIncludesListResponseSchema,
  createCourseIncludeRequestSchema,
  updateCourseIncludeRequestSchema,
  reorderCourseIncludesRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createIncludesController } from "./includes.controller.ts";
import { createIncludesService } from "./includes.service.ts";

const includesRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createIncludesService({
    database: options.database,
  });
  const controller = createIncludesController({ service });

  app.get(
    "/courses/:id/includes",
    {
      schema: {
        operationId: "listCourseIncludes",
        tags: ["Course Includes"],
        summary: "List all includes for a course",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "List of course includes",
            courseIncludesListResponseSchema,
          ),
          404: errorResponse("Course not found"),
        },
      },
    },
    controller.listCourseIncludes,
  );

  app.post(
    "/courses/:id/includes",
    {
      schema: {
        operationId: "createCourseInclude",
        tags: ["Course Includes"],
        summary: "Create a new course include item",
        params: z.object({ id: z.uuid() }),
        body: createCourseIncludeRequestSchema,
        response: {
          201: jsonResponse(
            "Course include item created",
            courseIncludeItemSchema,
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Course not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.createCourseInclude,
  );

  app.patch(
    "/courses/:id/includes/:includeId",
    {
      schema: {
        operationId: "updateCourseInclude",
        tags: ["Course Includes"],
        summary: "Update a course include item",
        params: z.object({ id: z.uuid(), includeId: z.uuid() }),
        body: updateCourseIncludeRequestSchema,
        response: {
          200: jsonResponse(
            "Course include item updated",
            courseIncludeItemSchema,
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Include item not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.updateCourseInclude,
  );

  app.delete(
    "/courses/:id/includes/:includeId",
    {
      schema: {
        operationId: "deleteCourseInclude",
        tags: ["Course Includes"],
        summary: "Delete a course include item",
        params: z.object({ id: z.uuid(), includeId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Course include item deleted",
            z.object({ success: z.boolean() }),
          ),
          403: errorResponse("Forbidden - not course owner"),
          404: errorResponse("Include item not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.deleteCourseInclude,
  );

  app.post(
    "/courses/:id/includes/reorder",
    {
      schema: {
        operationId: "reorderCourseIncludes",
        tags: ["Course Includes"],
        summary: "Reorder course include items",
        params: z.object({ id: z.uuid() }),
        body: reorderCourseIncludesRequestSchema,
        response: {
          200: jsonResponse(
            "Course includes reordered",
            z.object({ success: z.boolean() }),
          ),
          400: errorResponse("Invalid includes list"),
          403: errorResponse("Forbidden - not course owner"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.reorderCourseIncludes,
  );
};

export default includesRoutes;
