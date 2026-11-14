import { errorResponse } from "../../../lib/errors.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createSessionService } from "../../auth/index.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import { createRoomsService } from "../rooms/rooms.service.ts";
import { chatTags as tags } from "../shared/chat.http.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import { createStreamController } from "./stream.controller.ts";

const streamRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createStreamController({
    hub: runtime.hub,
    rooms: createRoomsService(runtime),
    sessionService: createSessionService({ database: options.database }),
  });

  app.get(
    "/chat/stream",
    {
      preHandler: signedIn,
      schema: {
        operationId: "streamChat",
        tags,
        summary:
          "Server-Sent Events: live chat (and notification badge) updates",
        description:
          "One per tab. Events: `ready` (your chats' newest numbers), `chat.message`, " +
          "`chat.message_updated`, `chat.read`, `chat.typing`, `chat.room_updated`, " +
          "`chat.room_added` (load this chat), `chat.removed`, `resync` (catch up every open chat) " +
          "and `notifications.changed`, with a `ping` event every 25 s. Stays open while the tab is " +
          "visible; ends after about 6 hours or when the session ends.",
        response: {
          401: errorResponse("Authentication required"),
          429: errorResponse("Too many open chat streams"),
          503: errorResponse(
            "Live chat updates are off, or this server is busy",
          ),
        },
      },
    },
    controller.stream,
  );
};

export default streamRoutes;
