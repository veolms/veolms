import type { Generated } from "kysely";

export type MediaAssetStatus = "uploading" | "uploaded" | "ready" | "failed";
export type VideoJobStatus = "queued" | "processing" | "completed" | "failed";
export type JobStatus = VideoJobStatus;
export type VideoJobStage =
  | "queued"
  | "downloading"
  | "transcoding"
  | "uploading"
  | "finalizing"
  | "completed"
  | "failed";

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
  status: MediaAssetStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoJobTable {
  id: string;
  video_id: string;
  input_path: string;
  status: VideoJobStatus;
  progress_percent: Generated<number>;
  current_stage: VideoJobStage;
  worker_id: string | null;
  quality: number[];
  created_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error: string | null;
}

export interface VideoOutputTable {
  id: string;
  video_id: string;
  master_playlist_path: string;
  created_at: Generated<Date>;
}
