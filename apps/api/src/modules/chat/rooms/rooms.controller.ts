import type { FastifyReply, FastifyRequest } from "fastify";

import type { RoomsService } from "./rooms.service.ts";

type RoomParams = { Params: { roomId: string } };
type RoomUserParams = { Params: { roomId: string; userId: string } };

export function createRoomsController({ service }: { service: RoomsService }) {
  return {
    async list(
      request: FastifyRequest<{ Querystring: { archived?: boolean } }>,
    ) {
      return service.list(request.user!.id, {
        archived: request.query.archived,
      });
    },

    async detail(request: FastifyRequest<RoomParams>) {
      return service.detail(request.user!.id, request.params.roomId);
    },

    async enableCourseChat(
      request: FastifyRequest<{ Params: { courseId: string } }>,
    ) {
      return service.enableCourseChat(
        request.user!.id,
        request.params.courseId,
      );
    },

    async updateSettings(
      request: FastifyRequest<
        RoomParams & {
          Body: {
            title?: string;
            description?: string | null;
            postingPolicy?: "everyone" | "staff_only";
            slowModeSeconds?: number;
            directMessagesAllowed?: boolean;
            attachmentsAllowed?: boolean;
            status?: "active" | "locked" | "archived";
          };
        }
      >,
    ) {
      return service.updateSettings(
        request.user!.id,
        request.params.roomId,
        request.body,
      );
    },

    async updateMyState(
      request: FastifyRequest<
        RoomParams & {
          Body: {
            notifyLevel?: "all" | "mentions" | "none";
            archived?: boolean;
            pinned?: boolean;
          };
        }
      >,
    ) {
      return service.updateMyState(
        request.user!.id,
        request.params.roomId,
        request.body,
      );
    },

    async createTeamRoom(
      request: FastifyRequest<{
        Body: { title: string; description?: string; memberIds: string[] };
      }>,
      reply: FastifyReply,
    ) {
      reply.code(201);
      return service.createTeamRoom(request.user!.id, request.body);
    },

    async addTeamMembers(
      request: FastifyRequest<RoomParams & { Body: { userIds: string[] } }>,
    ) {
      return service.addTeamMembers(
        request.user!.id,
        request.params.roomId,
        request.body.userIds,
      );
    },

    async removeMember(request: FastifyRequest<RoomUserParams>) {
      return service.removeTeamMember(
        request.user!.id,
        request.params.roomId,
        request.params.userId,
      );
    },

    async leave(request: FastifyRequest<RoomParams>) {
      return service.leave(request.user!.id, request.params.roomId);
    },

    async listMembers(
      request: FastifyRequest<
        RoomParams & {
          Querystring: { search?: string; cursor?: string; limit?: number };
        }
      >,
    ) {
      return service.listMembers(
        request.user!.id,
        request.params.roomId,
        request.query,
      );
    },

    async addHelper(request: FastifyRequest<RoomUserParams>) {
      return service.setHelper(
        request.user!.id,
        request.params.roomId,
        request.params.userId,
        true,
      );
    },

    async removeHelper(request: FastifyRequest<RoomUserParams>) {
      return service.setHelper(
        request.user!.id,
        request.params.roomId,
        request.params.userId,
        false,
      );
    },
  };
}
