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
  VideoPlaybackToken,
} from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { ADMIN_ROLE } from "../auth/index.ts";
import { createAccessService } from "../access/index.ts";
import * as mediaRepo from "./media.repository.ts";
import { enqueueImageJob } from "@veolms/database";

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

function resolveMediaVisibility(storageKey: string): "public" | "protected" {
  return storageKey.replace(/^\/+/, "").startsWith("public/")
    ? "public"
    : "protected";
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

/** Postgres unique_violation (23505), as raised by the pg driver via node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
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
      ? payload.filename
          .split(".")
          .pop()
          ?.replace(/[^a-z0-9]/giu, "")
          .toLowerCase()
      : "";
    const visibilityPrefix =
      payload.visibility === "public" ? "public" : "protected";
    const storageKey =
      payload.type === "image"
        ? `${visibilityPrefix}/thumbnails/${mediaId}/original/${payload.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`
        : `${visibilityPrefix}/media/${ownerId}/${mediaId}${ext ? `.${ext}` : ""}`;

    const uploadUrl = await services.storage.getPresignedPutUrl(
      storageKey,
      payload.contentType,
      payload.fileSize,
    );

    void services.storage.ensureBucketCors().catch(() => {});

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
    userRoles?: readonly string[],
  ): Promise<{
    status: MediaAssetStatus;
    jobId?: string | null;
    deliveryUrl?: string;
    deliveryUrlExpiresAt?: number;
  }> {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
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
      const delivery = getDirectDelivery(media.storage_key);
      return {
        status: media.status,
        jobId: existingJobId,
        deliveryUrl: delivery.url,
        deliveryUrlExpiresAt: delivery.expiresAt,
      };
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

    if (media.type === "image") {
      const jobId = crypto.randomUUID();
      await enqueueImageJob(database, { id: jobId, media_id: mediaId });
      await mediaRepo.updateMediaAssetStatus(database, mediaId, "processing");
      return { status: "processing", jobId };
    }

    let jobId: string | null = null;
    // Once video is uploaded, automatically queue and dispatch it for processing
    if (media.type === "video" && logger) {
      const transcodeResult = await queueTranscodeJob(
        mediaId,
        ownerId,
        logger,
        userRoles,
      );
      jobId = transcodeResult.jobId;
    }

    const delivery = getDirectDelivery(media.storage_key);
    return {
      status: "uploaded",
      jobId,
      deliveryUrl: delivery.url,
      deliveryUrlExpiresAt: delivery.expiresAt,
    };
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
    userRoles?: readonly string[],
  ): Promise<{ should202: boolean; jobId: string | null }> {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
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
    const outputPrefix = `${resolveMediaVisibility(media.storage_key)}/transcoded/${media.id}`;

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
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
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
    if (!job) return queueTranscodeJob(mediaId, ownerId, logger, userRoles);
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
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
    if (!media || media.type !== "video") {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Video asset not found.");
    }

    const job = await mediaRepo.findVideoJobByVideoId(database, mediaId);
    if (!job) {
      throw new AppError(
        409,
        "MEDIA_JOB_NOT_FOUND",
        "No transcoding job exists for this video.",
      );
    }
    if (!["queued", "provisioning", "processing"].includes(job.status)) {
      throw new AppError(
        409,
        "MEDIA_NOT_CANCELLABLE",
        "This video is no longer being transcoded.",
      );
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
      logger?.error(
        { err: error, jobId: job.id, mediaId },
        "Failed to dispatch video cancellation cleanup",
      );
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
  async function getMediaAsset(
    mediaId: string,
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    return await mediaRepo.findMediaAssetById(
      database,
      mediaId,
      isAdmin ? undefined : ownerId,
    );
  }

  /**
   * Retrieves multiple media assets by IDs with optional owner verification.
   * Inter-module API method (Rule 11 compliance).
   */
  async function getMediaAssets(
    mediaIds: string[],
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    return await mediaRepo.findMediaAssetsByIds(
      database,
      mediaIds,
      isAdmin ? undefined : ownerId,
    );
  }

  /**
   * Fetches transcoding progress for a video asset.
   */
  async function getVideoJobProgress(
    videoId: string,
    ownerId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(
      database,
      videoId,
      isAdmin ? undefined : ownerId,
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
      is_published?: boolean;
    },
    user?: PlaybackUser,
  ): Promise<void> {
    const isOwner = Boolean(user && context.course_creator_id === user.id);
    const isAdmin = Boolean(
      user?.roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
    );

    if (isOwner || isAdmin) return;

    if (context.course_status !== "published") {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    if (context.is_published === false) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
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
    const [media, job, outputs] = await Promise.all([
      mediaRepo.findMediaAssetById(database, mediaId),
      mediaRepo.findVideoJobByVideoId(database, mediaId),
      mediaRepo.findVideoOutputsByVideoIds(database, [mediaId]),
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
    const latestOutput = outputs
      .filter((output) => output.video_id === mediaId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
    const manifestKey = normalizeOutputPrefix(
      latestOutput?.master_playlist_path || `${outputPrefix}/master.m3u8`,
    );
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

  function getDirectDelivery(storageKey: string) {
    const requiresToken = !services.storage.isCdnPublicKey(storageKey);
    const expiresAt = requiresToken
      ? Math.floor(Date.now() / 1000) + services.storage.getCdnTokenTtlSeconds()
      : undefined;
    const token = requiresToken
      ? services.storage.createCdnAccessToken(storageKey, expiresAt)
      : undefined;
    if (requiresToken && !token) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Protected media delivery is not configured.",
      );
    }
    const url = services.storage.getCdnObjectUrl(
      storageKey,
      token ?? undefined,
    );
    if (!url) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Media delivery is not configured.",
      );
    }
    return { url, expiresAt };
  }

  async function getMediaDelivery(
    mediaId: string,
    requestingUserId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(database, mediaId);
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (!isPublic && media.owner_id !== requestingUserId && !isAdmin) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const delivery = getDirectDelivery(media.storage_key);
    return {
      url: delivery.url,
      ...(delivery.expiresAt ? { expiresAt: delivery.expiresAt } : {}),
    };
  }

  async function resolveAuthorizedPlaybackLesson(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ) {
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
      throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        courseIdOrSlug,
      );
    const course = await (isUuid
      ? database
          .selectFrom("courses")
          .select(["id", "creator_id", "status"])
          .where("id", "=", courseIdOrSlug)
          .where("deleted_at", "is", null)
          .executeTakeFirst()
      : database
          .selectFrom("courses")
          .select(["id", "creator_id", "status"])
          .where("slug", "=", courseIdOrSlug)
          .where("deleted_at", "is", null)
          .executeTakeFirst());

    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    const isOwner = Boolean(user && user.id === course.creator_id);
    const isAdmin = Boolean(
      user?.roles?.some((role) => role.toLowerCase() === ADMIN_ROLE),
    );
    const canManageCourse = isOwner || isAdmin;

    if (course.status !== "published" && !canManageCourse) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
    }

    const context = await mediaRepo.findPlaybackLessonContext(
      database,
      course.id,
      lessonNumber,
      { includeUnpublished: canManageCourse },
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

    return context;
  }

  function createPlaybackSegmentToken(
    manifestKey: string,
  ): VideoPlaybackToken | null {
    const manifestPrefix = manifestKey.replace(/\/[^/]+$/u, "");
    if (services.storage.isCdnPublicKey(manifestPrefix)) return null;

    const expiresAt =
      Math.floor(Date.now() / 1000) +
      services.storage.getCdnHlsTokenTtlSeconds();
    const token = services.storage.createCdnAccessToken(
      manifestPrefix,
      expiresAt,
    );
    if (!token) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Protected media delivery is not configured.",
      );
    }
    return { token, expiresAt };
  }

  async function getPlaybackBootstrap(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ): Promise<VideoPlaybackBootstrap> {
    const context = await resolveAuthorizedPlaybackLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );

    // The transcode worker only marks a job completed after publishing its
    // output. Avoid an extra storage HEAD round-trip on every first play;
    // the CDN manifest request itself remains the authoritative final check.
    const { media, manifestKey } = await getReadyPlaybackOutput(
      context.content_media_id!,
      {
        verifyManifest: false,
      },
    );
    const manifestUrl = services.storage.getCdnObjectUrl(manifestKey);
    if (!manifestUrl) {
      throw new AppError(
        503,
        "CDN_NOT_CONFIGURED",
        "Media delivery is not configured.",
      );
    }
    const playbackToken = createPlaybackSegmentToken(manifestKey);

    return {
      version: 1,
      courseSlug: context.course_slug,
      lessonId: context.lesson_id,
      mediaKey: `${encodeURIComponent(context.course_slug)}-lesson-${lessonNumber}`,
      manifestUrl,
      ...(playbackToken
        ? {
            segmentToken: playbackToken.token,
            segmentTokenExpiresAt: playbackToken.expiresAt,
          }
        : {}),
      ...(media.duration_seconds !== null &&
      media.duration_seconds !== undefined
        ? { duration: Number(media.duration_seconds) }
        : {}),
      title: context.lesson_title,
      source: "paid-bootstrap-api",
    };
  }

  async function getPlaybackToken(
    courseIdOrSlug: string,
    lessonNumber: number,
    user?: PlaybackUser,
  ): Promise<VideoPlaybackToken> {
    const context = await resolveAuthorizedPlaybackLesson(
      courseIdOrSlug,
      lessonNumber,
      user,
    );
    const { manifestKey } = await getReadyPlaybackOutput(
      context.content_media_id!,
      { verifyManifest: false },
    );
    const playbackToken = createPlaybackSegmentToken(manifestKey);
    if (!playbackToken) {
      throw new AppError(
        409,
        "CDN_TOKEN_NOT_REQUIRED",
        "This lesson does not require a protected playback token.",
      );
    }
    return playbackToken;
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
      isPublic:
        context.course_status === "published" &&
        (context.is_preview || context.pricing_type === "free"),
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
  async function getMediaStream(
    mediaId: string,
    requestingUserId?: string,
    userRoles?: readonly string[],
  ) {
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const media = await mediaRepo.findMediaAssetById(database, mediaId);
    if (!media) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (!isPublic && media.owner_id !== requestingUserId && !isAdmin) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    }

    const fullKey =
      media.type === "image" &&
      media.status === "ready" &&
      typeof media.metadata === "object" &&
      media.metadata !== null &&
      "full" in media.metadata &&
      typeof media.metadata.full === "object" &&
      media.metadata.full !== null &&
      "key" in media.metadata.full &&
      typeof media.metadata.full.key === "string"
        ? media.metadata.full.key
        : media.storage_key;
    const file = await services.storage.getObject(fullKey);
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
        fullKey === media.storage_key
          ? media.mime_type || file.contentType || "application/octet-stream"
          : "image/webp",
      contentLength:
        file.contentLength ??
        (media.size_bytes ? Number(media.size_bytes) : undefined),
      filename: media.original_filename,
      isPublic,
    };
  }

  async function getImageVariantStream(
    mediaId: string,
    width: number,
    requestingUserId?: string,
    userRoles?: readonly string[],
  ) {
    const media = await mediaRepo.findMediaAssetById(database, mediaId);
    if (!media || media.type !== "image")
      throw new AppError(404, "MEDIA_NOT_FOUND", "Image asset not found.");
    const isAdmin = userRoles?.includes(ADMIN_ROLE);
    const isPublic = await mediaRepo.isMediaAttachedToPublishedCourse(
      database,
      mediaId,
    );
    if (!isPublic && media.owner_id !== requestingUserId && !isAdmin)
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
    const variants =
      typeof media.metadata === "object" &&
      media.metadata !== null &&
      "variants" in media.metadata &&
      Array.isArray(media.metadata.variants)
        ? media.metadata.variants
        : [];
    const variant = variants.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "width" in item &&
        item.width === width &&
        "key" in item &&
        typeof item.key === "string",
    );
    if (
      !variant ||
      typeof variant !== "object" ||
      !("key" in variant) ||
      typeof variant.key !== "string"
    )
      throw new AppError(404, "MEDIA_NOT_FOUND", "Image variant not found.");
    const file = await services.storage.getObject(variant.key);
    if (!file)
      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "Image variant not found in storage.",
      );
    return {
      stream: file.body,
      contentType: "image/webp",
      contentLength: file.contentLength,
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
    getPlaybackToken,
    getMediaDelivery,
    getHlsStream,
    getMediaStream,
    getImageVariantStream,
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
