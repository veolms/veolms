import type { Permission } from "@veolms/contracts";
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
import {
  createAuthorizationGuard,
  createAuthorizationService,
  type AuthorizationGuard,
  type ResourceType,
} from "../../authorization/index.ts";

export interface CoursesContext {
  middleware: AuthMiddleware;
  authGuard: AuthorizationGuard;
  /** Creates preHandler array: authenticate + requireAuthenticated + requireMfaVerified + authorize(permission) */
  authorize: (
    permission: Permission,
    resourceType?: ResourceType,
    featureKey?: string,
  ) => AuthMiddleware["authenticate"][];
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
  const authorizationService = createAuthorizationService(database);
  const authGuard = createAuthorizationGuard(authorizationService);

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

  const authorize = (
    permission: Permission,
    resourceType: ResourceType = "course",
    featureKey?: string,
  ) => [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
    authGuard.authorize(permission, resourceType, featureKey),
  ];

  return {
    middleware,
    authGuard,
    authorize,
    requireCourseAuthor,
    requireAdmin,
    requireAuthenticated,
  };
}
