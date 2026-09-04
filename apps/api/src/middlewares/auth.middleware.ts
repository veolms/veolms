import type { FastifyReply, FastifyRequest } from "fastify";
import { httpError } from "../lib/errors.ts";
import { sessionNeedsMfaChallenge } from "../modules/auth/shared/mfa-policy.ts";
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
  requirePermission: (
    permission: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireRoles: (
    roles: string[],
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createAuthMiddleware(
  sessionService: SessionService,
): AuthMiddleware {
  function sessionHasPendingMfa(request: FastifyRequest): boolean {
    if (!request.user || !request.session) {
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
    return reply.code(403).send(httpError(403, "MFA_REQUIRED", message));
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
        .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
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
        .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
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

  function requirePermission(permission: string) {
    return async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      // 1. Ensure authenticated
      if (!request.user || !request.session) {
        return reply
          .code(401)
          .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
      }

      // 2. Enforce MFA check for users who have MFA enabled or mandatory
      if (sessionHasPendingMfa(request)) {
        return sendMfaRequired(
          reply,
          "Multi-factor authentication code required to complete action",
        );
      }

      // 3. Verify user has capability permission
      if (!request.user.permissions.includes(permission)) {
        return reply.code(403).send(httpError(403, "FORBIDDEN", "Forbidden"));
      }
    };
  }

  /**
   * Restricts a route to users holding at least one of the given roles. Must
   * be used AFTER authenticate + requireAuthenticated in the preHandler chain.
   */
  function requireRoles(roles: string[]) {
    return async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
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
            ),
          );
      }
    };
  }

  return {
    authenticate,
    requireAuthenticated,
    requireMfaVerified,
    requireMfaVerifiedIfAuthenticated,
    requirePermission,
    requireRoles,
  };
}
