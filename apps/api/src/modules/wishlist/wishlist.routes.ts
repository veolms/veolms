import {
  importWishlistRequestSchema,
  wishlistCourseParamsSchema,
  wishlistResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createWishlistController } from "./wishlist.controller.ts";
import { createWishlistService } from "./wishlist.service.ts";

const wishlistRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const service = createWishlistService({
    database: options.database,
    services: options.services,
  });
  const controller = createWishlistController({ service });

  app.get(
    "/wishlist",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getWishlist",
        tags: ["Wishlist"],
        summary: "List the courses the signed-in learner has saved",
        description:
          "The learner's own wishlist, the course saved last first. A saved course that is not published at the moment is left out.",
        response: {
          200: jsonResponse("The learner's wishlist.", wishlistResponseSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.list,
  );

  app.put(
    "/wishlist/:courseId",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "addWishlistCourse",
        tags: ["Wishlist"],
        summary: "Save a course to the signed-in learner's wishlist",
        description:
          "Saving a course that is already saved changes nothing. Only a published course can be saved.",
        params: wishlistCourseParamsSchema,
        response: {
          200: jsonResponse(
            "The learner's wishlist, with the course in it.",
            wishlistResponseSchema,
          ),
          400: errorResponse("Invalid course id"),
          401: errorResponse("Authentication required"),
          404: errorResponse("There is no published course with this id"),
          409: errorResponse("The wishlist is full"),
        },
      },
    },
    controller.add,
  );

  app.delete(
    "/wishlist/:courseId",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "removeWishlistCourse",
        tags: ["Wishlist"],
        summary: "Remove a course from the signed-in learner's wishlist",
        description: "Removing a course that is not saved changes nothing.",
        params: wishlistCourseParamsSchema,
        response: {
          200: jsonResponse(
            "The learner's wishlist, without the course.",
            wishlistResponseSchema,
          ),
          400: errorResponse("Invalid course id"),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.remove,
  );

  app.post(
    "/wishlist/import",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "importWishlist",
        tags: ["Wishlist"],
        summary: "Add the courses a browser had saved to the wishlist",
        description:
          "For a browser that kept the wishlist itself. Each entry is a course id or slug; the published courses among them are added, the rest are ignored.",
        body: importWishlistRequestSchema,
        response: {
          200: jsonResponse(
            "The learner's wishlist, with the courses in it.",
            wishlistResponseSchema,
          ),
          400: errorResponse("Invalid request"),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.importFromBrowser,
  );
};

export default wishlistRoutes;
