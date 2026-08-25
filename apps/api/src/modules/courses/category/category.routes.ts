import { z } from "zod";
import { categorySchema, createCategoryRequestSchema } from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createCategoryController } from "./category.controller.ts";
import { createCategoryService } from "./category.service.ts";

const categoryRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createCategoryService({ database: options.database });
  const controller = createCategoryController({ service });

  app.get(
    "/categories",
    {
      schema: {
        operationId: "listCourseCategories",
        tags: ["Course Categories"],
        summary: "List all categories",
        response: {
          200: jsonResponse("List of categories", z.array(categorySchema)),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.listCategories,
  );

  app.post(
    "/categories",
    {
      schema: {
        operationId: "createCategory",
        tags: ["Course Categories"],
        summary: "Create a new course category",
        body: createCategoryRequestSchema,
        response: {
          201: jsonResponse("Category created successfully", categorySchema),
          400: errorResponse("Category slug already exists"),
        },
      },
      preHandler: ctx.requireAdmin,
    },
    controller.createCategory,
  );

  app.delete(
    "/categories/:categoryId",
    {
      schema: {
        operationId: "deleteCategory",
        tags: ["Course Categories"],
        summary: "Soft delete a category",
        params: z.object({ categoryId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Category soft-deleted",
            z.object({ success: z.boolean() }),
          ),
          404: errorResponse("Category not found"),
        },
      },
      preHandler: ctx.requireAdmin,
    },
    controller.deleteCategory,
  );
};

export default categoryRoutes;
