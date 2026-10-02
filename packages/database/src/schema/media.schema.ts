import type { Generated, JSONColumnType } from "kysely";
import type { Json } from "./json.schema.ts";
import type { VideoJobStatus, VideoQualityLevel } from "@veolms/contracts";

export type MediaAssetStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

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

export interface VideoOutputTable {
  id: string;
  video_id: string;
  master_playlist_path: string;
  created_at: Generated<Date>;
}
