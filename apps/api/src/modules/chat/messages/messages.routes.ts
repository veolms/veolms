import {
  chatChangesQuerySchema,
  chatChangesResponseSchema,
  chatDeleteMessageQuerySchema,
  chatEditMessageRequestSchema,
  chatMessageListQuerySchema,
  chatMessageListResponseSchema,
  chatMessageParamsSchema,
  chatMessageResponseSchema,
  chatOkResponseSchema,
  chatReactionRequestSchema,
  chatReceiptsRequestSchema,
  chatRoomParamsSchema,
  chatSendMessageRequestSchema,
  chatSendMessageResponseSchema,
  chatStarListResponseSchema,
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
import { createMessagesController } from "./messages.controller.ts";
import { createMessagesService } from "./messages.service.ts";

const messagesRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createMessagesController({
    service: createMessagesService(runtime),
  });
  const preHandler = [...signedIn, requireChatEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed in this chat"),
    404: errorResponse("Chat or message not found"),
  };

  app.get(
    "/chat/rooms/:roomId/messages",
    {
      preHandler,
      schema: {
        operationId: "listChatMessages",
        tags,
        summary:
          "A page of messages: the latest, before, after or around a number",
        params: chatRoomParamsSchema,
        querystring: chatMessageListQuerySchema,
        response: {
          200: jsonResponse(
            "Messages, oldest first",
            chatMessageListResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.list,
  );

  app.get(
    "/chat/rooms/:roomId/changes",
    {
      preHandler,
      schema: {
        operationId: "listChatChanges",
        tags,
        summary: "Everything new or changed since a change number (catch-up)",
        description:
          "Answers `reset: true` when too far behind (more than 200 changes) or when the chat's numbers went back; the client then reloads the latest page.",
        params: chatRoomParamsSchema,
        querystring: chatChangesQuerySchema,
        response: {
          200: jsonResponse("Changed messages", chatChangesResponseSchema),
          ...common,
        },
      },
    },
    controller.changes,
  );

  app.post(
    "/chat/rooms/:roomId/messages",
    {
      config: { rateLimit: perUser(10, "10 seconds") },
      preHandler: [...preHandler],
      schema: {
        operationId: "sendChatMessage",
        tags,
        summary: "Send a message",
        description:
          "Idempotent by `clientId`: sending the same id again returns the stored message (200) instead of a second copy (201).",
        params: chatRoomParamsSchema,
        body: chatSendMessageRequestSchema,
        response: {
          201: jsonResponse("The message", chatSendMessageResponseSchema),
          200: jsonResponse("Already sent", chatSendMessageResponseSchema),
          400: errorResponse("Invalid message"),
          429: errorResponse(
            "Slow mode, repeated message or too many messages",
          ),
          ...common,
        },
      },
    },
    controller.send,
  );

  app.patch(
    "/chat/rooms/:roomId/messages/:seq",
    {
      config: { rateLimit: perUser(20, "1 minute") },
      preHandler: [...preHandler],
      schema: {
        operationId: "editChatMessage",
        tags,
        summary: "Edit your message (within 15 minutes)",
        params: chatMessageParamsSchema,
        body: chatEditMessageRequestSchema,
        response: {
          200: jsonResponse("The edited message", chatMessageResponseSchema),
          ...common,
        },
      },
    },
    controller.edit,
  );

  app.delete(
    "/chat/rooms/:roomId/messages/:seq",
    {
      preHandler,
      schema: {
        operationId: "deleteChatMessage",
        tags,
        summary: "Delete for everyone (yours, or as group admin) or for me",
        params: chatMessageParamsSchema,
        querystring: chatDeleteMessageQuerySchema,
        response: {
          200: jsonResponse("Deleted", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.remove,
  );

  app.post(
    "/chat/rooms/:roomId/messages/:seq/restore",
    {
      preHandler,
      schema: {
        operationId: "restoreChatMessage",
        tags,
        summary: "Restore a message an admin deleted (within 7 days)",
        params: chatMessageParamsSchema,
        response: {
          200: jsonResponse("The restored message", chatMessageResponseSchema),
          409: errorResponse("No longer restorable"),
          ...common,
        },
      },
    },
    controller.restore,
  );

  app.put(
    "/chat/rooms/:roomId/messages/:seq/pin",
    {
      preHandler,
      schema: {
        operationId: "pinChatMessage",
        tags,
        summary: "Pin a message (up to 3 per chat)",
        params: chatMessageParamsSchema,
        response: {
          200: jsonResponse("The message", chatMessageResponseSchema),
          409: errorResponse("Pin limit reached"),
          ...common,
        },
      },
    },
    controller.pin,
  );

  app.delete(
    "/chat/rooms/:roomId/messages/:seq/pin",
    {
      preHandler,
      schema: {
        operationId: "unpinChatMessage",
        tags,
        summary: "Unpin a message",
        params: chatMessageParamsSchema,
        response: {
          200: jsonResponse("The message", chatMessageResponseSchema),
          ...common,
        },
      },
    },
    controller.unpin,
  );

  app.put(
    "/chat/rooms/:roomId/messages/:seq/reaction",
    {
      config: { rateLimit: perUser(60, "1 minute") },
      preHandler: [...preHandler],
      schema: {
        operationId: "reactToChatMessage",
        tags,
        summary: "React with one emoji (null removes your reaction)",
        params: chatMessageParamsSchema,
        body: chatReactionRequestSchema,
        response: {
          200: jsonResponse("The message", chatMessageResponseSchema),
          400: errorResponse("Not one emoji"),
          ...common,
        },
      },
    },
    controller.react,
  );

  app.put(
    "/chat/rooms/:roomId/messages/:seq/star",
    {
      preHandler,
      schema: {
        operationId: "starChatMessage",
        tags,
        summary: "Star a message",
        params: chatMessageParamsSchema,
        response: {
          200: jsonResponse("Starred", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.star,
  );

  app.delete(
    "/chat/rooms/:roomId/messages/:seq/star",
    {
      preHandler,
      schema: {
        operationId: "unstarChatMessage",
        tags,
        summary: "Unstar a message",
        params: chatMessageParamsSchema,
        response: {
          200: jsonResponse("Unstarred", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.unstar,
  );

  app.get(
    "/chat/stars",
    {
      preHandler,
      schema: {
        operationId: "listStarredChatMessages",
        tags,
        summary: "Your starred messages",
        response: {
          200: jsonResponse("Starred messages", chatStarListResponseSchema),
          401: common[401],
        },
      },
    },
    controller.listStars,
  );

  app.post(
    "/chat/receipts",
    {
      config: { rateLimit: perUser(60, "1 minute") },
      preHandler: [...preHandler],
      schema: {
        operationId: "saveChatReceipts",
        tags,
        summary: "Read / delivered positions (batched; send every few seconds)",
        body: chatReceiptsRequestSchema,
        response: {
          200: jsonResponse("Queued", chatOkResponseSchema),
          401: common[401],
        },
      },
    },
    controller.receipts,
  );

  app.post(
    "/chat/rooms/:roomId/typing",
    {
      config: { rateLimit: perUser(30, "1 minute") },
      preHandler: [...preHandler],
      schema: {
        operationId: "sendChatTyping",
        tags,
        summary:
          '"typing…" in a private chat or team group (send at most every 3 s)',
        params: chatRoomParamsSchema,
        response: {
          200: jsonResponse("Sent", chatOkResponseSchema),
          400: errorResponse("Not in course groups"),
          ...common,
        },
      },
    },
    controller.typing,
  );
};

export default messagesRoutes;
