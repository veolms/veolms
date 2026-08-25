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
  status: z.enum(["queued", "processing", "completed", "failed"]),
  progressPercent: z.number().int().min(0).max(100),
  currentStage: z.enum([
    "queued",
    "downloading",
    "transcoding",
    "uploading",
    "finalizing",
    "completed",
    "failed",
  ]),
  error: z.string().nullable().optional(),
});

export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>;
export type MediaAssetStatus = z.infer<typeof mediaAssetStatusSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type PresignMediaRequest = z.infer<typeof presignMediaRequestSchema>;
export type PresignMediaResponse = z.infer<typeof presignMediaResponseSchema>;
export type VideoJobProgressResponse = z.infer<
  typeof videoJobProgressResponseSchema
>;

// Register schemas for OpenAPI documentation
z.globalRegistry.add(mediaAssetSchema, { id: "MediaAsset" });
z.globalRegistry.add(presignMediaResponseSchema, {
  id: "PresignMediaResponse",
});
z.globalRegistry.add(videoJobProgressResponseSchema, {
  id: "VideoJobProgressResponse",
});
