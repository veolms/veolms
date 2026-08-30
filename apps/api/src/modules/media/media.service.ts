import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type {
  Database,
  MediaAssetStatus,
  VideoQualityLevel,
} from "@veolms/database";
import type { PresignMediaRequest } from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import * as mediaRepo from "./media.repository.ts";

export interface MediaServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

const VIDEO_QUALITIES: VideoQualityLevel[] = ["360p", "720p", "1080p"];

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
   * HELPER: Creates a presigned upload response from media record.
   * Generates a presigned PUT URL for the client to upload the file directly to S3.
   */
  async function createPresignedUploadResponse(media: {
    id: string;
    storage_key: string;
    mime_type: string;
    size_bytes: string | number ;
  }) {
    const uploadUrl = await services.storage.getPresignedPutUrl(
      media.storage_key,
      media.mime_type,
      Number(media.size_bytes),
    );

    return {
      uploadUrl,
      mediaAssetId: media.id,
    };
  }

  /**
   * HELPER: Validates that a reused idempotency key belongs to the same request.
   * Prevents accidental misuse where a client tries to reuse a key with different parameters.
   * Throws 409 CONFLICT if the payload doesn't match the original request.
   */
  function validateSameUpload(
    existingMedia: {
      original_filename: string;
      mime_type: string;
      size_bytes: string| number;
      type: string;
    },
    incomingPayload: PresignMediaRequest,
  ) {
    const isSameUpload =
      existingMedia.original_filename === incomingPayload.filename &&
      existingMedia.mime_type === incomingPayload.contentType &&
      Number(existingMedia.size_bytes) === incomingPayload.fileSize &&
      existingMedia.type === incomingPayload.type;

    if (!isSameUpload) {
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "The idempotency key was already used for a different upload. Please use a new idempotency key.",
      );
    }
  }

  /**
   * Pre-signs an S3/storage upload URL for media asset creation.
   *
   * IDEMPOTENCY IMPLEMENTATION (REQUIRED):
   * - Idempotency key is mandatory for all requests to prevent duplicate uploads
   * - Checks database for prior request with same key
   * - Validates that reused key has identical payload (filename, size, type, mime type)
   * - Returns cached result if key + payload match
   *
   * RACE CONDITION HANDLING:
   * - Uses database unique constraint: (owner_id, idempotency_key)
   * - If concurrent requests with same key arrive simultaneously:
   *   1. Both attempt INSERT
   *   2. Database rejects second with unique constraint violation
   *   3. Second request catches the error and retries lookup
   *   4. Second request validates payload and returns winner's result
   * - This prevents duplicate media assets and URLs from race conditions
   *
   * SAFETY GUARANTEES:
   * - Multiple requests with same key always return same result
   * - Prevents accidental payload mismatches with idempotency key reuse
   * - Safe under high concurrency due to database constraint
   * - Idempotency key is always stored, never null
   */
  async function presignMediaUpload(
    ownerId: string,
    payload: PresignMediaRequest,
    idempotencyKey: string,
  ) {
    // STEP 1: Check if this idempotency key was already processed
    const existingMedia =
      await mediaRepo.findMediaAssetByIdempotencyKey(
        database,
        ownerId,
        idempotencyKey,
      );

    if (existingMedia) {
      // Validate that the reused key has the same payload
      validateSameUpload(existingMedia, payload);
      // Return the previously generated presigned URL
      return createPresignedUploadResponse(existingMedia);
    }

    // STEP 2: New request - need to create new media asset
    const mediaId = crypto.randomUUID();

    // Extract file extension and normalize to lowercase
    const extension = payload.filename.includes(".")
      ? payload.filename.split(".").pop()?.toLowerCase()
      : undefined;

    const storageKey =
      `media/${ownerId}/${mediaId}` +
      (extension ? `.${extension}` : "");

    // STEP 3: Attempt to insert media asset
    // Using try-catch to handle race conditions where concurrent requests
    // try to insert with the same idempotency key
    try {
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
        idempotency_key: idempotencyKey,
      });
    } catch (error) {
      // RACE CONDITION RECOVERY:
      // If we hit the unique constraint, another concurrent request inserted first.
      // Retry the lookup and return the winner's result.
      if (isUniqueViolation(error)) {
        const concurrentWinner =
          await mediaRepo.findMediaAssetByIdempotencyKey(
            database,
            ownerId,
            idempotencyKey,
          );

        if (!concurrentWinner) {
          // Constraint error but can't find the media - something went wrong
          throw error;
        }

        // Double-check the payload matches (extra safety)
        validateSameUpload(concurrentWinner, payload);

        // Return the concurrent winner's presigned URL
        return createPresignedUploadResponse(concurrentWinner);
      }

      // Not a constraint error, re-throw
      throw error;
    }

    // STEP 4: Success - return presigned URL for the newly created media
    return createPresignedUploadResponse({
      id: mediaId,
      storage_key: storageKey,
      mime_type: payload.contentType,
      size_bytes: payload.fileSize,
    });
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

    if (media.status !== "uploaded" && media.status !== "ready") {
      throw new AppError(
        400,
        "MEDIA_NOT_UPLOADED",
        "Video file must be uploaded and confirmed first.",
      );
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
    }

    return { should202: true, jobId };
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

    return {
      status: job.status,
      progressPercent: Number(job.progress_percent),
      error: job.error_message,
    };
  }

  return {
    presignMediaUpload,
    confirmUpload,
    queueTranscodeJob,
    getMediaAsset,
    getMediaAssets,
    getVideoJobProgress,
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
