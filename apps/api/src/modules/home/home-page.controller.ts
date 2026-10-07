import type { UpdateHomePageSettingsRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { HomePageService } from "./home-page.service.ts";

export function createHomePageController({
  service,
}: {
  service: HomePageService;
}) {
  async function getGuestPage() {
    return await service.getGuestPage();
  }

  async function getSettings() {
    return await service.getSettings();
  }

  async function getOptions() {
    return await service.getOptions();
  }

  async function updateSettings(
    request: FastifyRequest<{ Body: UpdateHomePageSettingsRequest }>,
  ) {
    return await service.updateSettings(request.body, request.user?.id ?? null);
  }

  return { getGuestPage, getSettings, getOptions, updateSettings };
}

export type HomePageController = ReturnType<typeof createHomePageController>;
