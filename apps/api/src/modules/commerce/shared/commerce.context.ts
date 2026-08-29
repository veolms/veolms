import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import {
  ADMIN_ROLE,
  createSessionService,
} from "../../auth/index.ts";

export interface CommerceContext {
  middleware: AuthMiddleware;
  requireAuthenticated: AuthMiddleware["authenticate"][];
  requireAdmin: AuthMiddleware["authenticate"][];
}

export function createCommerceContext({
  database,
}: RoutePluginOptions): CommerceContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);

  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];

  const requireAdmin = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireRoles([ADMIN_ROLE]),
  ];

  return {
    middleware,
    requireAuthenticated,
    requireAdmin,
  };
}
