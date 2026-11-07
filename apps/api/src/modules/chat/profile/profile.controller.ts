import type { UpdateChatProfileRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { ProfileService } from "./profile.service.ts";

export function createProfileController({
  service,
}: {
  service: ProfileService;
}) {
  return {
    async get(request: FastifyRequest) {
      return service.get(request.user!.id);
    },

    async update(request: FastifyRequest<{ Body: UpdateChatProfileRequest }>) {
      return service.update(request.user!.id, request.body);
    },
  };
}
