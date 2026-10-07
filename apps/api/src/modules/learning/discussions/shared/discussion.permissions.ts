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
  /** Anonymous callers pass; a signed-in caller must have completed MFA. */
  optionalAuthenticated: AuthMiddleware["authenticate"][];
  requireAuthenticated: AuthMiddleware["authenticate"][];
  requireModerator: AuthMiddleware["authenticate"][];
  requireAdmin: AuthMiddleware["authenticate"][];
}

export function createDiscussionPermissions({
  database,
}: RoutePluginOptions): DiscussionPermissionsContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);

  // Every chain enforces MFA step-up, like the courses and commerce
  // contexts. Without it a session that had only passed the first factor
  // could post, delete and run course moderation (remove threads, suspend
  // users, read reports) on an MFA-protected staff account.
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];

  const optionalAuthenticated = [
    middleware.authenticate,
    middleware.requireMfaVerifiedIfAuthenticated,
  ];

  const requireModerator = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
    middleware.requireRoles([ADMIN_ROLE, INSTRUCTOR_ROLE]),
  ];

  const requireAdmin = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
    middleware.requireRoles([ADMIN_ROLE]),
  ];

  return {
    middleware,
    authenticate: middleware.authenticate,
    optionalAuthenticated,
    requireAuthenticated,
    requireModerator,
    requireAdmin,
  };
}
