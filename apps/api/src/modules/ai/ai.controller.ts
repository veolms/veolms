import type { UpdateAiSettingsRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { AiService } from "./ai.service.ts";

export function createAiController(service: AiService) {
  return {
    getSettings: async () => await service.getSettings(),
    updateSettings: async (request: FastifyRequest) =>
      await service.updateSettings(
        request.user!.id,
        request.body as UpdateAiSettingsRequest,
      ),
    testConnection: async () => await service.testConnection(),
    availability: async () => await service.availability(),
  };
}
