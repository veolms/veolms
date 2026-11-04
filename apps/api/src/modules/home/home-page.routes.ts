import {
  guestHomePageResponseSchema,
  heroVideoPlaybackSchema,
  homePageDiscussionListResponseSchema,
  homePageLessonVideoOptionsResponseSchema,
  homePageOptionsResponseSchema,
  homePageSettingsResponseSchema,
  updateHomePageDiscussionRequestSchema,
  updateHomePageSettingsRequestSchema,
  videoPlaybackTokenSchema,
} from "@veolms/contracts";
import { z } from "zod";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import {
  createAttachmentsRepository,
  createThreadsRepository,
  createThreadsService,
} from "../learning/discussions/index.ts";
import { createMediaService } from "../media/index.ts";
import { getHeroVideoReadyWatch } from "./home-hero-video-ready.ts";
import { createHomeHeroVideoService } from "./home-hero-video.service.ts";
import { createHomePageController } from "./home-page.controller.ts";
import { createHomePageService } from "./home-page.service.ts";

const homePageRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  // The Platform page opens with platform.settings.read, its Home page tab
  // included: reading what the home page shows takes no more than that.
  const readsHomePageSettings = requires([
    "platform.settings.read",
    "platform.homepage.update",
  ]);

  const service = createHomePageService({
    database: options.database,
    courseService: createCourseService({
      database: options.database,
      services: options.services,
    }),
    threadsService: createThreadsService(
      createThreadsRepository(),
      createAttachmentsRepository(),
    ),
    heroVideoService: createHomeHeroVideoService({
      database: options.database,
      mediaService: createMediaService({
        database: options.database,
        services: options.services,
      }),
      storage: options.services.storage,
    }),
    staticPages: options.services.courseStaticPages,
    heroVideoReadyWatch: getHeroVideoReadyWatch({
      database: options.database,
      onReady: () =>
        options.services.courseStaticPages?.requestHomePageRefresh(),
      logger: app.log,
    }),
  });
  const controller = createHomePageController({ service });

  app.get(
    "/home/guest-page",
    {
      schema: {
        operationId: "getGuestHomePage",
        tags: ["Home"],
        summary: "Get the signed-out home page",
        description:
          "Returns the configured home page copy with the courses and discussions each section shows. `version` changes whenever the settings are saved.",
        response: {
          200: jsonResponse(
            "The resolved signed-out home page.",
            guestHomePageResponseSchema,
          ),
        },
      },
    },
    controller.getGuestPage,
  );

  app.get(
    "/home/page-settings",
    {
      preHandler: readsHomePageSettings,
      schema: {
        operationId: "getHomePageSettings",
        tags: ["Home"],
        summary: "Get the home page settings",
        response: {
          200: jsonResponse(
            "The saved settings, or the defaults when none were saved.",
            homePageSettingsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getSettings,
  );

  app.get(
    "/home/page-settings/options",
    {
      preHandler: readsHomePageSettings,
      schema: {
        operationId: "getHomePageSettingsOptions",
        tags: ["Home"],
        summary: "List what the home page settings can choose from",
        description:
          "Returns the published courses and the most active public discussions an admin can feature, pin or hide.",
        response: {
          200: jsonResponse(
            "Selectable courses and discussions.",
            homePageOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getOptions,
  );

  app.get(
    "/home/page-settings/options/courses/:courseId/lessons",
    {
      preHandler: readsHomePageSettings,
      schema: {
        operationId: "getHomePageLessonVideoOptions",
        tags: ["Home"],
        summary: "List a course's lesson videos for the hero",
        description:
          "Returns the published lessons with a video of a published course, numbered as the course player numbers them, for choosing the video on the hero's laptop.",
        params: z.object({ courseId: z.uuid() }),
        response: {
          200: jsonResponse(
            "The course's lessons that have a video.",
            homePageLessonVideoOptionsResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getLessonVideoOptions,
  );

  app.get(
    "/home/hero-video/playback",
    {
      schema: {
        operationId: "getHomeHeroVideoPlayback",
        tags: ["Home"],
        summary: "Play the home page's hero video",
        description:
          "Returns the stream of the video an admin chose for the hero's laptop (a lesson's video or an upload), or of the default lesson. It is public: choosing it makes it so.",
        response: {
          200: jsonResponse(
            "The hero video's stream.",
            heroVideoPlaybackSchema,
          ),
          404: errorResponse("No video to play"),
          409: errorResponse("The video is still being processed"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
    },
    controller.getHeroVideoPlayback,
  );

  app.get(
    "/home/hero-video/playback-token",
    {
      schema: {
        operationId: "getHomeHeroVideoPlaybackToken",
        tags: ["Home"],
        summary: "Renew the hero video's segment token",
        response: {
          200: jsonResponse("A fresh segment token.", videoPlaybackTokenSchema),
          404: errorResponse("No video to play"),
          409: errorResponse("The video is not ready or needs no token"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
    },
    controller.getHeroVideoPlaybackToken,
  );

  app.put(
    "/home/page-settings",
    {
      preHandler: requires("platform.homepage.update"),
      schema: {
        operationId: "updateHomePageSettings",
        tags: ["Home"],
        summary: "Save the home page settings",
        body: updateHomePageSettingsRequestSchema,
        response: {
          200: jsonResponse(
            "The saved settings.",
            homePageSettingsResponseSchema,
          ),
          400: errorResponse("Invalid settings"),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          503: errorResponse("Settings storage is not available yet"),
        },
      },
    },
    controller.updateSettings,
  );

  app.get(
    "/home/page-settings/discussions",
    {
      preHandler: readsHomePageSettings,
      schema: {
        operationId: "getHomePageDiscussionList",
        tags: ["Home"],
        summary: "List the comments chosen for the home page",
        response: {
          200: jsonResponse(
            "The listed and hidden comment ids.",
            homePageDiscussionListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.getDiscussionList,
  );

  app.post(
    "/home/page-settings/discussions/:threadId",
    {
      preHandler: requires("platform.homepage.update"),
      schema: {
        operationId: "updateHomePageDiscussion",
        tags: ["Home"],
        summary: "Add a comment to the home page, or hide or remove it",
        description:
          "Changes one comment on the home page's list and saves the settings straight away, so a lesson or the Discussions page can feature a comment without opening the settings.",
        params: z.object({ threadId: z.uuid() }),
        body: updateHomePageDiscussionRequestSchema,
        response: {
          200: jsonResponse(
            "The list after the change.",
            homePageDiscussionListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          409: errorResponse("The comment cannot be listed"),
          503: errorResponse("Settings storage is not available yet"),
        },
      },
    },
    controller.updateDiscussion,
  );
};

export default homePageRoutes;
