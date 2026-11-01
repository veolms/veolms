import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import {
  canonicalYoutubeWatchUrl,
  parseYoutubeVideoId,
  type YoutubeImportAvailabilityResponse,
  type YoutubeImportControlResponse,
  type YoutubeImportLessonQuery,
  type YoutubeImportLessonResponse,
  type YoutubeImportPreviewResponse,
  type YoutubeImportRequest,
  type YoutubeImportResponse,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import {
  createCurriculumService,
  getCourseAndVerifyOwner,
} from "../../courses/index.ts";
import {
  YoutubeUnavailableError,
  readVideoMetadata,
} from "./source/youtube.ts";
import * as mediaRepo from "../media.repository.ts";
import * as importRepo from "./youtube-import.repository.ts";
import type { YoutubeImportTools } from "./youtube-import.tools.ts";
import { cancelImportJob, outputPrefixFor } from "./youtube-import.cancel.ts";

const IMPORT_PERMISSION = "lesson.video.import_youtube";

export interface ImportUser {
  id: string;
  roles?: readonly string[];
}

export interface YoutubeImportServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
  tools: YoutubeImportTools;
}

function requireVideoId(url: string): string {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) {
    throw new AppError(
      400,
      "INVALID_YOUTUBE_URL",
      "Paste a link to a single YouTube video (not a playlist).",
    );
  }
  return videoId;
}

export function createYoutubeImportService({
  database,
  services,
  tools,
}: YoutubeImportServiceOptions) {
  const config = services.config;
  const curriculumService = createCurriculumService({ database, services });

  function assertEnabled() {
    if (!config.YOUTUBE_IMPORT_ENABLED) {
      throw new AppError(
        403,
        "YOUTUBE_IMPORT_DISABLED",
        "Importing from YouTube is not turned on for this academy.",
      );
    }
  }

  function getAvailability(): YoutubeImportAvailabilityResponse {
    return { enabled: config.YOUTUBE_IMPORT_ENABLED };
  }

  /** Reads the video's details with yt-dlp (no download) so the author can confirm it. */
  async function preview(
    url: string,
    user: ImportUser,
  ): Promise<YoutubeImportPreviewResponse> {
    assertEnabled();
    const videoId = requireVideoId(url);
    let metadata;
    try {
      metadata = await readVideoMetadata(
        await tools.getYtDlp(),
        canonicalYoutubeWatchUrl(videoId),
        AbortSignal.timeout(90_000),
      );
    } catch (error) {
      if (error instanceof YoutubeUnavailableError) {
        throw new AppError(422, "YOUTUBE_VIDEO_UNAVAILABLE", error.message);
      }
      throw new AppError(
        502,
        "YOUTUBE_LOOKUP_FAILED",
        "Could not read this video from YouTube right now. Try again in a minute.",
      );
    }
    const wanted = config.YOUTUBE_IMPORT_QUALITIES.map(Number);
    const qualities = metadata.manifestUrl
      ? wanted
          .map((height) =>
            metadata.availableHeights.find((available) => available <= height),
          )
          .filter((height): height is number => height !== undefined)
      : [metadata.height ?? 360];
    const existing = await importRepo.findReadyImportOfVideo(
      database,
      user.id,
      videoId,
    );
    return {
      youtubeId: videoId,
      title: metadata.title,
      durationSeconds: metadata.durationSeconds,
      channel: metadata.channel,
      thumbnailUrl: metadata.thumbnailUrl,
      qualities: [...new Set(qualities)].map((height) => `${height}p`),
      existingMediaId: existing?.media_id ?? null,
    };
  }

  /**
   * Queues an import into a lesson. As with an uploaded video, the lesson
   * keeps the video it has (or none) until the new one is ready: the worker
   * then attaches it, unless the lesson's video was changed meanwhile. The
   * editor, when still open, attaches it the usual way on completion too.
   * For a lesson not saved yet only the editor can attach it.
   */
  async function startImport(
    request: YoutubeImportRequest,
    user: ImportUser,
    logger: FastifyBaseLogger,
  ): Promise<YoutubeImportResponse> {
    assertEnabled();
    const videoId = requireVideoId(request.url);
    // The route already requires the import permission; a course narrows it
    // to people who may manage that course.
    if (request.courseId) {
      await getCourseAndVerifyOwner(
        database,
        request.courseId,
        user.id,
        user.roles,
        IMPORT_PERMISSION,
      );
    }
    // A lesson that is not saved yet has no id: the editor attaches the
    // finished video then, exactly as it attaches an uploaded one.
    const lesson =
      request.courseId && request.lessonId
        ? await curriculumService.findLessonById(
            request.lessonId,
            request.courseId,
          )
        : null;
    if (request.lessonId) {
      if (!lesson || lesson.deleted_at) {
        throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
      }
      if (lesson.content_type !== "video") {
        throw new AppError(
          400,
          "TYPE_MISMATCH",
          "Only a video lesson can take a YouTube video.",
        );
      }
      if (await importRepo.findOpenImportForLesson(database, lesson.id)) {
        throw new AppError(
          409,
          "YOUTUBE_IMPORT_IN_PROGRESS",
          "A YouTube import into this lesson is already running.",
        );
      }
    }

    const mediaId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const sourceUrl = canonicalYoutubeWatchUrl(videoId);
    await database.transaction().execute(async (trx) => {
      await importRepo.insertImportMedia(trx, {
        id: mediaId,
        owner_id: user.id,
        storage_key: `${outputPrefixFor(mediaId)}/manifest`,
        original_filename: `youtube-${videoId}`,
        mime_type: "application/vnd.apple.mpegurl",
        metadata: { source: "youtube", youtubeId: videoId, sourceUrl },
      });
      await importRepo.insertImportJob(trx, {
        id: jobId,
        media_id: mediaId,
        owner_id: user.id,
        course_id: request.courseId ?? null,
        lesson_id: lesson?.id ?? null,
        replaces_media_id: lesson?.content_media_id ?? null,
        source_url: sourceUrl,
        youtube_id: videoId,
        title: null,
        duration_seconds: null,
      });
      // The worker fills in the title and channel once it reads the video.
      await mediaRepo.insertMediaSource(trx, {
        media_id: mediaId,
        provider: "youtube",
        external_id: videoId,
        source_url: sourceUrl,
        title: null,
        channel: null,
        recorded_via: "import",
      });
    });
    logger.info(
      {
        importJobId: jobId,
        mediaId,
        youtubeId: videoId,
        lessonId: lesson?.id ?? null,
      },
      "YouTube import queued",
    );
    return { mediaId, jobId, status: "queued" };
  }

  /** The import the lesson editor should show again when it is opened. */
  async function findLessonImport(
    query: YoutubeImportLessonQuery,
    user: ImportUser,
  ): Promise<YoutubeImportLessonResponse> {
    await getCourseAndVerifyOwner(
      database,
      query.courseId,
      user.id,
      user.roles,
      IMPORT_PERMISSION,
    );
    const lesson = await curriculumService.findLessonById(
      query.lessonId,
      query.courseId,
    );
    if (!lesson) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }
    const job = await importRepo.findResumableImportForLesson(
      database,
      lesson.id,
      lesson.content_media_id,
    );
    return {
      import: job ? { mediaId: job.media_id, status: job.status } : null,
    };
  }

  async function findManageableJob(mediaId: string, user: ImportUser) {
    const job = await importRepo.findImportJobByMediaId(database, mediaId);
    if (!job) {
      throw new AppError(404, "JOB_NOT_FOUND", "YouTube import not found.");
    }
    if (job.course_id) {
      await getCourseAndVerifyOwner(
        database,
        job.course_id,
        user.id,
        user.roles,
        IMPORT_PERMISSION,
      );
    } else if (job.owner_id !== user.id) {
      throw new AppError(404, "JOB_NOT_FOUND", "YouTube import not found.");
    }
    return job;
  }

  async function retryImport(
    mediaId: string,
    user: ImportUser,
  ): Promise<YoutubeImportControlResponse> {
    assertEnabled();
    const job = await findManageableJob(mediaId, user);
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new AppError(
        409,
        "YOUTUBE_IMPORT_NOT_FAILED",
        "Only a failed or cancelled import can be retried.",
      );
    }
    await database.transaction().execute(async (trx) => {
      await importRepo.requeueImportJob(trx, job.id);
      await importRepo.setImportMediaStatus(trx, job.media_id, "processing");
    });
    return { status: "queued" };
  }

  async function cancelImport(
    mediaId: string,
    user: ImportUser,
  ): Promise<YoutubeImportControlResponse> {
    const job = await findManageableJob(mediaId, user);
    return { status: await cancelImportJob(database, services, job) };
  }

  return {
    getAvailability,
    preview,
    startImport,
    findLessonImport,
    retryImport,
    cancelImport,
  };
}

export type YoutubeImportService = ReturnType<
  typeof createYoutubeImportService
>;
