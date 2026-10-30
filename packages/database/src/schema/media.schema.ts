import type { Generated, JSONColumnType } from "kysely";
import type { Json } from "./json.schema.ts";
import type {
  VideoJobStatus,
  VideoQualityLevel,
  YoutubeImportStatus,
} from "@veolms/contracts";

export type MediaAssetStatus =
  "uploading" | "uploaded" | "processing" | "ready" | "failed";

export interface ImageVariantMetadata {
  width: number;
  height: number;
  key: string;
  sizeBytes: number;
}

export interface ImageMetadata {
  original: {
    width: number;
    height: number;
    key: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
  full: ImageVariantMetadata;
  variants: ImageVariantMetadata[];
}

export interface MediaAssetTable {
  id: string;
  owner_id: string;
  type: string;
  storage_provider: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  metadata: Json;
  status: MediaAssetStatus;
  /** Multipart upload handle while a resumable upload is in flight. */
  upload_id: string | null;
  /** Exact part size chosen for the in-flight resumable upload. */
  upload_part_size: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoJobTable {
  id: string;
  video_id: string;
  status: VideoJobStatus;
  video_key: string;
  output_prefix: string;
  video_size: number;
  qualities: VideoQualityLevel[];
  worker_id: string | null;
  progress_percent: Generated<number>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  error_message: string | null;
  original_file_key: string | null;
  video_metadata: JSONColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  > | null;
  /** Provider-assigned job id (e.g. MediaConvert's) — required to cancel. */
  provider_job_id: string | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  updated_at: Generated<Date>;
}

export type ImageJobStatus = "queued" | "processing" | "completed" | "failed";

export interface ImageJobTable {
  id: string;
  media_id: string;
  status: ImageJobStatus;
  attempts: number;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type YoutubeImportStage =
  "resolved" | "downloaded" | "packaged" | "uploaded";

export interface YoutubeImportJobTable {
  id: string;
  media_id: string;
  owner_id: string;
  course_id: string | null;
  lesson_id: string | null;
  /** The lesson's video when the import started; replaced only if unchanged. */
  replaces_media_id: string | null;
  source_url: string;
  youtube_id: string;
  status: YoutubeImportStatus;
  /** The last stage whose output is complete on disk/in storage. */
  completed_stage: YoutubeImportStage | null;
  stage_detail: string | null;
  progress_percent: Generated<number>;
  title: string | null;
  duration_seconds: number | null;
  qualities: JSONColumnType<string[], string[] | string, string[] | string>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  error_message: string | null;
  cancel_requested: Generated<boolean>;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  scratch_dir: string | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Generated<Date>;
}

export type MediaSourceProvider = "youtube";

/** How a video's source was learned. */
export type MediaSourceRecordedVia = "import" | "cli" | "backfill";

/** Where a video came from, e.g. the YouTube video it was imported from. */
export interface MediaSourceTable {
  media_id: string;
  provider: MediaSourceProvider;
  /** The provider's id of the video (YouTube's 11-character id). */
  external_id: string;
  source_url: string;
  /** As the provider showed them at import time. */
  title: string | null;
  channel: string | null;
  recorded_via: MediaSourceRecordedVia;
  created_at: Generated<Date>;
}

export interface VideoOutputTable {
  id: string;
  video_id: string;
  master_playlist_path: string;
  created_at: Generated<Date>;
}
