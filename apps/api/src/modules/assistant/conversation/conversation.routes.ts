import {
  assistantCardListQuerySchema,
  assistantCardListResponseSchema,
  assistantCardParamsSchema,
  assistantCardResponseSchema,
  assistantConversationResponseSchema,
  assistantInfoResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import {
  assistantTags as tags,
  perPerson,
  requireAssistantEnabled,
} from "../shared/assistant.http.ts";
import { getAssistantRuntime } from "../shared/assistant.runtime.ts";
import { createConversationController } from "./conversation.controller.ts";
import { createConversationService } from "./conversation.service.ts";

const conversationRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getAssistantRuntime(
    app,
    options.database,
    options.services.storage,
  );
  const controller = createConversationController({
    service: createConversationService(runtime),
  });
  const preHandler = [...signedIn, requireAssistantEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed to use the assistant"),
    404: errorResponse("Assistant turned off or not found"),
  };

  app.get(
    "/assistant",
    {
      preHandler,
      schema: {
        operationId: "getAssistant",
        tags,
        summary: "Whether you may use the assistant, and your chat with it",
        response: {
          200: jsonResponse(
            "The assistant for you",
            assistantInfoResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.info,
  );

  app.post(
    "/assistant/conversation",
    {
      config: { rateLimit: perPerson(20, "1 minute") },
      preHandler,
      schema: {
        operationId: "openAssistantConversation",
        tags,
        summary: "Open (or find) your private chat with the assistant",
        response: {
          200: jsonResponse(
            "Your chat with the assistant",
            assistantConversationResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.open,
  );

  app.get(
    "/assistant/cards",
    {
      preHandler,
      schema: {
        operationId: "listAssistantCards",
        tags,
        summary: "The status cards of your requests in your assistant chat",
        querystring: assistantCardListQuerySchema,
        response: {
          200: jsonResponse(
            "Status cards, newest first",
            assistantCardListResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.cards,
  );

  app.post(
    "/assistant/cards/:cardId/stop",
    {
      config: { rateLimit: perPerson(20, "1 minute") },
      preHandler,
      schema: {
        operationId: "stopAssistantCard",
        tags,
        summary: "Ask the assistant to stop a running request",
        params: assistantCardParamsSchema,
        response: {
          200: jsonResponse(
            "The request, now stopping",
            assistantCardResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.stop,
  );
};

export default conversationRoutes;
