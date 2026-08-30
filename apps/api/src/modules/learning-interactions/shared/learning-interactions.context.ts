import type { FastifyReply, FastifyRequest } from "fastify";
import { httpError } from "../../../lib/errors.ts";
import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";

export interface LearningInteractionsContext {
  middleware: AuthMiddleware;
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAuthenticated: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
  requireModerator: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<void>;
}

export function createLearningInteractionsContext({
  database,
}: RoutePluginOptions): LearningInteractionsContext {
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);

  const requireModerator = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await middleware.authenticate(request, reply);
    if (reply.sent) return;
    await middleware.requireAuthenticated(request, reply);
    if (reply.sent) return;
    const roleChecker = middleware.requireRoles(["admin", "instructor", "creator"]);
    await roleChecker(request, reply);
  };

  return {
    middleware,
    authenticate: middleware.authenticate,
    requireAuthenticated: middleware.requireAuthenticated,
    requireModerator,
  };
}
