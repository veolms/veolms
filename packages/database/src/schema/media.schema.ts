import type { Generated } from "kysely";

export type MediaAssetStatus = "uploading" | "uploaded" | "ready" | "failed";

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
  idempotency_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoOutputTable {
  id: string;
  video_id: string;
  master_playlist_path: string;
  created_at: Generated<Date>;
}
