import type {
  UpdateHomePageDiscussionRequest,
  UpdateHomePageSettingsRequest,
} from "@veolms/contracts";
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

  async function getDiscussionList() {
    return await service.getDiscussionList();
  }

  async function updateDiscussion(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: UpdateHomePageDiscussionRequest;
    }>,
  ) {
    return await service.updateDiscussion(
      request.params.threadId,
      request.body.action,
      request.user?.id ?? null,
    );
  }

  async function getLessonVideoOptions(
    request: FastifyRequest<{ Params: { courseId: string } }>,
  ) {
    return await service.getLessonVideoOptions(request.params.courseId);
  }

  async function getHeroVideoPlayback() {
    return await service.getHeroVideoPlayback();
  }

  async function getHeroVideoPlaybackToken() {
    return await service.getHeroVideoPlaybackToken();
  }

  return {
    getGuestPage,
    getSettings,
    getOptions,
    updateSettings,
    getDiscussionList,
    updateDiscussion,
    getLessonVideoOptions,
    getHeroVideoPlayback,
    getHeroVideoPlaybackToken,
  };
}

export type HomePageController = ReturnType<typeof createHomePageController>;
