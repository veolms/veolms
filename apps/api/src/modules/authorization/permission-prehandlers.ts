import type { Permission } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import {
  createAuthorizationGuard,
  type ResourceType,
} from "./authorization.guard.ts";
import { createAuthorizationService } from "./authorization.service.ts";

type PreHandler = AuthMiddleware["authenticate"];

/**
 * The preHandlers most routes need: signed in, two-factor done, then the
 * permission. `requires` takes one key or several (any of them allows).
 * The default scope, "academy", counts only roles that reach every course,
 * which is right for academy-wide pages; pass "platform" where an
 * instructor's own-course roles should count and the service checks
 * ownership.
 */
export function createPermissionPreHandlers(database: Kysely<Database>) {
  const middleware = createAuthMiddleware(createSessionService({ database }));
  const guard = createAuthorizationGuard(createAuthorizationService(database));
  const signedIn: PreHandler[] = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];

  function requires(
    permission: Permission | readonly Permission[],
    scope: ResourceType = "academy",
    featureKey?: string,
  ): PreHandler[] {
    const keys = typeof permission === "string" ? [permission] : permission;
    return [...signedIn, guard.authorizeAny(keys, scope, featureKey)];
  }

  return { middleware, guard, signedIn, requires };
}
