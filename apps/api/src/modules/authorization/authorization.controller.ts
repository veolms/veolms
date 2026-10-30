import type { FastifyReply, FastifyRequest } from "fastify";
import type { CapabilitiesQuery } from "@veolms/contracts";
import type { AuthorizationService } from "./authorization.service.ts";
import { httpError } from "../../lib/errors.ts";

export interface AuthorizationController {
  getCapabilities: (
    request: FastifyRequest<{ Querystring: CapabilitiesQuery }>,
    reply: FastifyReply,
  ) => Promise<void>;
}

export function createAuthorizationController(options: {
  service: AuthorizationService;
}): AuthorizationController {
  const { service } = options;

  return {
    async getCapabilities(
      request: FastifyRequest<{ Querystring: CapabilitiesQuery }>,
      reply: FastifyReply,
    ): Promise<void> {
      if (!request.user) {
        return reply
          .code(401)
          .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
      }

      const { courseId } = request.query;

      const capabilities = await service.getCapabilities({
        userId: request.user.id,
        courseId,
      });

      return reply.code(200).send(capabilities);
    },
  };
}
