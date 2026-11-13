import { normalizeIP } from "@fastify/rate-limit";
import {
  pushActionReadResponseSchema,
  pushActionReplyRequestSchema,
  pushActionReplyResponseSchema,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { chatTags as tags, requireChatEnabled } from "../shared/chat.http.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import {
  createPushActionsController,
  pushActionTokenOf,
} from "./push-actions.controller.ts";
import { createPushActionsService } from "./push-actions.service.ts";

declare module "fastify" {
  interface FastifyRequest {
    /** The push action token's user, for rate limits (not yet checked). */
    pushActionUserId?: string | null;
  }
}

/**
 * Per user, like the chat routes (the token's user; unknown tokens by IP,
 * so guessing is limited too). Runs after the preHandlers below. Each
 * action counts on its own (`action` in the key).
 */
function perTokenUser(action: string, max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      `${action}:${request.pushActionUserId ?? normalizeIP(request.ip)}`,
  } as const;
}

const pushActionRoutes: RoutePlugin = async (app, options) => {
  const service = createPushActionsService(
    getChatRuntime(app, options.database),
  );
  const controller = createPushActionsController({ service });
  const preHandler = [
    requireChatEnabled,
    async (request: FastifyRequest) => {
      request.pushActionUserId = await service.peekUserId(
        pushActionTokenOf(request),
      );
    },
  ];
  const common = {
    401: errorResponse(
      "Token invalid, expired, or its login signed out (PUSH_ACTION_*)",
    ),
    403: errorResponse("Not allowed in this chat"),
    404: errorResponse("Chat turned off or not found"),
    429: errorResponse("Too many requests, or slow mode"),
  };

  app.post(
    "/push-actions/chat/reply",
    {
      config: { rateLimit: perTokenUser("reply", 10, "10 seconds") },
      // A copy each: the rate limit adds its hook to the array it is given.
      preHandler: [...preHandler],
      schema: {
        operationId: "replyFromChatPush",
        tags,
        summary: "Reply to a chat from its phone notification",
        description:
          "For the app's native code: `Authorization: PushAction pat_...` " +
          "with the token from the chat push, never the session cookie. " +
          "Idempotent by `clientId` (a retry with the same token and id " +
          "answers 200 with the stored message and a fresh token). Returns " +
          "the token for the next reply.",
        body: pushActionReplyRequestSchema,
        response: {
          201: jsonResponse("Sent", pushActionReplyResponseSchema),
          200: jsonResponse("Already sent", pushActionReplyResponseSchema),
          400: errorResponse("Invalid message"),
          409: errorResponse("Read since the push (PUSH_ACTION_STALE)"),
          ...common,
        },
      },
    },
    controller.reply,
  );

  app.post(
    "/push-actions/chat/read",
    {
      config: { rateLimit: perTokenUser("read", 30, "1 minute") },
      // A copy each: the rate limit adds its hook to the array it is given.
      preHandler: [...preHandler],
      schema: {
        operationId: "markReadFromChatPush",
        tags,
        summary: "Mark a chat read from its phone notification",
        description:
          "Read up to the push's message; spends the token. Same " +
          "`Authorization: PushAction pat_...` header as the reply.",
        response: {
          200: jsonResponse("Read", pushActionReadResponseSchema),
          ...common,
        },
      },
    },
    controller.read,
  );
};

export default pushActionRoutes;
