import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import type { AuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";

export interface CommerceContext {
  middleware: AuthMiddleware;
  requireAuthenticated: AuthMiddleware["authenticate"][];
  /** Signed in, two-factor done, and holding the permission (see createPermissionPreHandlers). */
  requires: ReturnType<typeof createPermissionPreHandlers>["requires"];
}

export function createCommerceContext({
  database,
}: RoutePluginOptions): CommerceContext {
  const { middleware, signedIn, requires } =
    createPermissionPreHandlers(database);

  return {
    middleware,
    requireAuthenticated: signedIn,
    requires,
  };
}
