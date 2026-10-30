import { z } from "zod";

// --- Media Assets ---
export const mediaAssetTypeSchema = z.enum(["image", "video", "document"]);
export const mediaAssetStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "processing",
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

export interface QualityProfile {
  name: VideoQualityLevel;
  width: number;
  height: number;
  videoBitrateKbps: number;
  maxBitrateKbps: number;
  bufferSizeKbps: number;
  audioBitrateKbps: number;
  fps: number;
  segmentDurationSeconds: number;
}

export const QUALITY_PROFILES: Readonly<
  Record<VideoQualityLevel, QualityProfile>
> = {
  "2160p": {
    name: "2160p",
    width: 3840,
    height: 2160,
    videoBitrateKbps: 14000,
    maxBitrateKbps: 16000,
    bufferSizeKbps: 28000,
    audioBitrateKbps: 192,
    fps: 60,
    segmentDurationSeconds: 2,
  },
  "1440p": {
    name: "1440p",
    width: 2560,
    height: 1440,
    videoBitrateKbps: 8000,
    maxBitrateKbps: 9500,
    bufferSizeKbps: 16000,
    audioBitrateKbps: 192,
    fps: 60,
    segmentDurationSeconds: 2,
  },
  "1080p": {
    name: "1080p",
    width: 1920,
    height: 1080,
    videoBitrateKbps: 4500,
    maxBitrateKbps: 5300,
    bufferSizeKbps: 9000,
    audioBitrateKbps: 128,
    fps: 30,
    segmentDurationSeconds: 2,
  },
  "720p": {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrateKbps: 2400,
    maxBitrateKbps: 2800,
    bufferSizeKbps: 4800,
    audioBitrateKbps: 128,
    fps: 30,
    segmentDurationSeconds: 2,
  },
  "480p": {
    name: "480p",
    width: 854,
    height: 480,
    videoBitrateKbps: 1200,
    maxBitrateKbps: 1400,
    bufferSizeKbps: 2400,
    audioBitrateKbps: 96,
    fps: 30,
    segmentDurationSeconds: 2,
  },
  "360p": {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrateKbps: 800,
    maxBitrateKbps: 950,
    bufferSizeKbps: 1600,
    audioBitrateKbps: 96,
    fps: 30,
    segmentDurationSeconds: 2,
  },
  "240p": {
    name: "240p",
    width: 426,
    height: 240,
    videoBitrateKbps: 400,
    maxBitrateKbps: 500,
    bufferSizeKbps: 800,
    audioBitrateKbps: 64,
    fps: 30,
    segmentDurationSeconds: 2,
  },
  "144p": {
    name: "144p",
    width: 256,
    height: 144,
    videoBitrateKbps: 150,
    maxBitrateKbps: 200,
    bufferSizeKbps: 300,
    audioBitrateKbps: 48,
    fps: 30,
    segmentDurationSeconds: 2,
  },
};

export const LAMBDA_ACTIONS = ["tick", "claim", "monitor", "queue"] as const;
export type LambdaAction = (typeof LAMBDA_ACTIONS)[number];
export const lambdaActionSchema = z.enum(LAMBDA_ACTIONS);

/**
 * Whether a file may be stored where anyone can open it by address. Public
 * files are served to every visitor under the platform's own media domain
 * with the content type given here, so only passive media belongs there: a
 * picture or a video. A page, a script, or an SVG (which can carry script)
 * would run as that domain's own content.
 */
function isPublishableMedia(
  type: z.infer<typeof mediaAssetTypeSchema>,
  contentType: string,
): boolean {
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (type === "image") {
    return /^image\/[a-z0-9.+-]+$/u.test(mimeType) && !mimeType.includes("svg");
  }
  if (type === "video") return /^video\/[a-z0-9.+-]+$/u.test(mimeType);
  return false;
}

export const presignMediaRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(255),
    fileSize: z.number().int().positive(),
    type: mediaAssetTypeSchema,
    visibility: z.enum(["public", "protected"]).default("protected"),
  })
  .refine((data) => data.fileSize <= MEDIA_MAX_SIZES[data.type], {
    message: "File size exceeds maximum allowed for this media type",
    path: ["fileSize"],
  })
  .refine(
    (data) =>
      data.visibility !== "public" ||
      isPublishableMedia(data.type, data.contentType),
    {
      message: "Only pictures and videos can be stored publicly",
      path: ["contentType"],
    },
  );

export const presignMediaResponseSchema = z.object({
  uploadUrl: z.url(),
  mediaAssetId: z.uuid(),
});

/**
 * Resumable video uploads are stored with S3/R2 multipart uploads. The part
 * size is chosen by the API so a client can slice the file identically on
 * every attempt, including after a reload.
 */
export const multipartUploadStartRequestSchema =
  presignMediaRequestSchema.refine((data) => data.type === "video", {
    message: "Multipart uploads are only available for videos",
    path: ["type"],
  });

export const multipartUploadStartResponseSchema = z.strictObject({
  mediaAssetId: z.uuid(),
  partSize: z.number().int().positive(),
  totalParts: z.number().int().positive(),
});

export const multipartUploadPartUrlsRequestSchema = z.strictObject({
  partNumbers: z
    .array(z.number().int().min(1).max(10_000))
    .min(1)
    .max(200)
    .refine((numbers) => new Set(numbers).size === numbers.length, {
      message: "Part numbers must be unique",
    }),
});

export const multipartUploadPartUrlSchema = z.strictObject({
  partNumber: z.number().int().positive(),
  url: z.url(),
});

export const multipartUploadPartUrlsResponseSchema = z.strictObject({
  parts: z.array(multipartUploadPartUrlSchema),
});

export const multipartUploadedPartSchema = z.strictObject({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const multipartUploadStatusResponseSchema = z.strictObject({
  partSize: z.number().int().positive(),
  totalParts: z.number().int().positive(),
  uploadedParts: z.array(multipartUploadedPartSchema),
});

export const multipartUploadCompleteRequestSchema = z.strictObject({});

export const multipartUploadAbortResponseSchema = z.strictObject({
  aborted: z.literal(true),
});

export const mediaUploadCompleteResponseSchema = z.strictObject({
  status: mediaAssetStatusSchema,
});

/**
 * Where a client can fetch a media asset it may see. `expiresAt` (epoch
 * seconds) is present when the URL carries a short-lived access token.
 */
export const mediaDeliveryResponseSchema = z.strictObject({
  url: z.string().min(1),
  expiresAt: z.number().int().positive().optional(),
});

export const mediaImageVariantManifestSchema = z.object({
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  variants: z.array(
    z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
});

export const videoJobProgressResponseSchema = z.object({
  status: videoJobStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  error: z.string().nullable().optional(),
  /** What is happening now, in words (YouTube imports report their stage). */
  stage: z.string().nullable().optional(),
  /** Set for a video being imported from YouTube rather than transcoded. */
  source: z.enum(["upload", "youtube"]).optional(),
});

/** Where a video came from, e.g. the YouTube video it was imported from. */
export const mediaSourceSchema = z.strictObject({
  provider: z.literal("youtube"),
  /** The provider's id of the video (YouTube's 11-character id). */
  externalId: z.string(),
  url: z.url(),
  /** As the provider showed them at import time. */
  title: z.string().nullable(),
  channel: z.string().nullable(),
});

/** A video's source; null for an uploaded file or one not known. */
export const mediaSourceResponseSchema = z.strictObject({
  source: mediaSourceSchema.nullable(),
});

/** Whether a transcode was (re)queued. Internal job ids stay server-side. */
export const videoTranscodeRetryResponseSchema = z.strictObject({
  queued: z.boolean(),
});

export const videoTranscodeCancelResponseSchema = z.strictObject({
  cancelled: z.literal(true),
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

/**
 * Asks the transcoding fleet to capture one frame per chapter start. The
 * fleet writes `<destinationPrefix><startSeconds>.webp` for every entry in
 * `times` and reports completion through the MediaConvert webhook.
 */
export const chapterThumbnailCaptureSchema = z.strictObject({
  times: z.array(z.number().int().nonnegative()).min(1),
  destinationPrefix: z.string().min(1),
  masterPlaylistKey: z.string().min(1).optional(),
});
export type ChapterThumbnailCapture = z.infer<
  typeof chapterThumbnailCaptureSchema
>;

export const videoJobEventSchema = z.looseObject({
  action: lambdaActionSchema.optional(),
  status: videoJobStatusSchema.optional(),
  jobId: z.uuid().optional(),
  /**
   * The transcoding provider's own job id (e.g. the AWS MediaConvert job
   * id), captured at dispatch. Cancellation must address the provider by
   * THIS id — `jobId` is VeoLMS's internal uuid, which the provider has
   * never heard of.
   */
  providerJobId: z.string().min(1).optional(),
  videoId: z.uuid().optional(),
  videoKey: z.string().min(1).optional(),
  outputPrefix: z.string().min(1).optional(),
  qualities: z.array(videoQualityLevelSchema).min(1).optional(),
  videoSize: z.coerce.number().int().nonnegative().optional(),
  videoMetadata: videoMetadataSchema.optional(),
  deleteFiles: z.boolean().optional(),
  deleteMedia: z.boolean().optional(),
  thumbnailDestination: z.string().optional(),
  chapterThumbnails: chapterThumbnailCaptureSchema.optional(),
});

export const lambdaResponseSchema = z.object({
  statusCode: z.number().int(),
  body: z.string(),
});

export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>;
export type MediaAssetStatus = z.infer<typeof mediaAssetStatusSchema>;
export type PresignMediaRequest = z.infer<typeof presignMediaRequestSchema>;
/**
 * Where a learner can download one lesson resource. The URL is short-lived
 * and answers with an attachment disposition, so following it saves the file
 * under its own name rather than opening it.
 */
export const lessonResourceDownloadResponseSchema = z.strictObject({
  url: z.string().min(1),
});

export type PresignMediaResponse = z.infer<typeof presignMediaResponseSchema>;
export type MultipartUploadStartRequest = z.infer<
  typeof multipartUploadStartRequestSchema
>;
export type MultipartUploadStartResponse = z.infer<
  typeof multipartUploadStartResponseSchema
>;
export type MultipartUploadPartUrlsRequest = z.infer<
  typeof multipartUploadPartUrlsRequestSchema
>;
export type MultipartUploadPartUrl = z.infer<
  typeof multipartUploadPartUrlSchema
>;
export type MultipartUploadPartUrlsResponse = z.infer<
  typeof multipartUploadPartUrlsResponseSchema
>;
export type MultipartUploadedPart = z.infer<typeof multipartUploadedPartSchema>;
export type MultipartUploadStatusResponse = z.infer<
  typeof multipartUploadStatusResponseSchema
>;
export type MultipartUploadAbortResponse = z.infer<
  typeof multipartUploadAbortResponseSchema
>;
export type MediaUploadCompleteResponse = z.infer<
  typeof mediaUploadCompleteResponseSchema
>;
export type MediaDeliveryResponse = z.infer<typeof mediaDeliveryResponseSchema>;
export type LessonResourceDownloadResponse = z.infer<
  typeof lessonResourceDownloadResponseSchema
>;
export type MediaImageVariantManifest = z.infer<
  typeof mediaImageVariantManifestSchema
>;
export type VideoJobProgressResponse = z.infer<
  typeof videoJobProgressResponseSchema
>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type MediaSourceResponse = z.infer<typeof mediaSourceResponseSchema>;
export type VideoTranscodeRetryResponse = z.infer<
  typeof videoTranscodeRetryResponseSchema
>;
export type VideoTranscodeCancelResponse = z.infer<
  typeof videoTranscodeCancelResponseSchema
>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type VideoJobEvent = z.infer<typeof videoJobEventSchema>;
export type LambdaResponse = z.infer<typeof lambdaResponseSchema>;

// Register schemas for OpenAPI documentation
z.globalRegistry.add(presignMediaResponseSchema, {
  id: "PresignMediaResponse",
});
z.globalRegistry.add(mediaUploadCompleteResponseSchema, {
  id: "MediaUploadCompleteResponse",
});
z.globalRegistry.add(mediaDeliveryResponseSchema, {
  id: "MediaDeliveryResponse",
});
z.globalRegistry.add(lessonResourceDownloadResponseSchema, {
  id: "LessonResourceDownloadResponse",
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
