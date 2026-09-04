import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import {
  ADMIN_ROLE,
  INSTRUCTOR_ROLE,
  createSessionService,
} from "../../auth/index.ts";

export interface CoursesContext {
  middleware: AuthMiddleware;
  /** Course authoring is restricted to administrators and instructors. */
  requireCourseAuthor: AuthMiddleware["authenticate"][];
  /** Administrator-only access. */
  requireAdmin: AuthMiddleware["authenticate"][];
  /** General authenticated access for any logged-in role. */
  requireAuthenticated: AuthMiddleware["authenticate"][];
}

export function createCoursesContext({
  database,
}: RoutePluginOptions): CoursesContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);

  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];

  const requireCourseAuthor = [
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
    requireCourseAuthor,
    requireAdmin,
    requireAuthenticated,
  };
}
