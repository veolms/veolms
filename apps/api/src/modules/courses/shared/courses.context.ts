import type { Permission } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
  type AuthorizationGuard,
  type ResourceType,
} from "../../authorization/index.ts";

type PreHandler = AuthMiddleware["authenticate"];

export interface CoursesContext {
  middleware: AuthMiddleware;
  authGuard: AuthorizationGuard;
  /** Creates preHandler array: authenticate + requireAuthenticated + requireMfaVerified + authorize(permission) */
  authorize: (
    permission: Permission,
    resourceType?: ResourceType,
    featureKey?: string,
  ) => PreHandler[];
  /** As `authorize`, allowed by any one of the permissions. */
  authorizeAny: (
    permissions: readonly Permission[],
    resourceType?: ResourceType,
    featureKey?: string,
  ) => PreHandler[];
  /** As `authorize`, needing every permission `pick` reads off the request. */
  authorizeEach: (
    pick: (request: FastifyRequest) => readonly Permission[],
    resourceType?: ResourceType,
  ) => PreHandler[];
}

export function createCoursesContext({
  database,
}: RoutePluginOptions): CoursesContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);
  const authorizationService = createAuthorizationService(database);
  const authGuard = createAuthorizationGuard(authorizationService);
  const signedIn = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];

  const authorizeAny = (
    permissions: readonly Permission[],
    resourceType: ResourceType = "course",
    featureKey?: string,
  ) => [
    ...signedIn,
    authGuard.authorizeAny(permissions, resourceType, featureKey),
  ];

  const authorize = (
    permission: Permission,
    resourceType: ResourceType = "course",
    featureKey?: string,
  ) => authorizeAny([permission], resourceType, featureKey);

  const authorizeEach = (
    pick: (request: FastifyRequest) => readonly Permission[],
    resourceType: ResourceType = "course",
  ) => [...signedIn, authGuard.authorizeEach(pick, resourceType)];

  return {
    middleware,
    authGuard,
    authorize,
    authorizeAny,
    authorizeEach,
  };
}
