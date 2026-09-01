import type { Generated, JSONColumnType } from "kysely";
import type {
  Architecture,
  FleetEventType,
  HardwareProfile,
  ProviderType,
  VideoJobStatus,
  VideoQualityLevel,
  WorkerStatus,
} from "@veolms/contracts";

export type {
  Architecture,
  FleetEventType,
  HardwareProfile,
  ProviderType,
  VideoJobStatus,
  VideoQualityLevel,
  WorkerStatus,
};

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
  hardware_profile: HardwareProfile | null;
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

export interface WorkerTable {
  id: string;
  provider: ProviderType;
  provider_worker_id: string;
  status: WorkerStatus;
  architecture: Architecture;
  cpu: number;
  memory_mb: number;
  storage_gb: Generated<number>;
  region: Generated<string>;
  job_id: string | null;
  metadata: JSONColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  >;
  last_heartbeat_at: Date | null;
  created_at: Generated<Date>;
  started_at: Date | null;
  terminated_at: Date | null;
  updated_at: Generated<Date>;
}

export interface WorkerMonitoringTable {
  worker_id: string;
  next_check_at: Date;
  last_check_at: Date | null;
  estimated_duration_sec: number;
  progress_percent: Generated<number>;
  last_progress_at: Date | null;
  monitoring_attempts: Generated<number>;
  check_interval_sec: Generated<number>;
  updated_at: Generated<Date>;
}

export interface WorkerEventTable {
  id: string;
  worker_id: string | null;
  job_id: string | null;
  event: FleetEventType;
  metadata: JSONColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  >;
  created_at: Generated<Date>;
}
