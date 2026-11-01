import type {
  GuestHomePageResponse,
  HeroVideoPlayback,
  HomeDiscoveryResponse,
  HomePageLessonVideoOptionsResponse,
  HomePageOptionsResponse,
  HomePageSettings,
  HomePageSettingsResponse,
  LearnerHomeResponse,
  VideoPlaybackToken,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const homeService = {
  getDiscovery(): Promise<HomeDiscoveryResponse> {
    return api.get<HomeDiscoveryResponse>("/home/discovery");
  },
  getGuestPage(): Promise<GuestHomePageResponse> {
    return api.get<GuestHomePageResponse>("/home/guest-page");
  },
  /**
   * The signed-in learner's home in one answer. `pinnedCourseId` is the
   * course they have pinned to it in this browser, if any.
   */
  getLearnerHome(pinnedCourseId?: string | null): Promise<LearnerHomeResponse> {
    return api.get<LearnerHomeResponse>("/home/learner", {
      params: pinnedCourseId ? { pinnedCourseId } : undefined,
    });
  },
  getPageSettings(): Promise<HomePageSettingsResponse> {
    return api.get<HomePageSettingsResponse>("/home/page-settings");
  },
  getPageSettingsOptions(): Promise<HomePageOptionsResponse> {
    return api.get<HomePageOptionsResponse>("/home/page-settings/options");
  },
  getLessonVideoOptions(
    courseId: string,
  ): Promise<HomePageLessonVideoOptionsResponse> {
    return api.get<HomePageLessonVideoOptionsResponse>(
      `/home/page-settings/options/courses/${encodeURIComponent(courseId)}/lessons`,
    );
  },
  /** The stream of the video on the hero's laptop. Public. */
  getHeroVideoPlayback(): Promise<HeroVideoPlayback> {
    return api.get<HeroVideoPlayback>("/home/hero-video/playback");
  },
  getHeroVideoPlaybackToken(): Promise<VideoPlaybackToken> {
    return api.get<VideoPlaybackToken>("/home/hero-video/playback-token");
  },
  updatePageSettings(
    settings: HomePageSettings,
  ): Promise<HomePageSettingsResponse> {
    return api.put<HomePageSettingsResponse>("/home/page-settings", settings);
  },
};
