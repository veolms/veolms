import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import {
  claimNextQueuedVideoJob,
  type Database,
  type VideoJobTable,
} from "@veolms/database";
import {
  estimateJobHardware,
  type VideoQualityLevel,
  type VideoMetadata,
} from "@veolms/fleet-types";
import type { FleetManagerConfig } from "@veolms/config";

export interface QueueJobParams {
  jobId?: string;
  videoId?: string;
  videoKey: string;
  outputPrefix: string;
  qualities: readonly VideoQualityLevel[];
  videoSize?: number;
  videoMetadata?: VideoMetadata;
}

export interface JobManager {
  claimNextJob(): Promise<Selectable<VideoJobTable> | null>;
  assignWorkerToJob(jobId: string, workerId: string): Promise<void>;
  markJobCompleted(jobId: string): Promise<void>;
  markJobFailed(
    jobId: string,
    errorMessage: string,
    expectedWorkerId?: string,
  ): Promise<boolean>;
  queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>>;
  getJob(jobId: string): Promise<Selectable<VideoJobTable> | null>;
}

export function createJobManager(options: {
  db: Kysely<Database>;
  config: FleetManagerConfig;
}): JobManager {
  const { db, config } = options;

  return {
    async claimNextJob(): Promise<Selectable<VideoJobTable> | null> {
      return await claimNextQueuedVideoJob(db);
    },

    async assignWorkerToJob(jobId: string, workerId: string): Promise<void> {
      await db
        .updateTable("video_jobs")
        .set({
          worker_id: workerId,
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobCompleted(jobId: string): Promise<void> {
      await db
        .updateTable("video_jobs")
        .set({
          status: "completed",
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId)
        .execute();
    },

    async markJobFailed(
      jobId: string,
      errorMessage: string,
      expectedWorkerId?: string,
    ): Promise<boolean> {
      let query = db
        .selectFrom("video_jobs")
        .select(["id", "attempts", "max_attempts", "status", "worker_id"])
        .where("id", "=", jobId);

      if (expectedWorkerId) {
        query = query
          .where("status", "in", ["provisioning", "processing"])
          .where("worker_id", "=", expectedWorkerId);
      }

      const job = await query.executeTakeFirst();

      if (!job || job.status === "completed") {
        return false;
      }

      const nextAttempts = job.attempts + 1;
      const shouldRetry = nextAttempts < job.max_attempts;

      let updateQuery = db
        .updateTable("video_jobs")
        .set({
          attempts: nextAttempts,
          status: shouldRetry ? "queued" : "failed",
          worker_id: null,
          error_message: errorMessage,
          failed_at: shouldRetry ? null : new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", jobId);

      if (expectedWorkerId) {
        updateQuery = updateQuery
          .where("status", "in", ["provisioning", "processing"])
          .where("worker_id", "=", expectedWorkerId);
      }

      const result = await updateQuery.executeTakeFirst();
      return result.numUpdatedRows === 1n ? shouldRetry : false;
    },

    async queueJob(params: QueueJobParams): Promise<Selectable<VideoJobTable>> {
      // 1. If an exact jobId is requested, check if it already exists in the database
      if (params.jobId) {
        const existingById = await db
          .selectFrom("video_jobs")
          .selectAll()
          .where("id", "=", params.jobId)
          .executeTakeFirst();
        if (existingById) {
          return existingById;
        }
      }

      // 2. Check if a job is already active for this videoId or videoKey
      let activeQuery = db
        .selectFrom("video_jobs")
        .selectAll()
        .where("status", "in", ["queued", "provisioning", "processing"]);

      if (params.videoId) {
        const vid = params.videoId;
        activeQuery = activeQuery.where((eb) =>
          eb.or([
            eb("video_id", "=", vid),
            eb("video_key", "=", params.videoKey),
          ]),
        );
      } else {
        activeQuery = activeQuery.where("video_key", "=", params.videoKey);
      }

      const existingActive = await activeQuery
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      if (existingActive) {
        return existingActive;
      }

      const id = params.jobId ?? randomUUID();
      const videoSize = params.videoSize ?? 0;
      const now = new Date();

      // Persist the probed metadata subset (minus ffprobe's raw per-stream
      // dump) alongside the resolved profile tier. estimateJobHardware()
      // is a pure function of (video_size, qualities, video_metadata), so
      // every later reader (worker provisioning, the atomic claim query,
      // the worker's own claim-time capacity check) recomputes the exact
      // same cpu/memory/storage/duration from this persisted row — nothing
      // else needs to be stored. hardware_profile itself is kept only for
      // observability/filtering (see migration 008).
      const persistedMetadata = params.videoMetadata
        ? (() => {
            const { rawStreams: _rawStreams, ...rest } = params.videoMetadata;
            return rest;
          })()
        : null;
      const hardwareProfile = estimateJobHardware(videoSize, params.qualities, {
        videoMetadata: persistedMetadata,
      }).profile;

      const metaWidth = params.videoMetadata?.width ?? null;
      const metaHeight = params.videoMetadata?.height ?? null;
      const metaDuration = params.videoMetadata?.durationSeconds
        ? Math.round(params.videoMetadata.durationSeconds)
        : null;

      // Ensure media_assets record exists so foreign key video_jobs.video_id -> media_assets.id is satisfied
      let videoId = params.videoId;
      if (!videoId) {
        const existingMedia = await db
          .selectFrom("media_assets")
          .selectAll()
          .where("storage_key", "=", params.videoKey)
          .executeTakeFirst();

        if (existingMedia) {
          videoId = existingMedia.id;
          if (
            (metaWidth && !existingMedia.width) ||
            (metaHeight && !existingMedia.height) ||
            (metaDuration && !existingMedia.duration_seconds)
          ) {
            try {
              await db
                .updateTable("media_assets")
                .set({
                  width: existingMedia.width ?? metaWidth,
                  height: existingMedia.height ?? metaHeight,
                  duration_seconds:
                    existingMedia.duration_seconds ?? metaDuration,
                  updated_at: new Date(),
                })
                .where("id", "=", videoId)
                .execute();
            } catch {
              // Ignore update error
            }
          }
        } else {
          videoId = randomUUID();
          const filename = params.videoKey.split("/").pop() || "video.mp4";
          const defaultOwnerId = "00000000-0000-4000-8000-000000000001";
          let ownerId = defaultOwnerId;
          try {
            const ownerUser = await db
              .selectFrom("users")
              .selectAll()
              .where("id", "=", defaultOwnerId)
              .executeTakeFirst();
            if (ownerUser?.id) {
              ownerId = ownerUser.id;
            } else {
              await db
                .insertInto("users")
                .values({
                  id: defaultOwnerId,
                  email: "creator@veolms.org",
                  username: "creator",
                  display_name: "VeoLMS Creator",
                  email_verified_at: new Date(),
                })
                .execute();
            }
          } catch {
            // Ignore mock DB / concurrent insert errors
          }
          try {
            await db
              .insertInto("media_assets")
              .values({
                id: videoId,
                owner_id: ownerId,
                type: "video",
                storage_provider: "s3",
                storage_key: params.videoKey,
                original_filename: filename,
                mime_type: "video/mp4",
                size_bytes: videoSize,
                width: metaWidth,
                height: metaHeight,
                duration_seconds: metaDuration,
                status: "ready",
              })
              .execute();
          } catch {
            // Ignore if concurrently inserted
          }
        }
      } else {
        const existingMedia = await db
          .selectFrom("media_assets")
          .selectAll()
          .where("id", "=", videoId)
          .executeTakeFirst();

        if (existingMedia) {
          if (
            (metaWidth && !existingMedia.width) ||
            (metaHeight && !existingMedia.height) ||
            (metaDuration && !existingMedia.duration_seconds)
          ) {
            try {
              await db
                .updateTable("media_assets")
                .set({
                  width: existingMedia.width ?? metaWidth,
                  height: existingMedia.height ?? metaHeight,
                  duration_seconds:
                    existingMedia.duration_seconds ?? metaDuration,
                  updated_at: new Date(),
                })
                .where("id", "=", videoId)
                .execute();
            } catch {
              // Ignore update error
            }
          }
        } else {
          const filename = params.videoKey.split("/").pop() || "video.mp4";
          const defaultOwnerId = "00000000-0000-4000-8000-000000000001";
          let ownerId = defaultOwnerId;
          try {
            const ownerUser = await db
              .selectFrom("users")
              .selectAll()
              .where("id", "=", defaultOwnerId)
              .executeTakeFirst();
            if (ownerUser?.id) {
              ownerId = ownerUser.id;
            } else {
              await db
                .insertInto("users")
                .values({
                  id: defaultOwnerId,
                  email: "creator@veolms.org",
                  username: "creator",
                  display_name: "VeoLMS Creator",
                  email_verified_at: new Date(),
                })
                .execute();
            }
          } catch {
            // Ignore mock DB / concurrent insert errors
          }
          try {
            await db
              .insertInto("media_assets")
              .values({
                id: videoId,
                owner_id: ownerId,
                type: "video",
                storage_provider: "s3",
                storage_key: params.videoKey,
                original_filename: filename,
                mime_type: "video/mp4",
                size_bytes: videoSize,
                width: metaWidth,
                height: metaHeight,
                duration_seconds: metaDuration,
                status: "ready",
              })
              .execute();
          } catch {
            // Ignore if concurrently inserted
          }
        }
      }

      try {
        const [row] = await db
          .insertInto("video_jobs")
          .values({
            id,
            video_id: videoId,
            status: "queued",
            video_key: params.videoKey,
            output_prefix: params.outputPrefix,
            video_size: videoSize,
            qualities: [...params.qualities],
            worker_id: null,
            attempts: 0,
            max_attempts: config.MAX_RETRIES,
            error_message: null,
            hardware_profile: hardwareProfile,
            video_metadata: persistedMetadata,
            created_at: now,
            started_at: null,
            completed_at: null,
            failed_at: null,
            updated_at: now,
          })
          .returningAll()
          .execute();

        return (
          row ?? {
            id,
            video_id: videoId,
            status: "queued",
            video_key: params.videoKey,
            output_prefix: params.outputPrefix,
            video_size: videoSize,
            qualities: [...params.qualities],
            worker_id: null,
            progress_percent: 0,
            attempts: 0,
            max_attempts: config.MAX_RETRIES,
            error_message: null,
            hardware_profile: hardwareProfile,
            video_metadata: persistedMetadata,
            created_at: now,
            started_at: null,
            completed_at: null,
            failed_at: null,
            updated_at: now,
          }
        );
      } catch (insertErr) {
        // If a concurrent insert occurred (unique constraint violation), return the existing row
        const raceWinner = await db
          .selectFrom("video_jobs")
          .selectAll()
          .where((eb) =>
            eb.or([
              eb("id", "=", id),
              eb("video_id", "=", videoId),
              eb("video_key", "=", params.videoKey),
            ]),
          )
          .orderBy("created_at", "desc")
          .executeTakeFirst();

        if (raceWinner) {
          return raceWinner;
        }

        throw insertErr;
      }
    },

    async getJob(jobId: string): Promise<Selectable<VideoJobTable> | null> {
      const row = await db
        .selectFrom("video_jobs")
        .selectAll()
        .where("id", "=", jobId)
        .executeTakeFirst();

      return row ?? null;
    },
  };
}
