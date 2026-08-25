import type { FastifyReply, FastifyRequest } from "fastify";
import { httpError } from "../lib/errors.ts";
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

    const mfaRequired =
      request.user.mfaMandatory ||
      request.user.totpEnabled ||
      request.user.passkeyEnabled;

    if (mfaRequired && !request.session.mfa_verified) {
      return reply
        .code(403)
        .send(
          httpError(
            403,
            "MFA_REQUIRED",
            "Multi-factor authentication is required to access this resource.",
          ),
        );
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
      const mfaRequired =
        request.user.mfaMandatory ||
        request.user.totpEnabled ||
        request.user.passkeyEnabled;
      if (mfaRequired && !request.session.mfa_verified) {
        return reply
          .code(403)
          .send(
            httpError(
              403,
              "MFA_REQUIRED",
              "Multi-factor authentication code required to complete action",
            ),
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
    requirePermission,
    requireRoles,
  };
}
