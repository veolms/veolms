import {
  chatBlockListResponseSchema,
  chatCandidatesQuerySchema,
  chatCandidatesResponseSchema,
  chatOkResponseSchema,
  chatRoomParamsSchema,
  chatRoomResponseSchema,
  chatStartDirectRequestSchema,
  chatStartDirectResponseSchema,
  chatUserParamsSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import {
  chatTags as tags,
  perUser,
  requireChatEnabled,
} from "../shared/chat.http.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import { createDirectController } from "./direct.controller.ts";
import { createDirectService } from "./direct.service.ts";

const directRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createDirectController({
    service: createDirectService(runtime),
  });
  const preHandler = [...signedIn, requireChatEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed"),
    404: errorResponse("Not found"),
  };

  app.post(
    "/chat/direct",
    {
      config: { rateLimit: perUser(30, "1 hour") },
      preHandler: [...preHandler],
      schema: {
        operationId: "startPrivateChat",
        tags,
        summary: "Open a private chat (a request between learners)",
        body: chatStartDirectRequestSchema,
        response: {
          201: jsonResponse("New chat", chatStartDirectResponseSchema),
          200: jsonResponse("Existing chat", chatStartDirectResponseSchema),
          429: errorResponse("Daily request limit"),
          ...common,
        },
      },
    },
    controller.start,
  );

  app.post(
    "/chat/direct/:roomId/accept",
    {
      preHandler,
      schema: {
        operationId: "acceptPrivateChat",
        tags,
        summary: "Accept a message request",
        params: chatRoomParamsSchema,
        response: {
          200: jsonResponse("The chat", chatRoomResponseSchema),
          ...common,
        },
      },
    },
    controller.accept,
  );

  app.post(
    "/chat/direct/:roomId/decline",
    {
      preHandler,
      schema: {
        operationId: "declinePrivateChat",
        tags,
        summary: "Decline a message request (the sender is not told)",
        params: chatRoomParamsSchema,
        response: {
          200: jsonResponse("Declined", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.decline,
  );

  app.get(
    "/chat/direct/candidates",
    {
      preHandler,
      schema: {
        operationId: "listPrivateChatCandidates",
        tags,
        summary:
          '"New chat": staff of your courses and classmates you may message',
        querystring: chatCandidatesQuerySchema,
        response: {
          200: jsonResponse("People", chatCandidatesResponseSchema),
          401: common[401],
        },
      },
    },
    controller.candidates,
  );

  app.get(
    "/chat/blocks",
    {
      preHandler,
      schema: {
        operationId: "listChatBlocks",
        tags,
        summary: "People you blocked",
        response: {
          200: jsonResponse("Blocked people", chatBlockListResponseSchema),
          401: common[401],
        },
      },
    },
    controller.listBlocked,
  );

  app.put(
    "/chat/blocks/:userId",
    {
      preHandler,
      schema: {
        operationId: "blockChatUser",
        tags,
        summary:
          "Block someone (they can't message you; their request is declined)",
        params: chatUserParamsSchema,
        response: {
          200: jsonResponse("Blocked", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.block,
  );

  app.delete(
    "/chat/blocks/:userId",
    {
      preHandler,
      schema: {
        operationId: "unblockChatUser",
        tags,
        summary: "Unblock someone",
        params: chatUserParamsSchema,
        response: {
          200: jsonResponse("Unblocked", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.unblock,
  );
};

export default directRoutes;
