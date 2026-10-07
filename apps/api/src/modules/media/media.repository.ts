import { sql, type Kysely } from "kysely";
import type {
  Database,
  DatabaseExecutor,
  Json,
  MediaAssetStatus,
} from "@veolms/database";
import type { VideoJobStatus, VideoQualityLevel } from "@veolms/contracts";

export async function findMediaAssetById(
  database: Kysely<Database>,
  mediaId: string,
  ownerId?: string,
) {
  let query = database
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "=", mediaId);

  if (ownerId) {
    query = query.where("owner_id", "=", ownerId);
  }

  return await query.executeTakeFirst();
}

/**
 * The same lookup without the `metadata` JSON (image variants, probe
 * output), for callers that only need to locate, describe or authorize an
 * asset.
 */
export async function findMediaAssetSummaryById(
  database: Kysely<Database>,
  mediaId: string,
  ownerId?: string,
) {
  let query = database
    .selectFrom("media_assets")
    .select([
      "id",
      "owner_id",
      "type",
      "status",
      "storage_key",
      "original_filename",
      "size_bytes",
      "width",
      "height",
      "duration_seconds",
    ])
    .where("id", "=", mediaId);

  if (ownerId) {
    query = query.where("owner_id", "=", ownerId);
  }

  return await query.executeTakeFirst();
}

/**
 * True if `mediaId` is the thumbnail or trailer of a published, non-deleted
 * course — i.e. safe to serve without authentication (public course
 * marketing pages embed it directly as an <img>/<video> src). Queries the
 * `courses` table directly rather than importing the courses module, to
 * avoid a circular dependency (courses already depends on media).
 */
/**
 * Whether a media asset is the thumbnail or trailer of a published course,
 * which makes it publicly deliverable.
 *
 * The asset's own type has to match the slot: only an image counts as a
 * thumbnail and only a video as a trailer. Matching on the id alone meant
 * any asset that ended up in `thumbnail_media_id` — a paid lesson's source
 * file, a private document — was served to anonymous callers.
 */
export async function isMediaAttachedToPublishedCourse(
  database: Kysely<Database>,
  mediaId: string,
) {
  const row = await database
    .selectFrom("courses as c")
    .select("c.id")
    .where("c.status", "=", "published")
    .where("c.deleted_at", "is", null)
    .where((eb) => {
      const assetOfType = (type: string) =>
        eb.exists(
          eb
            .selectFrom("media_assets as m")
            .select("m.id")
            .where("m.id", "=", mediaId)
            .where("m.type", "=", type),
        );
      return eb.or([
        eb.and([
          eb("c.thumbnail_media_id", "=", mediaId),
          assetOfType("image"),
        ]),
        eb.and([eb("c.trailer_media_id", "=", mediaId), assetOfType("video")]),
      ]);
    })
    .executeTakeFirst();

  return row !== undefined;
}

export async function findMediaAssetsByIds(
  database: Kysely<Database>,
  mediaIds: string[],
  ownerId?: string,
  lock = false,
) {
  if (mediaIds.length === 0) return [];
  let query = database
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "in", mediaIds);

  if (ownerId) {
    query = query.where("owner_id", "=", ownerId);
  }

  if (lock) {
    query = query.forUpdate();
  }

  return await query.execute();
}

export async function deleteMediaAssets(
  database: Kysely<Database>,
  mediaIds: string[],
) {
  if (mediaIds.length === 0) {
    return;
  }

  await database
    .deleteFrom("media_assets")
    .where("id", "in", mediaIds)
    .execute();
}

export async function insertMediaAsset(
  database: DatabaseExecutor,
  values: {
    id: string;
    owner_id: string;
    type: "image" | "video" | "document";
    storage_provider: string;
    storage_key: string;
    original_filename: string;
    mime_type: string;
    size_bytes: number;
    status: MediaAssetStatus;
    metadata?: Json;
  },
) {
  await database.insertInto("media_assets").values(values).execute();
}

export async function updateMediaAssetStatus(
  database: Kysely<Database>,
  mediaId: string,
  status: MediaAssetStatus,
) {
  await database
    .updateTable("media_assets")
    .set({ status, updated_at: new Date() })
    .where("id", "=", mediaId)
    .execute();
}

export async function updateMediaAssetProbedDetails(
  database: Kysely<Database>,
  mediaId: string,
  details: {
    size_bytes?: number | string;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    metadata?: Json;
  },
) {
  const updates: Record<string, unknown> = {
    updated_at: new Date(),
  };
  if (details.size_bytes !== undefined)
    updates["size_bytes"] = details.size_bytes;
  if (details.width !== undefined) updates["width"] = details.width;
  if (details.height !== undefined) updates["height"] = details.height;
  if (details.duration_seconds !== undefined)
    updates["duration_seconds"] = details.duration_seconds;
  if (details.metadata !== undefined) updates["metadata"] = details.metadata;

  await database
    .updateTable("media_assets")
    .set(updates)
    .where("id", "=", mediaId)
    .execute();
}

export async function insertVideoJob(
  database: Kysely<Database>,
  values: {
    id: string;
    video_id: string;
    video_key: string;
    output_prefix: string;
    video_size: number;
    qualities: VideoQualityLevel[];
    status?: VideoJobStatus;
    worker_id?: string | null;
    progress_percent?: number;
    error_message?: string | null;
    video_metadata?: Record<string, unknown> | null;
    created_at?: Date;
  },
) {
  const { video_metadata, ...rest } = values;
  await database
    .insertInto("video_jobs")
    .values({
      status: "queued",
      ...rest,
      video_metadata: video_metadata
        ? JSON.stringify(video_metadata)
        : undefined,
    })
    .execute();
}

export async function updateVideoJobStatus(
  database: Kysely<Database>,
  jobId: string,
  values: {
    status: VideoJobStatus;
    progress_percent?: number;
    error_message?: string | null;
    failed_at?: Date | null;
  },
) {
  await database
    .updateTable("video_jobs")
    .set({
      ...values,
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .execute();
}

/** Records the transcoding provider's own job id, captured at dispatch. */
export async function setVideoJobProviderJobId(
  database: Kysely<Database>,
  jobId: string,
  providerJobId: string,
) {
  await database
    .updateTable("video_jobs")
    .set({ provider_job_id: providerJobId, updated_at: new Date() })
    .where("id", "=", jobId)
    .execute();
}

const VIDEO_JOB_STATE_COLUMNS = [
  "id",
  "video_id",
  "status",
  "output_prefix",
] as const;

/** Identity and state of a job, without its dispatch details. */
export async function findVideoJobStateById(
  database: Kysely<Database>,
  jobId: string,
) {
  return await database
    .selectFrom("video_jobs")
    .select(VIDEO_JOB_STATE_COLUMNS)
    .where("id", "=", jobId)
    .executeTakeFirst();
}

/** Identity and state of a video's latest job, without its dispatch details. */
export async function findVideoJobStateByVideoId(
  database: Kysely<Database>,
  videoId: string,
) {
  return await database
    .selectFrom("video_jobs")
    .select(VIDEO_JOB_STATE_COLUMNS)
    .where("video_id", "=", videoId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/** A video's latest job with what re-dispatching or cancelling it needs. */
export async function findVideoJobByVideoId(
  database: Kysely<Database>,
  videoId: string,
) {
  return await database
    .selectFrom("video_jobs")
    .select([
      ...VIDEO_JOB_STATE_COLUMNS,
      "video_key",
      "video_size",
      "qualities",
      "video_metadata",
      "provider_job_id",
    ])
    .where("video_id", "=", videoId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * What the transcoding progress poll reads, in one query: the asset's
 * status and its latest job's state. No row means the asset does not exist
 * (or is not `ownerId`'s); a row without `job_id` means it has no job yet.
 */
export async function findVideoJobProgress(
  database: Kysely<Database>,
  videoId: string,
  ownerId?: string,
) {
  let query = database
    .selectFrom("media_assets")
    .leftJoin("video_jobs", "video_jobs.video_id", "media_assets.id")
    .select([
      "media_assets.status as media_status",
      "video_jobs.id as job_id",
      "video_jobs.status as job_status",
      "video_jobs.progress_percent as progress_percent",
    ])
    .where("media_assets.id", "=", videoId);

  if (ownerId) {
    query = query.where("media_assets.owner_id", "=", ownerId);
  }

  return await query
    .orderBy("video_jobs.created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * Resolves the public, sequential lesson number used by the learning route to
 * the canonical course/lesson/media records. The web app deliberately keeps
 * database UUIDs out of learner URLs, so the ordering must match the course
 * overview adapter: section position, then lesson position.
 */
export async function findPlaybackLessonContext(
  database: Kysely<Database>,
  courseIdOrSlug: string,
  lessonNumber: number,
  options?: { includeUnpublished?: boolean },
) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      courseIdOrSlug,
    );
  let query = database
    .selectFrom("course_lessons")
    .innerJoin("courses", "courses.id", "course_lessons.course_id")
    .innerJoin(
      "course_sections",
      "course_sections.id",
      "course_lessons.section_id",
    )
    .leftJoin("course_pricing", "course_pricing.course_id", "courses.id")
    .leftJoin(
      "course_access_rules",
      "course_access_rules.course_id",
      "courses.id",
    )
    .leftJoin(
      "media_assets",
      "media_assets.id",
      "course_lessons.content_media_id",
    )
    .select([
      "courses.id as course_id",
      "courses.slug as course_slug",
      "courses.status as course_status",
      "courses.creator_id as course_creator_id",
      "course_pricing.pricing_type as pricing_type",
      "course_access_rules.access_type as access_type",
      "course_lessons.id as lesson_id",
      "course_lessons.title as lesson_title",
      "course_lessons.content_media_id as content_media_id",
      "course_lessons.is_preview as is_preview",
      "course_lessons.is_published as is_published",
      // The lesson's media travels with it so playback does not read the
      // asset a second time.
      "media_assets.type as media_type",
      "media_assets.status as media_status",
      "media_assets.storage_key as media_storage_key",
      "media_assets.duration_seconds as duration_seconds",
    ])
    .where((eb) =>
      isUuid
        ? eb("courses.id", "=", courseIdOrSlug)
        : eb("courses.slug", "=", courseIdOrSlug),
    )
    .where("courses.deleted_at", "is", null)
    .where("course_sections.deleted_at", "is", null)
    .where("course_lessons.deleted_at", "is", null);

  if (!options?.includeUnpublished) {
    query = query.where("course_lessons.is_published", "=", true);
  }

  return await query
    .orderBy("course_sections.position", "asc")
    .orderBy("course_lessons.position", "asc")
    .orderBy("course_lessons.id", "asc")
    // The public lesson number is the ordered position across all sections.
    // Offset/limit keeps large courses from serializing every lesson for a
    // single playback bootstrap request.
    .offset(lessonNumber - 1)
    .limit(1)
    .executeTakeFirst();
}

/** Resolves the lesson that owns a media asset for HLS request authorization. */
export async function findPlaybackMediaContext(
  database: Kysely<Database>,
  mediaId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .innerJoin("courses", "courses.id", "course_lessons.course_id")
    .leftJoin("course_pricing", "course_pricing.course_id", "courses.id")
    .leftJoin(
      "course_access_rules",
      "course_access_rules.course_id",
      "courses.id",
    )
    .leftJoin(
      "media_assets",
      "media_assets.id",
      "course_lessons.content_media_id",
    )
    .select([
      "courses.id as course_id",
      "courses.status as course_status",
      "courses.creator_id as course_creator_id",
      "course_pricing.pricing_type as pricing_type",
      "course_access_rules.access_type as access_type",
      "course_lessons.is_preview as is_preview",
      "course_lessons.is_published as is_published",
      // Whether this is the course's first published lesson, in the same
      // order the lesson numbers use: section position, then lesson position.
      sql<boolean>`not exists (
        select 1
        from course_lessons earlier
        join course_sections earlier_section
          on earlier_section.id = earlier.section_id
        where earlier.course_id = course_lessons.course_id
          and earlier.deleted_at is null
          and earlier.is_published = true
          and earlier_section.deleted_at is null
          and (earlier_section.position, earlier.position, earlier.id)
            < (course_sections.position, course_lessons.position, course_lessons.id)
      )`.as("is_first_lesson"),
      "media_assets.type as media_type",
      "media_assets.status as media_status",
      "media_assets.storage_key as media_storage_key",
    ])
    .innerJoin(
      "course_sections",
      "course_sections.id",
      "course_lessons.section_id",
    )
    .where("course_lessons.content_media_id", "=", mediaId)
    .where("media_assets.id", "=", mediaId)
    .where("courses.deleted_at", "is", null)
    .where("course_lessons.deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findVideoOutputsByVideoIds(
  database: Kysely<Database>,
  videoIds: string[],
) {
  if (videoIds.length === 0) {
    return [];
  }

  return await database
    .selectFrom("video_outputs")
    .select(["video_id", "master_playlist_path"])
    .where("video_id", "in", videoIds)
    .execute();
}

/** The master playlist of a video's most recent transcode, if it has one. */
export async function findLatestVideoOutput(
  database: Kysely<Database>,
  videoId: string,
) {
  return await database
    .selectFrom("video_outputs")
    .select("master_playlist_path")
    .where("video_id", "=", videoId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

export async function insertVideoOutput(
  database: Kysely<Database>,
  values: {
    id: string;
    video_id: string;
    master_playlist_path: string;
    created_at: Date;
  },
) {
  await database.insertInto("video_outputs").values(values).execute();
}
