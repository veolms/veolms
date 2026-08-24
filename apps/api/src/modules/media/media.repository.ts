import type { Kysely } from "kysely";
import type {
  Database,
  MediaAssetStatus,
  VideoJobStatus,
  VideoQualityLevel,
} from "@veolms/database";

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

export async function findMediaAssetsByIds(
  database: Kysely<Database>,
  mediaIds: string[],
  ownerId?: string,
) {
  if (mediaIds.length === 0) return [];
  let query = database
    .selectFrom("media_assets")
    .selectAll()
    .where("id", "in", mediaIds);

  if (ownerId) {
    query = query.where("owner_id", "=", ownerId);
  }

  return await query.execute();
}

export async function insertMediaAsset(
  database: Kysely<Database>,
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
    created_at?: Date;
  },
) {
  await database
    .insertInto("video_jobs")
    .values({
      status: "QUEUED",
      ...values,
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
    failed_at?: Date;
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

export async function findVideoJobByVideoId(
  database: Kysely<Database>,
  videoId: string,
) {
  return await database
    .selectFrom("video_jobs")
    .selectAll()
    .where("video_id", "=", videoId)
    .orderBy("created_at", "desc")
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
