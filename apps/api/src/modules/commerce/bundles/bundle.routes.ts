import { z } from "zod";
import {
  courseBundleSchema,
  createBundleRequestSchema,
  updateBundleRequestSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createBundleService } from "./bundle.service.ts";
import { createBundleController } from "./bundle.controller.ts";

const bundleRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createBundleService({ database: options.database });
  const controller = createBundleController({ service });

  // 1. GET /bundles - Public list of published bundles
  app.get(
    "/bundles",
    {
      schema: {
        operationId: "listPublishedBundles",
        tags: ["Commerce - Bundles"],
        summary: "List published course bundles",
        description: "Returns all published course bundles available for purchase.",
        response: {
          200: jsonResponse("List of published course bundles", z.array(courseBundleSchema)),
        },
      },
    },
    controller.listPublishedBundles,
  );

  // 2. GET /bundles/:slug - Public get bundle by slug
  app.get(
    "/bundles/:slug",
    {
      schema: {
        operationId: "getBundleBySlug",
        tags: ["Commerce - Bundles"],
        summary: "Get bundle details by slug",
        description: "Returns full bundle details with included course curriculum snapshots.",
        params: z.object({
          slug: z.string().min(1).max(160),
        }),
        response: {
          200: jsonResponse("Bundle details", courseBundleSchema),
          404: errorResponse("Bundle not found"),
        },
      },
    },
    controller.getBundleBySlug,
  );

  // 3. GET /admin/bundles - Admin list of all bundles
  app.get(
    "/admin/bundles",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "listAllBundlesAdmin",
        tags: ["Commerce - Bundles (Admin)"],
        summary: "List all bundles (draft, published, archived)",
        description: "Returns all course bundles across all lifecycle states for admin management.",
        response: {
          200: jsonResponse("List of all course bundles", z.array(courseBundleSchema)),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listAllBundles,
  );

  // 4. GET /admin/bundles/:bundleId - Admin get bundle by ID
  app.get(
    "/admin/bundles/:bundleId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "getBundleByIdAdmin",
        tags: ["Commerce - Bundles (Admin)"],
        summary: "Get bundle by ID",
        params: z.object({
          bundleId: z.uuid(),
        }),
        response: {
          200: jsonResponse("Bundle details", courseBundleSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Bundle not found"),
        },
      },
    },
    controller.getBundleById,
  );

  // 5. POST /bundles - Admin create bundle
  app.post(
    "/bundles",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "createBundle",
        tags: ["Commerce - Bundles (Admin)"],
        summary: "Create a new course bundle",
        description: "Creates a package of multiple courses with unified bundle pricing.",
        body: createBundleRequestSchema,
        response: {
          200: jsonResponse("Course bundle created successfully", courseBundleSchema),
          400: errorResponse("Invalid bundle parameters"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          409: errorResponse("Bundle slug already exists"),
        },
      },
    },
    controller.createBundle,
  );

  // 6. PATCH /bundles/:bundleId - Admin update bundle
  app.patch(
    "/bundles/:bundleId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "updateBundle",
        tags: ["Commerce - Bundles (Admin)"],
        summary: "Update an existing course bundle",
        params: z.object({
          bundleId: z.uuid(),
        }),
        body: updateBundleRequestSchema,
        response: {
          200: jsonResponse("Course bundle updated successfully", courseBundleSchema),
          400: errorResponse("Invalid update parameters"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Bundle not found"),
          409: errorResponse("Bundle slug already exists"),
        },
      },
    },
    controller.updateBundle,
  );

  // 7. DELETE /bundles/:bundleId - Admin delete bundle
  app.delete(
    "/bundles/:bundleId",
    {
      preHandler: ctx.requireAdmin,
      schema: {
        operationId: "deleteBundle",
        tags: ["Commerce - Bundles (Admin)"],
        summary: "Delete a course bundle",
        params: z.object({
          bundleId: z.uuid(),
        }),
        response: {
          200: jsonResponse(
            "Course bundle deleted successfully",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Bundle not found"),
        },
      },
    },
    controller.deleteBundle,
  );
};

export default bundleRoutes;
