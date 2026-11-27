import type {
  AiCustomModelRequest,
  AiProvider,
  SaveAiProviderRequest,
  TestAiConnectionRequest,
  UpdateAiSettingsRequest,
} from "@veolms/contracts";
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
    saveProvider: async (request: FastifyRequest) =>
      await service.saveProvider(
        request.user!.id,
        (request.params as { provider: AiProvider }).provider,
        request.body as SaveAiProviderRequest,
      ),
    addModel: async (request: FastifyRequest) =>
      await service.addModel(
        request.user!.id,
        request.body as AiCustomModelRequest,
      ),
    removeModel: async (request: FastifyRequest) =>
      await service.removeModel(
        (request.params as { modelId: string }).modelId,
      ),
    testConnection: async (request: FastifyRequest) =>
      await service.testConnection(
        (request.body ?? {}) as TestAiConnectionRequest,
      ),
    availability: async () => await service.availability(),
  };
}
