import { sql, type Kysely, type Selectable, type Updateable } from "kysely";
import type {
  Database,
  DatabaseExecutor,
  Json,
  MediaAssetStatus,
  YoutubeImportJobTable,
} from "@veolms/database";
import type { VideoQualityLevel, YoutubeImportStatus } from "@veolms/contracts";

export type YoutubeImportJob = Selectable<YoutubeImportJobTable>;

/** Statuses a worker holds under a lease. */
export const ACTIVE_IMPORT_STATUSES = [
  "resolving",
  "downloading",
  "packaging",
  "uploading",
  "finalizing",
] as const satisfies readonly YoutubeImportStatus[];

/** Statuses that still have work to do (and so block a second import). */
export const OPEN_IMPORT_STATUSES = [
  "queued",
  ...ACTIVE_IMPORT_STATUSES,
] as const satisfies readonly YoutubeImportStatus[];

export async function insertImportMedia(
  database: DatabaseExecutor,
  media: {
    id: string;
    owner_id: string;
    storage_key: string;
    original_filename: string;
    mime_type: string;
    metadata: Json;
  },
): Promise<void> {
  await database
    .insertInto("media_assets")
    .values({
      ...media,
      type: "video",
      storage_provider: "s3",
      size_bytes: 0,
      status: "processing",
    })
    .execute();
}

export async function insertImportJob(
  database: DatabaseExecutor,
  job: {
    id: string;
    media_id: string;
    owner_id: string;
    course_id: string | null;
    lesson_id: string | null;
    replaces_media_id: string | null;
    source_url: string;
    youtube_id: string;
    title: string | null;
    duration_seconds: number | null;
  },
): Promise<void> {
  await database
    .insertInto("youtube_import_jobs")
    .values({ ...job, status: "queued", qualities: JSON.stringify([]) })
    .execute();
}

export async function setImportMediaStatus(
  database: DatabaseExecutor,
  mediaId: string,
  status: MediaAssetStatus,
): Promise<void> {
  await database
    .updateTable("media_assets")
    .set({ status, updated_at: new Date() })
    .where("id", "=", mediaId)
    .execute();
}

export async function deleteImportMedia(
  database: DatabaseExecutor,
  mediaId: string,
): Promise<void> {
  // The job row goes with it (on delete cascade).
  await database.deleteFrom("media_assets").where("id", "=", mediaId).execute();
}

export async function findImportJobByMediaId(
  database: DatabaseExecutor,
  mediaId: string,
): Promise<YoutubeImportJob | undefined> {
  return await database
    .selectFrom("youtube_import_jobs")
    .selectAll()
    .where("media_id", "=", mediaId)
    .executeTakeFirst();
}

/** The progress stream's per-tick read: status and percentage only. */
export async function findImportProgressByMediaId(
  database: DatabaseExecutor,
  mediaId: string,
) {
  return await database
    .selectFrom("youtube_import_jobs")
    .select(["status", "progress_percent", "stage_detail"])
    .where("media_id", "=", mediaId)
    .executeTakeFirst();
}

/** A finished import of the same video by the same account, to reuse. */
export async function findReadyImportOfVideo(
  database: DatabaseExecutor,
  ownerId: string,
  youtubeId: string,
): Promise<{ media_id: string } | undefined> {
  return await database
    .selectFrom("youtube_import_jobs")
    .innerJoin(
      "media_assets",
      "media_assets.id",
      "youtube_import_jobs.media_id",
    )
    .select("youtube_import_jobs.media_id")
    .where("youtube_import_jobs.owner_id", "=", ownerId)
    .where("youtube_import_jobs.youtube_id", "=", youtubeId)
    .where("youtube_import_jobs.status", "=", "completed")
    .where("media_assets.status", "=", "ready")
    .orderBy("youtube_import_jobs.completed_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/** An import into this lesson that has not finished yet. */
export async function findOpenImportForLesson(
  database: DatabaseExecutor,
  lessonId: string,
): Promise<YoutubeImportJob | undefined> {
  return await database
    .selectFrom("youtube_import_jobs")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .where("status", "in", OPEN_IMPORT_STATUSES)
    .executeTakeFirst();
}

/**
 * The lesson's latest import that is still running or failed (retryable),
 * provided the lesson still holds the video it had when the import started:
 * otherwise the author has moved on and the import is history.
 */
export async function findResumableImportForLesson(
  database: DatabaseExecutor,
  lessonId: string,
  lessonMediaId: string | null,
): Promise<{ media_id: string; status: YoutubeImportStatus } | undefined> {
  return await database
    .selectFrom("youtube_import_jobs")
    .select(["media_id", "status"])
    .where("lesson_id", "=", lessonId)
    .where("status", "in", [...OPEN_IMPORT_STATUSES, "failed"])
    .where((eb) =>
      lessonMediaId === null
        ? eb("replaces_media_id", "is", null)
        : eb("replaces_media_id", "=", lessonMediaId),
    )
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * Claims the oldest queued job, or an active one whose worker stopped
 * renewing its lease (a crashed or restarted instance, or a failed attempt
 * waiting out its retry delay), and leases it to `leaseOwner`. SKIP LOCKED
 * keeps two instances off the same row. One statement, so no transaction.
 */
export async function claimNextImportJob(
  database: Kysely<Database>,
  leaseOwner: string,
  leaseMs: number,
): Promise<YoutubeImportJob | null> {
  const now = new Date();
  const claimed = await database
    .updateTable("youtube_import_jobs")
    .set({
      status: sql<YoutubeImportStatus>`case when status = 'queued' then 'resolving' else status end`,
      attempts: sql<number>`attempts + 1`,
      lease_owner: leaseOwner,
      lease_expires_at: new Date(now.getTime() + leaseMs),
      started_at: sql<Date>`coalesce(started_at, ${now})`,
      updated_at: now,
    })
    .where(
      "id",
      "=",
      database
        .selectFrom("youtube_import_jobs")
        .select("id")
        .where((eb) =>
          eb.or([
            eb("status", "=", "queued"),
            eb.and([
              eb("status", "in", ACTIVE_IMPORT_STATUSES),
              eb.or([
                eb("lease_expires_at", "is", null),
                eb("lease_expires_at", "<", now),
              ]),
            ]),
          ]),
        )
        .orderBy("created_at", "asc")
        .limit(1)
        .forUpdate()
        .skipLocked(),
    )
    .returningAll()
    .executeTakeFirst();
  return claimed ?? null;
}

/**
 * Extends the lease and reports whether this worker still holds it and
 * whether the author asked to cancel. A lost lease means another instance
 * took the job over; the caller stops at once.
 */
export async function renewImportLease(
  database: DatabaseExecutor,
  jobId: string,
  leaseOwner: string,
  leaseMs: number,
): Promise<{ held: boolean; cancelRequested: boolean }> {
  const row = await database
    .updateTable("youtube_import_jobs")
    .set({
      lease_expires_at: new Date(Date.now() + leaseMs),
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .where("lease_owner", "=", leaseOwner)
    .where("status", "in", ACTIVE_IMPORT_STATUSES)
    .returning(["cancel_requested"])
    .executeTakeFirst();
  return row
    ? { held: true, cancelRequested: row.cancel_requested }
    : { held: false, cancelRequested: false };
}

/**
 * Gives the job up without failing it (the instance is shutting down): the
 * lease ends now, so the next poll anywhere picks it up again, and the
 * interrupted attempt is not counted.
 */
export async function releaseImportLease(
  database: DatabaseExecutor,
  jobId: string,
  leaseOwner: string,
): Promise<void> {
  await database
    .updateTable("youtube_import_jobs")
    .set({
      lease_owner: null,
      lease_expires_at: new Date(),
      attempts: sql<number>`greatest(attempts - 1, 0)`,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .where("lease_owner", "=", leaseOwner)
    .execute();
}

/**
 * A worker's write to its own job; ignored once the lease is lost. Also
 * reports a cancel the author asked for, so a worker notices it at its
 * next progress write rather than its next lease renewal.
 */
export async function updateLeasedImportJob(
  database: DatabaseExecutor,
  jobId: string,
  leaseOwner: string,
  values: Updateable<YoutubeImportJobTable>,
): Promise<{ held: boolean; cancelRequested: boolean }> {
  const row = await database
    .updateTable("youtube_import_jobs")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", jobId)
    .where("lease_owner", "=", leaseOwner)
    .returning(["cancel_requested"])
    .executeTakeFirst();
  return row
    ? { held: true, cancelRequested: row.cancel_requested }
    : { held: false, cancelRequested: false };
}

/** Ends the job as failed or cancelled and releases its lease. */
export async function endImportJob(
  database: DatabaseExecutor,
  jobId: string,
  values: {
    status: "failed" | "cancelled";
    error_message: string | null;
    /** Shown to the author when set (a failure they can act on). */
    stage_detail?: string | null;
    completed_stage?: YoutubeImportJobTable["completed_stage"];
    scratch_dir?: string | null;
  },
): Promise<void> {
  await database
    .updateTable("youtube_import_jobs")
    .set({
      ...values,
      lease_owner: null,
      lease_expires_at: null,
      cancel_requested: false,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .execute();
}

/** Back to the queue for a retry, keeping the stages already finished. */
export async function requeueImportJob(
  database: DatabaseExecutor,
  jobId: string,
): Promise<void> {
  await database
    .updateTable("youtube_import_jobs")
    .set({
      status: "queued",
      error_message: null,
      stage_detail: null,
      attempts: 0,
      cancel_requested: false,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .where("status", "in", ["failed", "cancelled"])
    .execute();
}

/** Cancels a job that no worker has started. False when it already started. */
/**
 * Cancels a job no worker holds right now: still queued, or waiting out a
 * retry delay. Null when a worker holds it (that worker must stop itself);
 * otherwise whether an earlier attempt had started (so may have left files).
 */
export async function cancelUnclaimedImportJob(
  database: DatabaseExecutor,
  jobId: string,
): Promise<{ started: boolean } | null> {
  const row = await database
    .updateTable("youtube_import_jobs")
    .set({
      status: "cancelled",
      cancel_requested: false,
      lease_expires_at: null,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .where("status", "in", OPEN_IMPORT_STATUSES)
    .where("lease_owner", "is", null)
    .returning(["started_at"])
    .executeTakeFirst();
  return row ? { started: row.started_at !== null } : null;
}

/** Asks the worker of a running job to stop at its next lease renewal. */
export async function requestImportCancel(
  database: DatabaseExecutor,
  jobId: string,
): Promise<void> {
  await database
    .updateTable("youtube_import_jobs")
    .set({ cancel_requested: true, updated_at: new Date() })
    .where("id", "=", jobId)
    .where("status", "in", ACTIVE_IMPORT_STATUSES)
    .execute();
}

/**
 * Marks the leased job completed. False when the lease was lost or the
 * author asked to cancel: a cancelled import never becomes playable.
 */
export async function completeLeasedImportJob(
  database: DatabaseExecutor,
  jobId: string,
  leaseOwner: string,
  values: { qualities: readonly string[]; duration_seconds: number },
): Promise<boolean> {
  const now = new Date();
  const result = await database
    .updateTable("youtube_import_jobs")
    .set({
      status: "completed",
      completed_stage: "uploaded",
      progress_percent: 100,
      stage_detail: null,
      error_message: null,
      qualities: JSON.stringify(values.qualities),
      duration_seconds: values.duration_seconds,
      lease_owner: null,
      lease_expires_at: null,
      scratch_dir: null,
      completed_at: now,
      updated_at: now,
    })
    .where("id", "=", jobId)
    .where("lease_owner", "=", leaseOwner)
    .where("cancel_requested", "=", false)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Makes the imported media playable: the media row is ready and points at
 * the manifest, the output row tells playback where the manifest is, and a
 * completed `video_jobs` row keeps every reader of transcode state
 * (progress, retry, the course editor) seeing a finished video, exactly as
 * the CLI's direct-HLS import writes it.
 */
export async function publishImportedVideo(
  database: DatabaseExecutor,
  mediaId: string,
  output: {
    outputId: string;
    videoJobId: string;
    outputPrefix: string;
    manifestKey: string;
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationSeconds: number;
    /** Transcode labels ("720p"), known levels only. */
    videoQualities: VideoQualityLevel[];
    metadata: Json;
  },
): Promise<void> {
  const now = new Date();
  await database
    .updateTable("media_assets")
    .set({
      status: "ready",
      storage_key: output.manifestKey,
      mime_type: output.mimeType,
      original_filename: output.originalFilename,
      size_bytes: output.sizeBytes,
      width: output.width,
      height: output.height,
      duration_seconds: output.durationSeconds,
      metadata: output.metadata,
      updated_at: now,
    })
    .where("id", "=", mediaId)
    .execute();
  await database
    .insertInto("video_outputs")
    .values({
      id: output.outputId,
      video_id: mediaId,
      master_playlist_path: output.manifestKey,
      created_at: now,
    })
    .execute();
  await database
    .insertInto("video_jobs")
    .values({
      id: output.videoJobId,
      video_id: mediaId,
      video_key: output.manifestKey,
      output_prefix: output.outputPrefix,
      video_size: output.sizeBytes,
      qualities: output.videoQualities,
      status: "completed",
      progress_percent: 100,
      completed_at: now,
      created_at: now,
    })
    .execute();
}

/** Scratch folders of imports that ended without finishing, older than `before`. */
export async function listStaleImportScratchDirs(
  database: DatabaseExecutor,
  before: Date,
): Promise<Array<{ id: string; scratch_dir: string }>> {
  const rows = await database
    .selectFrom("youtube_import_jobs")
    .select(["id", "scratch_dir"])
    .where("status", "in", ["failed", "cancelled"])
    .where("scratch_dir", "is not", null)
    .where("updated_at", "<", before)
    .limit(50)
    .execute();
  return rows.flatMap((row) =>
    row.scratch_dir ? [{ id: row.id, scratch_dir: row.scratch_dir }] : [],
  );
}

export async function clearImportScratchDir(
  database: DatabaseExecutor,
  jobId: string,
): Promise<void> {
  await database
    .updateTable("youtube_import_jobs")
    .set({ scratch_dir: null })
    .where("id", "=", jobId)
    .execute();
}
