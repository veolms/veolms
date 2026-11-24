import {
  ASSISTANT_LIMITS,
  assistantCardParamsSchema,
  assistantCardResponseSchema,
  assistantCreateCardRequestSchema,
  assistantHeartbeatRequestSchema,
  assistantInboxAckRequestSchema,
  assistantInboxQuerySchema,
  assistantInboxResponseSchema,
  assistantOkResponseSchema,
  assistantRoomParamsSchema,
  assistantSendRequestSchema,
  assistantSendResponseSchema,
  assistantUpdateCardRequestSchema,
  assistantUploadParamsSchema,
  assistantUploadQuerySchema,
  assistantUploadResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import {
  assistantTags as tags,
  perAgent,
  requireAgentToken,
  requireAssistantEnabled,
} from "../shared/assistant.http.ts";
import { getAssistantRuntime } from "../shared/assistant.runtime.ts";
import { createAgentController } from "./agent.controller.ts";
import { createAgentService } from "./agent.service.ts";

const AUTH_DESCRIPTION =
  "For the agent service only: `Authorization: Assistant <token>`, never a " +
  "session cookie. The API keeps only the token's SHA-256.";

/**
 * The agent service's side of the assistant (PRD "Claude Assistant in
 * VeoLMS Chat"). The agent always calls in; the LMS never calls it.
 */
const agentRoutes: RoutePlugin = async (app, options) => {
  const runtime = getAssistantRuntime(
    app,
    options.database,
    options.services.storage,
  );
  const controller = createAgentController({
    service: createAgentService(runtime),
  });
  const preHandler = [requireAssistantEnabled, requireAgentToken];
  const common = {
    401: errorResponse("Token missing or not valid"),
    404: errorResponse("Assistant turned off, or chat or request not found"),
  };
  const limit = { rateLimit: perAgent(600, "1 minute") };

  // Files from the agent arrive as raw bytes (screenshots, reports).
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: ASSISTANT_LIMITS.uploadMaxBytes + 1024 },
    (_request, body, done) => done(null, body),
  );

  app.get(
    "/assistant/agent/inbox",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "readAssistantInbox",
        tags,
        summary: "New messages and stop clicks for the agent (long poll)",
        description: AUTH_DESCRIPTION,
        querystring: assistantInboxQuerySchema,
        response: {
          200: jsonResponse(
            "Items to save, then acknowledge",
            assistantInboxResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.inbox,
  );

  app.post(
    "/assistant/agent/inbox/ack",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "ackAssistantInbox",
        tags,
        summary: "Confirm saved messages and stop clicks",
        description: AUTH_DESCRIPTION,
        body: assistantInboxAckRequestSchema,
        response: {
          200: jsonResponse("Saved", assistantOkResponseSchema),
          ...common,
        },
      },
    },
    controller.ack,
  );

  app.post(
    "/assistant/agent/heartbeat",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "assistantHeartbeat",
        tags,
        summary: "The agent checks in (Online/Offline for people)",
        description: AUTH_DESCRIPTION,
        body: assistantHeartbeatRequestSchema,
        response: {
          200: jsonResponse("Noted", assistantOkResponseSchema),
          ...common,
        },
      },
    },
    controller.heartbeat,
  );

  app.post(
    "/assistant/agent/cards",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "createAssistantCard",
        tags,
        summary: "Post a request's status card (same id: same card)",
        description: AUTH_DESCRIPTION,
        body: assistantCreateCardRequestSchema,
        response: {
          200: jsonResponse("The card", assistantCardResponseSchema),
          ...common,
        },
      },
    },
    controller.createCard,
  );

  app.patch(
    "/assistant/agent/cards/:cardId",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "updateAssistantCard",
        tags,
        summary: "Change a status card and redraw its message",
        description: AUTH_DESCRIPTION,
        params: assistantCardParamsSchema,
        body: assistantUpdateCardRequestSchema,
        response: {
          200: jsonResponse("The card", assistantCardResponseSchema),
          409: errorResponse("The request has already finished"),
          ...common,
        },
      },
    },
    controller.updateCard,
  );

  app.post(
    "/assistant/agent/rooms/:roomId/messages",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "sendAssistantMessage",
        tags,
        summary: "Write in a chat as the assistant (idempotent by clientId)",
        description: AUTH_DESCRIPTION,
        params: assistantRoomParamsSchema,
        body: assistantSendRequestSchema,
        response: {
          200: jsonResponse("Already sent", assistantSendResponseSchema),
          201: jsonResponse("Sent", assistantSendResponseSchema),
          ...common,
        },
      },
    },
    controller.send,
  );

  app.post(
    "/assistant/agent/rooms/:roomId/uploads",
    {
      config: limit,
      preHandler: [...preHandler],
      bodyLimit: ASSISTANT_LIMITS.uploadMaxBytes + 1024,
      schema: {
        operationId: "uploadAssistantFile",
        tags,
        summary: "Store a file as the assistant's, ready to attach",
        description: `${AUTH_DESCRIPTION} Body: the raw bytes (application/octet-stream).`,
        params: assistantRoomParamsSchema,
        querystring: assistantUploadQuerySchema,
        response: {
          201: jsonResponse("Stored", assistantUploadResponseSchema),
          413: errorResponse("File too large"),
          415: errorResponse("File type not allowed"),
          ...common,
        },
      },
    },
    controller.upload,
  );

  app.get(
    "/assistant/agent/rooms/:roomId/uploads/:uploadId",
    {
      config: limit,
      preHandler: [...preHandler],
      schema: {
        operationId: "readAssistantFile",
        tags,
        summary: "Download a file someone attached in an assistant chat",
        description: AUTH_DESCRIPTION,
        params: assistantUploadParamsSchema,
        response: { ...common },
      },
    },
    controller.readFile,
  );
};

export default agentRoutes;
