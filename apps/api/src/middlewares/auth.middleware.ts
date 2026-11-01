import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preValidationHookHandler,
} from "fastify";
import { config } from "../config.ts";
import { httpError } from "../lib/errors.ts";
import {
  sessionNeedsMfaChallenge,
  skipsStaffMfa,
} from "../modules/auth/shared/mfa-policy.ts";
import type { SessionService } from "../modules/auth/index.ts";

export interface AuthMiddleware {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAuthenticated: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requireMfaVerified: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  /** Allows anonymous requests, but blocks an authenticated session pending MFA. */
  requireMfaVerifiedIfAuthenticated: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requireRoles: (
    roles: string[],
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/**
 * The guards built in this file. They read the session cookie and the
 * signed-in user only, never the params, query or body, so they are safe to
 * run on input that has not been validated yet.
 */
const sessionGuards = new WeakSet<object>();

function sessionGuard<Guard extends object>(guard: Guard): Guard {
  sessionGuards.add(guard);
  return guard;
}

/**
 * Makes every route check the session before it validates the request.
 *
 * Routes list their guards under `preHandler`, which runs after validation,
 * so a caller who was not signed in (or lacked the role) was told what was
 * wrong with the request, field by field, instead of 401 or 403. The session
 * guards a route starts its `preHandler` list with are moved to
 * `preValidation`, in the same order. Everything from the first other guard
 * on (permission checks that look a course or a lesson up by id, rate limits
 * counted per account) stays after validation, so no unvalidated id reaches
 * the database.
 *
 * Call it before the routes are registered.
 */
export function checkSessionBeforeValidation(app: FastifyInstance): void {
  app.addHook("onRoute", (routeOptions) => {
    const { preHandler, preValidation } = routeOptions;
    if (!preHandler) return;

    const handlers = Array.isArray(preHandler) ? preHandler : [preHandler];
    let count = 0;
    while (count < handlers.length && sessionGuards.has(handlers[count]!)) {
      count += 1;
    }
    if (count === 0) return;

    const earlier = preValidation
      ? Array.isArray(preValidation)
        ? preValidation
        : [preValidation]
      : [];
    // New arrays: modules share one guard list between many routes.
    routeOptions.preValidation = [
      ...earlier,
      ...(handlers.slice(0, count) as preValidationHookHandler[]),
    ];
    routeOptions.preHandler = handlers.slice(count);
  });
}

export function createAuthMiddleware(
  sessionService: SessionService,
): AuthMiddleware {
  function sessionHasPendingMfa(request: FastifyRequest): boolean {
    if (!request.user || !request.session) {
      return false;
    }

    if (skipsStaffMfa(config.SKIP_ADMIN_MFA, request.user.roles)) {
      return false;
    }

    return sessionNeedsMfaChallenge({
      mfaMandatory: request.user.mfaMandatory,
      totpEnabled: request.user.totpEnabled,
      passkeyEnabled: request.user.passkeyEnabled,
      mfaVerified: request.session.mfa_verified,
    });
  }

  function sendMfaRequired(
    reply: FastifyReply,
    message = "Multi-factor authentication is required to access this resource.",
  ) {
    return reply
      .code(403)
      .send(httpError(403, "MFA_REQUIRED", message).toJSON());
  }

  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.user = null;
    request.session = null;

    const sessionCookie = request.cookies["veolms-session"];
    if (!sessionCookie) {
      return;
    }

    const authenticated = await sessionService.authenticate(sessionCookie);
    if (!authenticated) return;

    request.user = authenticated.user;
    request.session = authenticated.session;
  }

  async function requireAuthenticated(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply
        .code(401)
        .send(
          httpError(401, "UNAUTHORIZED", "Authentication required").toJSON(),
        );
    }
  }

  /**
   * Enforces MFA step-up for users who have any MFA factor enabled.
   * Must be used AFTER authenticate + requireAuthenticated in the preHandler chain.
   */
  async function requireMfaVerified(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user || !request.session) {
      return reply
        .code(401)
        .send(
          httpError(401, "UNAUTHORIZED", "Authentication required").toJSON(),
        );
    }

    if (sessionHasPendingMfa(request)) {
      return sendMfaRequired(reply);
    }
  }

  async function requireMfaVerifiedIfAuthenticated(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (sessionHasPendingMfa(request)) {
      return sendMfaRequired(reply);
    }
  }

  /**
   * Restricts a route to users holding at least one of the given roles. Must
   * be used AFTER authenticate + requireAuthenticated in the preHandler chain.
   */
  function requireRoles(roles: string[]) {
    return sessionGuard(async function requireRolesGuard(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const user = request.user;
      if (sessionHasPendingMfa(request)) {
        return sendMfaRequired(reply);
      }

      if (!user || !roles.some((role) => user.roles.includes(role))) {
        return reply
          .code(403)
          .send(
            httpError(
              403,
              "FORBIDDEN",
              "You do not have permission to access this resource.",
            ).toJSON(),
          );
      }
    });
  }

  return {
    authenticate: sessionGuard(authenticate),
    requireAuthenticated: sessionGuard(requireAuthenticated),
    requireMfaVerified: sessionGuard(requireMfaVerified),
    requireMfaVerifiedIfAuthenticated: sessionGuard(
      requireMfaVerifiedIfAuthenticated,
    ),
    requireRoles,
  };
}
