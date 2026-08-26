export { createDatabase } from "./client.ts";
export { claimNextQueuedVideoJob } from "./fleet/video-jobs.ts";
export const DEFAULT_SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";
export type {
  AcademyTable,
  Architecture,
  CourseStatus,
  Database,
  FleetTables,
  MediaAssetStatus,
  AccessType,
  AccessDurationType,
  PricingType,
  VideoJobTable,
  VideoOutputTable,
  FleetEventType,
  VideoJobStatus,
  ProviderType,
  VideoQualityLevel,
  WorkerEventTable,
  WorkerMonitoringTable,
  WorkerStatus,
  WorkerTable,
} from "./schema.ts";
