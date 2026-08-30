import { z } from "zod";
import {
  deletedCoursesListResponseSchema,
  deletedCoursesQuerySchema,
  restoreCourseResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCoursesContext } from "../shared/courses.context.ts";
import { createCourseBinController } from "./bin.controller.ts";
import { createCourseBinService } from "./bin.service.ts";

const binRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createCourseBinService({
    database: options.database,
    storage: options.services.storage,
  });
  const controller = createCourseBinController({ service });

  app.get(
    "/bin/courses",
    {
      schema: {
        operationId: "listDeletedCourses",
        tags: ["Course Bin"],
        summary: "List courses scheduled for permanent deletion",
        querystring: deletedCoursesQuerySchema,
        response: {
          200: jsonResponse(
            "Deleted courses and their retention status",
            deletedCoursesListResponseSchema,
          ),
          400: errorResponse("Invalid pagination cursor"),
          403: errorResponse("Administrator access required"),
        },
      },
      preHandler: ctx.requireAdmin,
    },
    controller.listDeletedCourses,
  );

  app.post(
    "/bin/courses/:id/restore",
    {
      schema: {
        operationId: "restoreDeletedCourse",
        tags: ["Course Bin"],
        summary: "Restore a deleted course before permanent deletion",
        params: z.object({ id: z.uuid() }),
        response: {
          200: jsonResponse(
            "Course restored successfully",
            restoreCourseResponseSchema,
          ),
          403: errorResponse("Administrator access required"),
          404: errorResponse("Deleted course not found"),
          409: errorResponse("Course purge is already in progress"),
        },
      },
      preHandler: ctx.requireAdmin,
    },
    controller.restoreCourse,
  );
};

export default binRoutes;
