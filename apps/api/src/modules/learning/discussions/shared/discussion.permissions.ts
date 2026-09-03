import type { RoutePluginOptions } from "../../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../../middlewares/auth.middleware.ts";
import {
  ADMIN_ROLE,
  INSTRUCTOR_ROLE,
  createSessionService,
} from "../../../auth/index.ts";

export interface DiscussionPermissionsContext {
  middleware: AuthMiddleware;
  authenticate: AuthMiddleware["authenticate"];
  requireAuthenticated: AuthMiddleware["authenticate"][];
  requireModerator: AuthMiddleware["authenticate"][];
  requireAdmin: AuthMiddleware["authenticate"][];
}

export function createDiscussionPermissions({
  database,
}: RoutePluginOptions): DiscussionPermissionsContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);

  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];

  const requireModerator = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireRoles([ADMIN_ROLE, INSTRUCTOR_ROLE]),
  ];

  const requireAdmin = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireRoles([ADMIN_ROLE]),
  ];

  return {
    middleware,
    authenticate: middleware.authenticate,
    requireAuthenticated,
    requireModerator,
    requireAdmin,
  };
}
