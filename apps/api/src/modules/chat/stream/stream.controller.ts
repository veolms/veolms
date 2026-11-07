import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import type { SessionService } from "../../auth/index.ts";
import type { ChatHub } from "../realtime/chat-hub.ts";
import { createChatStreamHandler } from "../realtime/chat-stream.ts";
import type { RoomsService } from "../rooms/rooms.service.ts";

export function createStreamController({
  hub,
  rooms,
  sessionService,
}: {
  hub: ChatHub;
  rooms: RoomsService;
  sessionService: SessionService;
}) {
  // A course group that opens later is offered to connected readers with
  // the same lookup a new stream makes.
  hub.setRoomLoader((userId) => rooms.streamRooms(userId));
  const handler = createChatStreamHandler({
    hub,
    enabled: () => config.CHAT_ENABLED,
    maxStreamsPerUser: config.CHAT_STREAM_MAX_PER_USER,
    maxStreamsPerProcess: config.CHAT_STREAM_MAX_PER_PROCESS,
    loadRooms: (userId) => rooms.streamRooms(userId),
    async stillSignedIn(request) {
      const cookie = request.cookies["veolms-session"];
      if (!cookie) return false;
      const context = await sessionService.authenticate(cookie);
      return context?.user.id === request.user?.id;
    },
  });

  return {
    async stream(request: FastifyRequest, reply: FastifyReply) {
      await handler(request, reply);
    },
  };
}
