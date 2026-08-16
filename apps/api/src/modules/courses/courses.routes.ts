import {
  courseListResponseSchema,
  courseSlugSchema,
  publicCourseSchema,
} from "@veolms/contracts";
import {
  findPublishedCourseBySlug,
  listPublishedCourses,
} from "@veolms/database";
import { z } from "zod";

import { errorResponse, httpError } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";

const courseSlugParamsSchema = z.object({ slug: courseSlugSchema });

const courseRoutes: RoutePlugin = async (app, { database }) => {
  app.get(
    "/courses",
    {
      schema: {
        operationId: "listCourses",
        tags: ["Courses"],
        summary: "List published courses",
        description:
          "Returns every course with `published` status, oldest first. " +
          "Unpublished courses are never exposed.",
        response: {
          200: jsonResponse(
            "The published course catalogue.",
            courseListResponseSchema,
          ),
        },
      },
    },
    async () => ({ courses: await listPublishedCourses(database) }),
  );

  app.get(
    "/courses/:slug",
    {
      schema: {
        operationId: "getCourseBySlug",
        tags: ["Courses"],
        summary: "Get a published course by slug",
        description:
          "Returns the full course record for a published course. Unpublished " +
          "and unknown slugs are indistinguishable and both return 404.",
        params: courseSlugParamsSchema,
        response: {
          200: jsonResponse("The requested course.", publicCourseSchema),
          400: errorResponse("The slug is longer than 160 characters."),
          404: errorResponse("No published course matches the slug."),
        },
      },
    },
    async (request, reply) => {
      const course = await findPublishedCourseBySlug(
        database,
        request.params.slug,
      );

      if (!course) {
        return reply
          .code(404)
          .send(
            httpError(
              404,
              "COURSE_NOT_FOUND",
              `No published course exists with slug "${request.params.slug}".`,
            ),
          );
      }

      return course;
    },
  );
};

export default courseRoutes;
