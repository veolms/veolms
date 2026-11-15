import {
  PUSH_ACTION_AUTH_SCHEME,
  type PushActionReplyRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { PushActionsService } from "./push-actions.service.ts";

/**
 * The token from `Authorization: PushAction pat_...`, or "" (then refused
 * as invalid). Cookies are never read on these routes.
 */
export function pushActionTokenOf(request: FastifyRequest): string {
  const header = request.headers.authorization ?? "";
  const [scheme, token] = header.trim().split(/\s+/u);
  return scheme === PUSH_ACTION_AUTH_SCHEME && token ? token : "";
}

export function createPushActionsController({
  service,
}: {
  service: PushActionsService;
}) {
  return {
    async reply(
      request: FastifyRequest<{ Body: PushActionReplyRequest }>,
      reply: FastifyReply,
    ) {
      const result = await service.reply(
        pushActionTokenOf(request),
        request.body,
      );
      reply.code(result.duplicate ? 200 : 201);
      return result.response;
    },

    async read(request: FastifyRequest) {
      return await service.markRead(pushActionTokenOf(request));
    },
  };
}
