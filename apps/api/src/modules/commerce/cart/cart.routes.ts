import { z } from "zod";
import {
  cartResponseSchema,
  cartItemInputSchema,
} from "@veolms/contracts";
import { jsonResponse } from "../../../lib/responses.ts";
import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createCommerceContext } from "../shared/commerce.context.ts";
import { createCartService } from "./cart.service.ts";
import { createCartController } from "./cart.controller.ts";

const cartRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCommerceContext(options);
  const service = createCartService({ database: options.database });
  const controller = createCartController({ service });

  // 1. GET /cart - Retrieve authenticated student's active cart
  app.get(
    "/cart",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "getActiveCart",
        tags: ["Commerce - Cart"],
        summary: "Get active student cart",
        description: "Returns the authenticated student's current cart with updated live pricing.",
        response: {
          200: jsonResponse("The active student cart", cartResponseSchema),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.getCart,
  );

  // 2. POST /cart/items - Add a course or bundle to cart
  app.post(
    "/cart/items",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "addCartItem",
        tags: ["Commerce - Cart"],
        summary: "Add item to cart",
        description: "Adds a course or bundle to the student's cart after validating availability and ownership.",
        body: cartItemInputSchema,
        response: {
          200: jsonResponse("Item successfully added to cart", cartResponseSchema),
          400: errorResponse("Item not available or invalid"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Item not found"),
          409: errorResponse("Item already owned or already in cart"),
        },
      },
    },
    controller.addItem,
  );

  // 3. DELETE /cart/items/:itemId - Remove item from cart
  app.delete(
    "/cart/items/:itemId",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "removeCartItem",
        tags: ["Commerce - Cart"],
        summary: "Remove item from cart",
        description: "Removes an item from the student's active cart.",
        params: z.object({
          itemId: z.uuid(),
        }),
        response: {
          200: jsonResponse("Item removed from cart", cartResponseSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Cart item not found"),
        },
      },
    },
    controller.removeItem,
  );

  // 4. DELETE /cart - Clear cart
  app.delete(
    "/cart",
    {
      preHandler: ctx.requireAuthenticated,
      schema: {
        operationId: "clearCart",
        tags: ["Commerce - Cart"],
        summary: "Clear all items from cart",
        description: "Clears all items from the student's active cart.",
        response: {
          200: jsonResponse("Cart successfully cleared", cartResponseSchema),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.clearCart,
  );
};

export default cartRoutes;
