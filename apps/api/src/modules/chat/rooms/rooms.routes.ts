import {
  chatClearRoomRequestSchema,
  chatCourseParamsSchema,
  chatCreateTeamRoomRequestSchema,
  chatMemberListQuerySchema,
  chatMemberListResponseSchema,
  chatMemberStateRequestSchema,
  chatOkResponseSchema,
  chatRoomListQuerySchema,
  chatRoomListResponseSchema,
  chatRoomParamsSchema,
  chatRoomResponseSchema,
  chatRoomSettingsRequestSchema,
  chatRoomUserParamsSchema,
  chatTeamMembersRequestSchema,
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
import { createRoomsController } from "./rooms.controller.ts";
import { createRoomsService } from "./rooms.service.ts";

const roomsRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createRoomsController({
    service: createRoomsService(runtime),
  });
  const preHandler = [...signedIn, requireChatEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed"),
    404: errorResponse("Chat not found"),
  };
  const room = jsonResponse("The chat", chatRoomResponseSchema);

  app.get(
    "/chat/rooms",
    {
      preHandler,
      schema: {
        operationId: "listMyChats",
        tags,
        summary:
          "Your chats: course groups, team groups, private chats and requests",
        querystring: chatRoomListQuerySchema,
        response: {
          200: jsonResponse(
            "Chats, pinned first, then newest",
            chatRoomListResponseSchema,
          ),
          401: common[401],
        },
      },
    },
    controller.list,
  );

  app.get(
    "/chat/rooms/:roomId",
    {
      preHandler,
      schema: {
        operationId: "getChat",
        tags,
        summary: "One chat with its settings and pinned messages (group info)",
        params: chatRoomParamsSchema,
        response: { 200: room, ...common },
      },
    },
    controller.detail,
  );

  app.post(
    "/chat/courses/:courseId/room",
    {
      preHandler,
      schema: {
        operationId: "enableCourseChat",
        tags,
        summary: "Turn on the course group (instructors of the course, admins)",
        description:
          "Open free courses start as announcement groups (only admins send).",
        params: chatCourseParamsSchema,
        response: { 200: room, ...common },
      },
    },
    controller.enableCourseChat,
  );

  app.patch(
    "/chat/rooms/:roomId/settings",
    {
      preHandler,
      schema: {
        operationId: "updateChatSettings",
        tags,
        summary:
          "Group settings: who sends, slow mode, private chats, lock, archive",
        params: chatRoomParamsSchema,
        body: chatRoomSettingsRequestSchema,
        response: { 200: room, ...common },
      },
    },
    controller.updateSettings,
  );

  app.patch(
    "/chat/rooms/:roomId/me",
    {
      preHandler,
      schema: {
        operationId: "updateMyChatState",
        tags,
        summary: "Mute notifications, archive or pin this chat for yourself",
        params: chatRoomParamsSchema,
        body: chatMemberStateRequestSchema,
        response: {
          200: room,
          409: errorResponse("Pin limit reached"),
          ...common,
        },
      },
    },
    controller.updateMyState,
  );

  app.post(
    "/chat/team-rooms",
    {
      config: { rateLimit: perUser(20, "1 hour") },
      preHandler: [...preHandler],
      schema: {
        operationId: "createTeamChat",
        tags,
        summary: "Create a team group (chat managers)",
        body: chatCreateTeamRoomRequestSchema,
        response: { 201: room, ...common },
      },
    },
    controller.createTeamRoom,
  );

  app.post(
    "/chat/rooms/:roomId/members",
    {
      preHandler,
      schema: {
        operationId: "addTeamChatMembers",
        tags,
        summary: "Add people to a team group",
        params: chatRoomParamsSchema,
        body: chatTeamMembersRequestSchema,
        response: { 200: room, ...common },
      },
    },
    controller.addTeamMembers,
  );

  app.delete(
    "/chat/rooms/:roomId/members/:userId",
    {
      preHandler,
      schema: {
        operationId: "removeTeamChatMember",
        tags,
        summary: "Remove someone from a team group",
        params: chatRoomUserParamsSchema,
        response: {
          200: jsonResponse("Removed", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.removeMember,
  );

  app.post(
    "/chat/rooms/:roomId/clear",
    {
      preHandler,
      schema: {
        operationId: "clearChat",
        tags,
        summary:
          "Clear a chat for you, or delete a private chat from your list",
        params: chatRoomParamsSchema,
        body: chatClearRoomRequestSchema,
        response: {
          200: jsonResponse("Cleared", chatOkResponseSchema),
          400: errorResponse("Only private chats can be deleted"),
          ...common,
        },
      },
    },
    controller.clear,
  );

  app.post(
    "/chat/rooms/:roomId/leave",
    {
      preHandler,
      schema: {
        operationId: "leaveChat",
        tags,
        summary:
          "Exit a team group (course groups follow enrolment: mute instead)",
        params: chatRoomParamsSchema,
        response: {
          200: jsonResponse("Left", chatOkResponseSchema),
          400: errorResponse("Course groups can't be left"),
          ...common,
        },
      },
    },
    controller.leave,
  );

  app.get(
    "/chat/rooms/:roomId/members",
    {
      preHandler,
      schema: {
        operationId: "listChatMembers",
        tags,
        summary: "Members, by name (group admins and helpers tagged)",
        params: chatRoomParamsSchema,
        querystring: chatMemberListQuerySchema,
        response: {
          200: jsonResponse("Members", chatMemberListResponseSchema),
          ...common,
        },
      },
    },
    controller.listMembers,
  );

  app.put(
    "/chat/rooms/:roomId/helpers/:userId",
    {
      preHandler,
      schema: {
        operationId: "addChatHelper",
        tags,
        summary: "Make a learner a helper in this course group",
        params: chatRoomUserParamsSchema,
        response: {
          200: jsonResponse("Done", chatOkResponseSchema),
          409: errorResponse("Helper limit reached"),
          ...common,
        },
      },
    },
    controller.addHelper,
  );

  app.delete(
    "/chat/rooms/:roomId/helpers/:userId",
    {
      preHandler,
      schema: {
        operationId: "removeChatHelper",
        tags,
        summary: "Remove a helper",
        params: chatRoomUserParamsSchema,
        response: {
          200: jsonResponse("Done", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.removeHelper,
  );
};

export default roomsRoutes;
