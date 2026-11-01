import type { RoutePluginOptions } from "../../../../lib/route-plugin.ts";
import type { AuthMiddleware } from "../../../../middlewares/auth.middleware.ts";
import { createPermissionPreHandlers } from "../../../authorization/index.ts";

export interface DiscussionPermissionsContext {
  middleware: AuthMiddleware;
  authenticate: AuthMiddleware["authenticate"];
  /** Anonymous callers pass; a signed-in caller must have completed MFA. */
  optionalAuthenticated: AuthMiddleware["authenticate"][];
  requireAuthenticated: AuthMiddleware["authenticate"][];
  /** Academy-wide moderation: reports, any post, suspensions. */
  requirePlatformModerator: AuthMiddleware["authenticate"][];
}

export function createDiscussionPermissions({
  database,
}: RoutePluginOptions): DiscussionPermissionsContext {
  const { middleware, requires } = createPermissionPreHandlers(database);

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

  // "academy": an instructor moderates in their own courses only, never
  // the platform-wide queue.
  const requirePlatformModerator = requires("discussion.moderate", "academy");

  return {
    middleware,
    authenticate: middleware.authenticate,
    optionalAuthenticated,
    requireAuthenticated,
    requirePlatformModerator,
  };
}
