import {
  chatProfileSchema,
  updateChatProfileRequestSchema,
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
import { createProfileController } from "./profile.controller.ts";
import { createProfileService } from "./profile.service.ts";

const profileRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createProfileController({
    service: createProfileService(runtime),
  });
  const preHandler = [...signedIn, requireChatEnabled];

  app.get(
    "/chat/me/profile",
    {
      preHandler,
      schema: {
        operationId: "getChatProfile",
        tags,
        summary: "Your chat privacy and preferences",
        response: {
          200: jsonResponse("Your chat settings", chatProfileSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.get,
  );

  app.patch(
    "/chat/me/profile",
    {
      config: { rateLimit: perUser(30, "1 minute") },
      preHandler,
      schema: {
        operationId: "updateChatProfile",
        tags,
        summary: "Change last seen and online, read receipts or Enter is send",
        body: updateChatProfileRequestSchema,
        response: {
          200: jsonResponse("Your chat settings", chatProfileSchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.update,
  );
};

export default profileRoutes;
