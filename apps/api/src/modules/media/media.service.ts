import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type {
  Database,
  MediaAssetStatus,
  VideoQualityLevel,
} from "@veolms/database";
import type {
  PresignMediaRequest,
  VideoPlaybackBootstrap,
} from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { ADMIN_ROLE } from "../auth/index.ts";
import { createAccessService } from "../access/index.ts";
import * as mediaRepo from "./media.repository.ts";

export interface MediaServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

const VIDEO_QUALITIES: VideoQualityLevel[] = ["360p", "720p", "1080p"];
const accessService = createAccessService();

type PlaybackUser = {
  id: string;
  roles?: readonly string[];
};

function normalizeOutputPrefix(outputPrefix: string): string {
  return outputPrefix.replace(/^\/+|\/+$/g, "");
}

function isSafeHlsPath(path: string): boolean {
  const segments = path.split("/");
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    ) &&
    /\.(?:m3u8|ts|m4s|mp4|aac|vtt)$/i.test(path)
  );
}

function hlsContentType(path: string): string {
  if (/\.m3u8$/i.test(path)) return "application/vnd.apple.mpegurl";
  if (/\.ts$/i.test(path)) return "video/mp2t";
  if (/\.m4s$/i.test(path)) return "video/iso.segment";
  if (/\.mp4$/i.test(path)) return "video/mp4";
  if (/\.aac$/i.test(path)) return "audio/aac";
  if (/\.vtt$/i.test(path)) return "text/vtt";
  return "application/octet-stream";
}

/** Postgres unique_violation (23505), as raised by the pg driver via node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export function createMediaService({
  database,
  services,
}: MediaServiceOptions) {
  /**
   * Pre-signs an S3/storage upload URL for media asset creation.
   */
  async function presignMediaUpload(
    ownerId: string,
    payload: PresignMediaRequest,
  ) {
    const mediaId = crypto.randomUUID();
    const ext = payload.filename.includes(".")
      ? payload.filename.split(".").pop()
      : "";
    const storageKey = `media/${ownerId}/${mediaId}${ext ? `.${ext}` : ""}`;

    const uploadUrl = await services.storage.getPresignedPutUrl(
      storageKey,
      payload.contentType,
      payload.fileSize,
    );

    await mediaRepo.insertMediaAsset(database, {
      id: mediaId,
      owner_id: ownerId,
      type: payload.type,
      storage_provider: "s3",
      storage_key: storageKey,
      original_filename: payload.filename,
      mime_type: payload.contentType,
      size_bytes: payload.fileSize,
      status: "uploading",
    });

    return {
      uploadUrl,
      mediaAssetId: mediaId,
    };
  }

  /**
   * Verifies that a media file is uploaded and exists, then sets status to 'uploaded'.
   * If it's a video, automatically queues and triggers transcoding.
   */
  async function confirmUpload(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
  ): Promise<{ status: MediaAssetStatus; jobId?: string | null }> {
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      ownerId,
    );

    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    if (media.status !== "uploading") {
      let existingJobId: string | null = null;
      if (media.type === "video") {
        const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
        existingJobId = job ? job.id : null;
      }
      return { status: media.status, jobId: existingJobId };
    }

    const metadata = await services.storage.headObject(media.storage_key);

    if (!metadata) {
      throw new AppError(
        400,
        "FILE_NOT_FOUND",
        "File could not be found in storage.",
      );
    }

    if (
      metadata.contentLength !== undefined &&
      metadata.contentLength !== Number(media.size_bytes)
    ) {
      throw new AppError(
        400,
        "FILE_SIZE_MISMATCH",
        "Uploaded file size does not match presigned size.",
      );
    }

    await mediaRepo.updateMediaAssetStatus(database, mediaId, "uploaded");

    let jobId: string | null = null;
    // Once video is uploaded, automatically queue and dispatch it for processing
    if (media.type === "video" && logger) {
      const transcodeResult = await queueTranscodeJob(mediaId, ownerId, logger);
      jobId = transcodeResult.jobId;
    }

    return { status: "uploaded", jobId };
  }

  /**
   * Triggers transcoding job if not already ready or processing.
   * Always dispatches to the queue and triggers Lambda if configured.
   * If a job already exists and is active, it does not re-trigger.
   */
  async function queueTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
  ): Promise<{ should202: boolean; jobId: string | null }> {
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      ownerId,
    );

    if (!media) {
      throw new AppError(
        400,
        "INVALID_MEDIA",
        "Selected media asset is invalid or unauthorized.",
      );
    }

    if (media.type !== "video") {
      return { should202: false, jobId: null };
    }

    if (
      media.status !== "uploaded" &&
      media.status !== "ready" &&
      media.status !== "failed"
    ) {
      throw new AppError(
        400,
        "MEDIA_NOT_UPLOADED",
        "Video file must be uploaded and confirmed first.",
      );
    }

    if (media.status === "failed") {
      await mediaRepo.updateMediaAssetStatus(database, media.id, "uploaded");
    }

    const existingJob = await mediaRepo.findVideoJobByVideoId(
      database,
      media.id,
    );

    // If job already exists and is active or completed, don't trigger again
    if (existingJob) {
      if (
        existingJob.status === "queued" ||
        existingJob.status === "provisioning" ||
        existingJob.status === "processing"
      ) {
        logger?.info(
          {
            jobId: existingJob.id,
            videoId: media.id,
            status: existingJob.status,
          },
          "Video job already active. Skipping duplicate trigger.",
        );
        return { should202: true, jobId: existingJob.id };
      }

      if (existingJob.status === "completed") {
        logger?.info(
          { jobId: existingJob.id, videoId: media.id },
          "Video job already completed. Skipping duplicate trigger.",
        );
        if (media.status !== "ready") {
          await mediaRepo.updateMediaAssetStatus(database, media.id, "ready");
        }
        return { should202: false, jobId: existingJob.id };
      }
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    const outputPrefix = `transcoded/${media.id}`;

    try {
      await mediaRepo.insertVideoJob(database, {
        id: jobId,
        video_id: media.id,
        video_key: media.storage_key,
        output_prefix: outputPrefix,
        video_size: Number(media.size_bytes),
        qualities: VIDEO_QUALITIES,
        status: "queued",
        created_at: now,
      });
    } catch (insertErr) {
      if (isUniqueViolation(insertErr)) {
        const raceWinner = await mediaRepo.findVideoJobByVideoId(
          database,
          media.id,
        );
        if (raceWinner) {
          logger?.info(
            { jobId: raceWinner.id, videoId: media.id },
            "Lost the race to queue this video's transcode job. Reusing the concurrent job instead.",
          );
          return { should202: true, jobId: raceWinner.id };
        }
      }
      throw insertErr;
    }

    // Dispatch the transcoding job (always queue, and trigger lambda if configured)
    try {
      await services.videoDispatch.dispatch({
        action: "claim",
        jobId,
        videoId: media.id,
        videoKey: media.storage_key,
        outputPrefix,
        qualities: VIDEO_QUALITIES,
        videoSize: Number(media.size_bytes),
      });
      logger?.info(
        { jobId, mediaId: media.id },
        "Video transcoding job queued and dispatched successfully",
      );
    } catch (dispatchErr) {
      const message =
        dispatchErr instanceof Error ? dispatchErr.message : "Dispatch failed.";
      logger?.error(
        { err: dispatchErr, jobId, mediaId: media.id },
        "Failed to dispatch video transcoding job; marking job as failed",
      );
      await mediaRepo.updateVideoJobStatus(database, jobId, {
        status: "failed",
        error_message: message,
        failed_at: new Date(),
      });
      await mediaRepo.updateMediaAssetStatus(database, media.id, "failed");
    }

    return { should202: true, jobId };
  }

  async function retryTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
  ) {
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      ownerId,
    );
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }
    if (media.status !== "failed" && media.status !== "uploaded") {
      throw new AppError(
        409,
        "MEDIA_NOT_RETRYABLE",
        "This video is not in a retryable state.",
      );
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
    if (!job) return queueTranscodeJob(mediaId, ownerId, logger);
    if (["queued", "provisioning", "processing"].includes(job.status)) {
      return { should202: true, jobId: job.id };
    }

    await mediaRepo.updateVideoJobStatus(database, job.id, {
      status: "queued",
      progress_percent: 0,
      error_message: null,
      failed_at: null,
    });
    await mediaRepo.updateMediaAssetStatus(database, mediaId, "uploaded");

    try {
      await services.videoDispatch.dispatch({
        action: "claim",
        jobId: job.id,
        videoId: mediaId,
        videoKey: media.storage_key,
        outputPrefix: job.output_prefix,
        qualities: job.qualities,
        videoSize: Number(media.size_bytes),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Dispatch failed.";
      await mediaRepo.updateVideoJobStatus(database, job.id, {
        status: "failed",
        error_message: message,
        failed_at: new Date(),
      });
      await mediaRepo.updateMediaAssetStatus(database, mediaId, "failed");
      throw error;
    }
    logger?.info({ jobId: job.id, mediaId }, "Video transcoding retry queued");
    return { should202: true, jobId: job.id };
  }

  async function cancelTranscodeJob(
    mediaId: string,
    ownerId: string,
    logger?: FastifyBaseLogger,
  ) {
    const media = await mediaRepo.findMediaAssetById(database, mediaId, ownerId);
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
    if (!job) {
      throw new AppError(409, "MEDIA_JOB_NOT_FOUND", "No transcoding job exists for this video.");
    }
    if (!["queued", "provisioning", "processing"].includes(job.status)) {
      throw new AppError(409, "MEDIA_NOT_CANCELLABLE", "This video is no longer being transcoded.");
    }

    try {
      await services.videoDispatch.dispatch({
        status: "cancelled",
        jobId: job.id,
        videoId: mediaId,
        videoKey: job.video_key,
        outputPrefix: job.output_prefix,
        deleteFiles: true,
        deleteMedia: false,
      });
    } catch (error) {
      logger?.error({ err: error, jobId: job.id, mediaId }, "Failed to dispatch video cancellation cleanup");
      throw error;
    }

    // In serverful/local mode the fleet manager watches the database directly;
    // in serverless mode the cancellation event above performs this update.
    await mediaRepo.updateVideoJobStatus(database, job.id, {
      status: "cancelled",
    });
    await mediaRepo.updateMediaAssetStatus(database, mediaId, "failed");

    return { cancelled: true, jobId: job.id };
  }

  /**
   * Retrieves a single media asset by ID with optional owner verification.
   * Inter-module API method (Rule 11 compliance).
   */
  async function getMediaAsset(mediaId: string, ownerId?: string) {
    return await mediaRepo.findMediaAssetById(database, mediaId, ownerId);
  }

  /**
   * Retrieves multiple media assets by IDs with optional owner verification.
   * Inter-module API method (Rule 11 compliance).
   */
  async function getMediaAssets(mediaIds: string[], ownerId?: string) {
    return await mediaRepo.findMediaAssetsByIds(database, mediaIds, ownerId);
  }

  /**
   * Fetches transcoding progress for a video asset.
   */
  async function getVideoJobProgress(videoId: string, ownerId?: string) {
    const media = await mediaRepo.findMediaAssetById(
      database,
      videoId,
      ownerId,
    );
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, videoId);
    if (!job) {
      throw new AppError(
        404,
        "JOB_NOT_FOUND",
        "Video transcoding job not found.",
      );
    }

    const workerProgress = job.worker_id
      ? await mediaRepo.findWorkerProgressByWorkerId(database, job.worker_id)
      : undefined;

    if (job.status === "completed" && media.status !== "ready") {
      await mediaRepo.updateMediaAssetStatus(database, videoId, "ready");
    } else if (job.status === "failed" && media.status !== "failed") {
      await mediaRepo.updateMediaAssetStatus(database, videoId, "failed");
    }

    return {
      status: job.status,
      // The worker reports live FFmpeg progress to worker_monitoring. The
      // video_jobs value is the durable fallback used before a worker is
      // assigned and after the worker is released.
      progressPercent: Math.max(
        0,
        Math.min(
          100,
          Math.floor(
            Number(workerProgress?.progress_percent ?? job.progress_percent),
          ),
        ),
      ),
      error: job.error_message,
    };
  }

  async function assertPlaybackAccess(
    context: {
      course_id: string;
      course_status: string;
      course_creator_id: string | null;
      pricing_type: string | null;
      is_preview: boolean;
    },
    user?: PlaybackUser,
  ): Promise<void> {
    if (context.course_status !== "published") {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    // Preview lessons and explicitly free courses are intentionally public.
    if (context.is_preview || context.pricing_type === "free") return;

    if (!user) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication is required to play this lesson.",
      );
    }

    const isOwner = context.course_creator_id === user.id;
    const isAdmin = user.roles?.includes(ADMIN_ROLE) ?? false;
    if (isOwner || isAdmin) return;

    const hasAccess = await accessService.hasActiveAccess(
      database,
      user.id,
      context.course_id,
    );
    if (!hasAccess) {
      throw new AppError(
        403,
        "COURSE_ACCESS_DENIED",
        "You do not have access to this course.",
      );
    }
  }

  async function getReadyPlaybackOutput(
    mediaId: string,
    options: { verifyManifest?: boolean } = {},
  ) {
    const [media, job] = await Promise.all([
      mediaRepo.findMediaAssetById(database, mediaId),
      mediaRepo.findVideoJobByVideoId(database, mediaId),
    ]);
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    if (!job || job.status !== "completed" || media.status !== "ready") {
      throw new AppError(
        409,
        "MEDIA_NOT_READY",
        "This video is still being prepared.",
      );
    }

    const outputPrefix = normalizeOutputPrefix(job.output_prefix);
    const manifestKey = `${outputPrefix}/master.m3u8`;
    if (options.verifyManifest !== false) {
      const manifest = await services.storage.headObject(manifestKey);
      if (!manifest) {
        throw new AppError(
          409,
          "MEDIA_NOT_READY",
          "This video is still being prepared.",
        );
      }
    }

    return { media, job, outputPrefix, manifestKey };
  }

  async function getPlaybackBootstrap(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ): Promise<VideoPlaybackBootstrap> {
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const context = await mediaRepo.findPlaybackLessonContext(
      database,
      courseIdOrSlug,
      lessonNumber,
    );
    if (!context) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    await assertPlaybackAccess(context, user);
    if (context.lesson_content_type !== "video" || !context.content_media_id) {
      throw new AppError(
        404,
        "MEDIA_NOT_FOUND",
        "This lesson does not have a playable video.",
      );
    }

    // The transcode worker only marks a job completed after publishing its
    // output. Avoid an extra storage HEAD round-trip on every first play;
    // the manifest request itself remains the authoritative final check.
    const { media, outputPrefix } = await getReadyPlaybackOutput(
      context.content_media_id,
      { verifyManifest: false },
    );
    const publicManifestUrl = services.storage.getPublicObjectUrl(
      `${outputPrefix}/master.m3u8`,
    );
    const isPublicPlayback =
      Boolean(publicManifestUrl) &&
      (context.is_preview || context.pricing_type === "free");
    return {
      version: 1,
      courseSlug: context.course_slug,
      lessonId: context.lesson_id,
      mediaKey: `${encodeURIComponent(context.course_slug)}-lesson-${lessonNumber}`,
      manifestUrl:
        publicManifestUrl ??
        `/media/${encodeURIComponent(media.id)}/hls/master.m3u8`,
      ...(media.duration_seconds !== null &&
      media.duration_seconds !== undefined
        ? { duration: Number(media.duration_seconds) }
        : {}),
      title: context.lesson_title,
      source: isPublicPlayback ? "public-cdn" : "paid-bootstrap-api",
    };
  }

  async function getHlsStream(
    mediaId: string,
    requestedPath: string,
    user?: PlaybackUser,
  ) {
    const context = await mediaRepo.findPlaybackMediaContext(database, mediaId);
    if (!context) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    await assertPlaybackAccess(context, user);
    const { outputPrefix } = await getReadyPlaybackOutput(mediaId, {
      verifyManifest: false,
    });
    const hlsPath = requestedPath.replace(/^\/+/, "");
    if (!isSafeHlsPath(hlsPath)) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "HLS resource not found.");
    }

    const file = await services.storage.getObject(`${outputPrefix}/${hlsPath}`);
    if (!file) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "HLS resource not found.");
    }

    return {
      stream: file.body,
      contentType: hlsContentType(hlsPath),
      contentLength: file.contentLength,
      isManifest: /\.m3u8$/i.test(hlsPath),
      isPublic: context.is_preview || context.pricing_type === "free",
    };
  }

  /**
   * Fetches the media file stream and metadata from storage.
   *
   * Access rule: an asset is servable without restriction if it's the
   * thumbnail/trailer of a published course (those render as plain
   * <img>/<video> src on public, logged-out marketing pages). Anything
   * else — draft-course assets, unattached uploads, other media types —
   * is only servable to its owner. `requestingUserId` is undefined for
   * anonymous requests.
   *
   * Returns MEDIA_NOT_FOUND (not 403) for an authorization failure too, so
   * a caller can't distinguish "doesn't exist" from "exists but isn't
   * yours" by probing IDs.
   */
  async function getMediaStream(mediaId: string, requestingUserId?: string) {
    const media = await mediaRepo.findMediaAssetById(database, mediaId);
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (!isPublic && media.owner_id !== requestingUserId) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const file = await services.storage.getObject(media.storage_key);
    if (!file) {
      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "Media file not found in storage.",
      );
    }
    return {
      stream: file.body,
      contentType:
        media.mime_type || file.contentType || "application/octet-stream",
      contentLength:
        file.contentLength ??
        (media.size_bytes ? Number(media.size_bytes) : undefined),
      filename: media.original_filename,
      isPublic,
    };
  }

  return {
    presignMediaUpload,
    confirmUpload,
    queueTranscodeJob,
    retryTranscodeJob,
    cancelTranscodeJob,
    getMediaAsset,
    getMediaAssets,
    getVideoJobProgress,
    getPlaybackBootstrap,
    getHlsStream,
    getMediaStream,
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
