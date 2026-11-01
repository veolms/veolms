import type { UpdatePlatformSettingsRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { PlatformSettingsService } from "./platform-settings.service.ts";

export function createPlatformSettingsController({
  service,
}: {
  service: PlatformSettingsService;
}) {
  async function getSettings() {
    return await service.getSettings();
  }

  async function getPublicSettings() {
    return await service.getPublicSettings();
  }

  async function updateSettings(
    request: FastifyRequest<{ Body: UpdatePlatformSettingsRequest }>,
  ) {
    return await service.updateSettings(request.body, request.user?.id ?? null);
  }

  return { getSettings, getPublicSettings, updateSettings };
}
