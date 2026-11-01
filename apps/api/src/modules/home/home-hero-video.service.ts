import {
  HOME_PAGE_HERO_LESSON,
  type HeroVideoPlayback,
  type HomePageHeroVideo,
  type HomePageLessonVideoOption,
  type VideoPlaybackToken,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { httpError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import type {
  MediaService,
  VideoAssetForPlayback,
} from "../media/media.service.ts";
import {
  findPublishedLesson,
  findPublishedLessonByNumber,
  findVideoAsset,
  listPublishedCourseLessons,
  type HeroLessonRow,
} from "./home-hero-video.repository.ts";

/**
 * The video the hero's laptop plays, found: the asset to stream, and what
 * the laptop shows before it is played (its course's thumbnail, or the
 * frame captured from an uploaded video).
 */
interface ResolvedHeroVideo {
  media: VideoAssetForPlayback;
  mediaKey: string;
  title: string | null;
  poster: { courseId: string } | { url: string | null };
}

function fromLesson(row: HeroLessonRow): ResolvedHeroVideo | null {
  if (!row.media_id || row.media_type !== "video") return null;
  return {
    media: {
      id: row.media_id,
      type: row.media_type,
      status: row.media_status,
      storageKey: row.media_storage_key,
      durationSeconds: row.duration_seconds,
    },
    mediaKey: `home-hero-lesson-${row.lesson_id}`,
    title: row.lesson_title,
    poster: { courseId: row.course_id },
  };
}

export type HomeHeroVideoService = ReturnType<
  typeof createHomeHeroVideoService
>;

/**
 * The video on the laptop in the home page's hero. An admin picks it in the
 * home page settings; it is then public, whatever the access rules of the
 * lesson it comes from, because the admin chose to show it to everyone.
 */
export function createHomeHeroVideoService({
  database,
  mediaService,
  storage,
}: {
  database: Kysely<Database>;
  mediaService: Pick<
    MediaService,
    "getVideoAssetPlayback" | "getVideoAssetPlaybackToken"
  >;
  storage: Pick<AppServices["storage"], "getCdnObjectUrl">;
}) {
  async function resolveDefault(): Promise<ResolvedHeroVideo | null> {
    const row = await findPublishedLessonByNumber(
      database,
      HOME_PAGE_HERO_LESSON.courseSlug,
      HOME_PAGE_HERO_LESSON.lessonNumber,
    );
    return row ? fromLesson(row) : null;
  }

  /**
   * The configured video, or the default lesson when the chosen one is no
   * longer there (its lesson deleted or unpublished, say).
   */
  async function resolve(
    heroVideo: HomePageHeroVideo,
  ): Promise<ResolvedHeroVideo | null> {
    if (heroVideo.source === "lesson") {
      const row = await findPublishedLesson(
        database,
        heroVideo.courseId,
        heroVideo.lessonId,
      );
      const resolved = row ? fromLesson(row) : null;
      if (resolved) return resolved;
    } else if (heroVideo.source === "upload") {
      const asset = await findVideoAsset(database, heroVideo.mediaId);
      if (asset?.type === "video") {
        return {
          media: {
            id: asset.id,
            type: asset.type,
            status: asset.status,
            storageKey: asset.storage_key,
            durationSeconds: asset.duration_seconds,
          },
          mediaKey: `home-hero-${asset.id}`,
          title: null,
          // The transcoder captures this frame before it encodes the video.
          poster: {
            url:
              asset.status === "ready"
                ? storage.getCdnObjectUrl(
                    `public/thumbnails/${asset.id}/original.webp`,
                  )
                : null,
          },
        };
      }
    }
    return await resolveDefault();
  }

  async function resolvePlayable(heroVideo: HomePageHeroVideo) {
    const resolved = await resolve(heroVideo);
    if (!resolved) {
      throw httpError(
        404,
        "HERO_VIDEO_NOT_FOUND",
        "The home page has no video to play.",
      );
    }
    return resolved;
  }

  return {
    /** What the hero shows before the video plays. */
    async resolvePoster(
      heroVideo: HomePageHeroVideo,
    ): Promise<ResolvedHeroVideo["poster"] | null> {
      return (await resolve(heroVideo))?.poster ?? null;
    },

    async getPlayback(
      heroVideo: HomePageHeroVideo,
    ): Promise<HeroVideoPlayback> {
      const resolved = await resolvePlayable(heroVideo);
      return await mediaService.getVideoAssetPlayback(resolved.media, {
        mediaKey: resolved.mediaKey,
        title: resolved.title,
      });
    },

    async getPlaybackToken(
      heroVideo: HomePageHeroVideo,
    ): Promise<VideoPlaybackToken> {
      const resolved = await resolvePlayable(heroVideo);
      return await mediaService.getVideoAssetPlaybackToken(resolved.media);
    },

    /** The lessons of a course that have a video, for the picker. */
    async listLessonOptions(
      courseId: string,
    ): Promise<HomePageLessonVideoOption[]> {
      const lessons = await listPublishedCourseLessons(database, courseId);
      return lessons
        .filter((lesson) => lesson.media_type === "video")
        .map((lesson) => ({
          id: lesson.lesson_id,
          number: lesson.number,
          title: lesson.lesson_title,
          sectionTitle: lesson.section_title,
          isPreview: lesson.is_preview,
          durationSeconds:
            lesson.duration_seconds === null
              ? null
              : Number(lesson.duration_seconds),
          isReady: lesson.media_status === "ready",
        }));
    },

    /** Refuses a choice that names a lesson or upload with no video. */
    async assertSelectable(heroVideo: HomePageHeroVideo): Promise<void> {
      if (heroVideo.source === "lesson") {
        const row = await findPublishedLesson(
          database,
          heroVideo.courseId,
          heroVideo.lessonId,
        );
        if (!row || row.media_type !== "video") {
          throw httpError(
            400,
            "HERO_VIDEO_INVALID",
            "The chosen lesson is not a published lesson with a video.",
          );
        }
      } else if (heroVideo.source === "upload") {
        const asset = await findVideoAsset(database, heroVideo.mediaId);
        if (asset?.type !== "video") {
          throw httpError(
            400,
            "HERO_VIDEO_INVALID",
            "The chosen upload is not a video.",
          );
        }
      }
    },
  };
}
