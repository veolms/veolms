import {
  COURSE_PAGE_SECTION_KINDS,
  coursePageSectionsResponseSchema,
  reorderCoursePageSectionsRequestSchema,
  updateCoursePageSectionRequestSchema,
} from "@veolms/contracts";
import { z } from "zod";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCoursesContext } from "../shared/courses.context.ts";
import { createPageSectionsController } from "./page-sections.controller.ts";
import { createPageSectionsService } from "./page-sections.service.ts";

/**
 * The course editor's "Sales page" step: the course page's ready sections,
 * their order, and the page's search title and description. The public
 * page reads them with the course overview.
 */
const pageSectionsRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const controller = createPageSectionsController({
    service: createPageSectionsService({ database: options.database }),
  });
  const tags = ["Course Sales Page"];
  const manage = ctx.authorize("course.details.update", "course");
  const courseParams = z.object({ id: z.uuid() });
  const errors = {
    400: errorResponse("Invalid content"),
    403: errorResponse("Forbidden - not course owner"),
    404: errorResponse("Course not found"),
  };

  app.get(
    "/courses/:id/page-sections",
    {
      preHandler: manage,
      schema: {
        operationId: "getCoursePageSections",
        tags,
        summary: "The course page's sections, in order, and its search fields",
        params: courseParams,
        response: {
          200: jsonResponse("The sections.", coursePageSectionsResponseSchema),
          ...errors,
        },
      },
    },
    controller.get,
  );

  app.put(
    "/courses/:id/page-sections/:kind",
    {
      preHandler: manage,
      schema: {
        operationId: "updateCoursePageSection",
        tags,
        summary: "Switch a section on or off, or save its content",
        description:
          'Kind `seo` saves the search title and description. The curriculum and "about" can only be moved.',
        params: courseParams.extend({
          kind: z.enum([...COURSE_PAGE_SECTION_KINDS, "seo"]),
        }),
        body: updateCoursePageSectionRequestSchema,
        response: {
          200: jsonResponse(
            "All sections as saved.",
            coursePageSectionsResponseSchema,
          ),
          ...errors,
        },
      },
    },
    controller.update,
  );

  app.put(
    "/courses/:id/page-sections-order",
    {
      preHandler: manage,
      schema: {
        operationId: "reorderCoursePageSections",
        tags,
        summary: "Put the sections in a new order",
        params: courseParams,
        body: reorderCoursePageSectionsRequestSchema,
        response: {
          200: jsonResponse(
            "All sections in the new order.",
            coursePageSectionsResponseSchema,
          ),
          ...errors,
        },
      },
    },
    controller.reorder,
  );
};

export default pageSectionsRoutes;
