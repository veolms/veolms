import { z } from "zod";

// --- Media Assets ---
export const mediaAssetTypeSchema = z.enum(["image", "video", "document"]);
export const mediaAssetStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "ready",
  "failed",
]);

export const MEDIA_MAX_SIZES = {
  image: 10 * 1024 * 1024, // 10MB
  video: 5 * 1024 * 1024 * 1024, // 5GB
  document: 100 * 1024 * 1024, // 100MB
} as const;

// --- Video Jobs & Transcoding ---
export const VIDEO_JOB_STATUSES = [
  "queued",
  "provisioning",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export const JOB_STATUSES = VIDEO_JOB_STATUSES;
export type VideoJobStatus = (typeof VIDEO_JOB_STATUSES)[number];
export const videoJobStatusSchema = z.enum(VIDEO_JOB_STATUSES);

export const VIDEO_QUALITY_LEVELS = [
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
  "240p",
  "144p",
] as const;
export type VideoQualityLevel = (typeof VIDEO_QUALITY_LEVELS)[number];
export const videoQualityLevelSchema = z.enum(VIDEO_QUALITY_LEVELS);

// --- Hardware Sizing Profiles ---
export const HARDWARE_PROFILES = [
  "nano",
  "micro",
  "small",
  "medium",
  "large",
] as const;
export type HardwareProfile = (typeof HARDWARE_PROFILES)[number];
export const hardwareProfileSchema = z.enum(HARDWARE_PROFILES);

// --- Fleet Workers & Providers ---
export const WORKER_STATUSES = [
  "pending",
  "provisioning",
  "starting",
  "ready",
  "processing",
  "completed",
  "failed",
  "terminating",
  "terminated",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export const workerStatusSchema = z.enum(WORKER_STATUSES);

export const ARCHITECTURES = ["arm64", "x86_64"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];
export const architectureSchema = z.enum(ARCHITECTURES);

export const PROVIDER_TYPES = ["local", "docker", "aws"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
export const providerTypeSchema = z.enum(PROVIDER_TYPES);

export const FLEET_EVENT_TYPES = [
  "worker_created",
  "worker_provisioning",
  "worker_ready",
  "job_assigned",
  "job_started",
  "progress_updated",
  "heartbeat_recorded",
  "heartbeat_timeout",
  "job_completed",
  "job_failed",
  "worker_termination_requested",
  "worker_terminated",
  "worker_error",
  "spot_interrupted",
  "orphan_instance_terminated",
  "job_output_verified",
  "job_output_verification_failed",
  "test_fault_requested",
  "test_fault_applied",
] as const;
export type FleetEventType = (typeof FLEET_EVENT_TYPES)[number];
export const fleetEventTypeSchema = z.enum(FLEET_EVENT_TYPES);

export const LAMBDA_ACTIONS = ["tick", "claim", "monitor", "queue"] as const;
export type LambdaAction = (typeof LAMBDA_ACTIONS)[number];
export const lambdaActionSchema = z.enum(LAMBDA_ACTIONS);

export const mediaAssetSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  type: mediaAssetTypeSchema,
  storageProvider: z.string(),
  storageKey: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.coerce.number().int().nonnegative(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  status: mediaAssetStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const presignMediaRequestSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.string().min(1),
    fileSize: z.number().int().positive(),
    type: mediaAssetTypeSchema,
  })
  .refine((data) => data.fileSize <= MEDIA_MAX_SIZES[data.type], {
    message: "File size exceeds maximum allowed for this media type",
    path: ["fileSize"],
  });

export const presignMediaResponseSchema = z.object({
  uploadUrl: z.url(),
  mediaAssetId: z.uuid(),
});

export const videoJobProgressResponseSchema = z.object({
  status: videoJobStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  error: z.string().nullable().optional(),
});

export const videoMetadataSchema = z.looseObject({
  durationSeconds: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bitrate: z.number().nonnegative().optional(),
  format: z.string().optional(),
  codec: z.string().optional(),
  fps: z.number().positive().optional(),
  pixelFormat: z.string().optional(),
  bitDepth: z.number().int().positive().optional(),
  rawStreams: z.array(z.record(z.string(), z.unknown())).optional(),
});

// The subset of VideoMetadata worth persisting alongside a job row for
// machine-profile sizing: excludes `rawStreams`, which is ffprobe's raw
// per-stream JSON dump (can be tens of KB) and is never read back by any
// consumer — persisting it would only bloat the jsonb column.
export const persistedVideoMetadataSchema = videoMetadataSchema.omit({
  rawStreams: true,
});
export type PersistedVideoMetadata = z.infer<
  typeof persistedVideoMetadataSchema
>;

export const videoJobEventSchema = z.looseObject({
  action: lambdaActionSchema.optional(),
  jobId: z.uuid().optional(),
  videoId: z.uuid().optional(),
  videoKey: z.string().min(1).optional(),
  outputPrefix: z.string().min(1).optional(),
  qualities: z.array(videoQualityLevelSchema).min(1).optional(),
  videoSize: z.coerce.number().int().nonnegative().optional(),
  videoMetadata: videoMetadataSchema.optional(),
});

export const lambdaResponseSchema = z.object({
  statusCode: z.number().int(),
  body: z.string(),
});

export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>;
export type MediaAssetStatus = z.infer<typeof mediaAssetStatusSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type PresignMediaRequest = z.infer<typeof presignMediaRequestSchema>;
export type PresignMediaResponse = z.infer<typeof presignMediaResponseSchema>;
export type VideoJobProgressResponse = z.infer<
  typeof videoJobProgressResponseSchema
>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type VideoJobEvent = z.infer<typeof videoJobEventSchema>;
export type LambdaResponse = z.infer<typeof lambdaResponseSchema>;

// Register schemas for OpenAPI documentation
z.globalRegistry.add(mediaAssetSchema, { id: "MediaAsset" });
z.globalRegistry.add(presignMediaResponseSchema, {
  id: "PresignMediaResponse",
});
z.globalRegistry.add(videoJobProgressResponseSchema, {
  id: "VideoJobProgressResponse",
});
z.globalRegistry.add(videoMetadataSchema, {
  id: "VideoMetadata",
});
z.globalRegistry.add(videoJobEventSchema, {
  id: "VideoJobEvent",
});
z.globalRegistry.add(hardwareProfileSchema, {
  id: "HardwareProfile",
});
