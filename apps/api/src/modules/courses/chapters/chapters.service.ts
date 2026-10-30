import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { resolveChapters } from "@veolms/video-player/chapters";

import type { AppServices } from "../../../services/index.ts";
import * as chaptersRepo from "./chapters.repository.ts";

export interface ChapterSyncServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

/**
 * The media facts chapter syncing needs. Callers own the media lookup so this
 * feature never reads media tables itself.
 */
export interface ChapterMediaSnapshot {
  id: string;
  status: string;
  durationSeconds: number | null;
  storageKey: string;
  masterPlaylistKey?: string;
}

export interface SyncLessonChaptersInput {
  lessonId: string;
  description: string | null;
  /** Null when the lesson is not a video lesson or has no video yet. */
  media: ChapterMediaSnapshot | null;
  logger?: FastifyBaseLogger;
}

/** Storage prefix the fleet writes `<startSeconds>.webp` chapter frames to. */
export function chapterThumbnailKeyPrefix(mediaId: string): string {
  return `public/chapter-thumbnails/${mediaId}/`;
}

/**
 * Keeps `lesson_chapters` in step with the timestamps authored in a lesson
 * description and requests first-frame thumbnails from the transcoding fleet.
 */
export function createChapterSyncService({
  database,
  services,
}: ChapterSyncServiceOptions) {
  async function requestThumbnails(
    media: ChapterMediaSnapshot,
    times: readonly number[],
    logger?: FastifyBaseLogger,
  ) {
    if (times.length === 0 || media.status !== "ready") return;
    try {
      await services.videoDispatch.dispatch({
        action: "queue",
        videoId: media.id,
        videoKey: media.storageKey,
        chapterThumbnails: {
          times: [...times],
          destinationPrefix: chapterThumbnailKeyPrefix(media.id),
          ...(media.masterPlaylistKey
            ? { masterPlaylistKey: media.masterPlaylistKey }
            : {}),
        },
      });
    } catch (err) {
      // Thumbnails are decorative; a failed request must not fail the save.
      logger?.warn(
        { err, mediaId: media.id },
        "Failed to request chapter thumbnail capture",
      );
    }
  }

  async function syncLessonChapters({
    lessonId,
    description,
    media,
    logger,
  }: SyncLessonChaptersInput) {
    const duration =
      media?.durationSeconds && media.durationSeconds > 0
        ? media.durationSeconds
        : undefined;
    const parsed = media
      ? resolveChapters({ description: description ?? "", duration }).chapters
      : [];
    const keyPrefix = media ? chapterThumbnailKeyPrefix(media.id) : null;
    const now = new Date();

    const missingThumbnailTimes = await database
      .transaction()
      .execute(async (trx) => {
        const existing = await chaptersRepo.listChapters(trx, lessonId);
        // A captured frame stays valid while the same video plays at the
        // same second, whatever the chapter is renamed to.
        const reusableKeys = new Map(
          existing
            .filter(
              (row) =>
                keyPrefix !== null &&
                row.thumbnail_key?.startsWith(keyPrefix) === true,
            )
            .map((row) => [row.start_seconds, row.thumbnail_key]),
        );
        const seen = new Set<number>();
        const rows = parsed.flatMap((chapter) => {
          const startSeconds = Math.floor(chapter.startTime);
          if (seen.has(startSeconds)) return [];
          seen.add(startSeconds);
          return [
            {
              id: crypto.randomUUID(),
              lesson_id: lessonId,
              title: chapter.title,
              start_seconds: startSeconds,
              thumbnail_key: reusableKeys.get(startSeconds) ?? null,
              created_at: now,
              updated_at: now,
            },
          ];
        });
        await chaptersRepo.replaceChapters(trx, lessonId, rows);
        return rows
          .filter((row) => row.thumbnail_key === null)
          .map((row) => row.start_seconds);
      });

    if (media) await requestThumbnails(media, missingThumbnailTimes, logger);
  }

  /** Re-syncs every lesson that plays `media`, e.g. once transcoding ends. */
  async function syncChaptersForMedia(
    media: ChapterMediaSnapshot,
    logger?: FastifyBaseLogger,
  ) {
    const lessons = await chaptersRepo.findVideoLessonsByMediaId(
      database,
      media.id,
    );
    for (const lesson of lessons) {
      await syncLessonChapters({
        lessonId: lesson.id,
        description: lesson.description,
        media,
        logger,
      });
    }
  }

  /** Marks frames the fleet reported as written for `mediaId`. */
  async function completeThumbnailCapture(
    mediaId: string,
    times: readonly number[],
  ) {
    await chaptersRepo.setCapturedThumbnailKeys(
      database,
      mediaId,
      chapterThumbnailKeyPrefix(mediaId),
      times,
      new Date(),
    );
  }

  return { syncLessonChapters, syncChaptersForMedia, completeThumbnailCapture };
}

export type ChapterSyncService = ReturnType<typeof createChapterSyncService>;
