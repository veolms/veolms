import { z } from "zod";

export const mediaConvertOutputDetailSchema = z.object({
  durationInMs: z.number().optional(),
  videoDetails: z
    .object({
      widthInPx: z.number().optional(),
      heightInPx: z.number().optional(),
    })
    .optional(),
});
export type MediaConvertOutputDetail = z.infer<
  typeof mediaConvertOutputDetailSchema
>;

export const mediaConvertOutputGroupDetailSchema = z.object({
  type: z.string().optional(),
  playlistFilePaths: z.array(z.string()).optional(),
  outputDetails: z.array(mediaConvertOutputDetailSchema).optional(),
});
export type MediaConvertOutputGroupDetail = z.infer<
  typeof mediaConvertOutputGroupDetailSchema
>;

export const mediaConvertUserMetadataSchema = z
  .object({
    jobId: z.string().optional(),
    videoId: z.string().optional(),
    sourceKey: z.string().optional(),
    outputPrefix: z.string().optional(),
    webhookUrl: z.string().optional(),
    webhookSecret: z.string().optional(),
  })
  .catchall(z.string());
export type MediaConvertUserMetadata = z.infer<
  typeof mediaConvertUserMetadataSchema
>;

export const mediaConvertEventDetailSchema = z.object({
  timestamp: z.number().optional(),
  accountId: z.string().optional(),
  queue: z.string().optional(),
  jobId: z.string().optional(),
  videoId: z.string().optional(),
  status: z.string(),
  userMetadata: mediaConvertUserMetadataSchema.optional(),
  outputGroupDetails: z.array(mediaConvertOutputGroupDetailSchema).optional(),
  errorMessage: z.string().optional(),
  errorCode: z.number().optional(),
  jobPercentComplete: z.number().optional(),
});
export type MediaConvertEventDetail = z.infer<
  typeof mediaConvertEventDetailSchema
>;

export const mediaConvertWebhookPayloadSchema = z.object({
  version: z.string().optional(),
  id: z.string().optional(),
  "detail-type": z.string().optional(),
  source: z.string().optional(),
  account: z.string().optional(),
  time: z.string().optional(),
  region: z.string().optional(),
  resources: z.array(z.string()).optional(),
  detail: mediaConvertEventDetailSchema.optional(),

  // Direct payload fallback
  status: z.string().optional(),
  jobId: z.string().optional(),
  videoId: z.string().optional(),
  progressPercent: z.number().optional(),
  jobPercentComplete: z.number().optional(),
  errorMessage: z.string().optional(),
  masterPlaylistPath: z.string().optional(),
  durationSeconds: z.number().optional(),
  outputGroupDetails: z.array(mediaConvertOutputGroupDetailSchema).optional(),
  userMetadata: mediaConvertUserMetadataSchema.optional(),
});
export type MediaConvertWebhookPayload = z.infer<
  typeof mediaConvertWebhookPayloadSchema
>;

export const mediaConvertWebhookResponseSchema = z.object({
  success: z.boolean(),
  status: z.string(),
  jobId: z.string().optional(),
});
export type MediaConvertWebhookResponse = z.infer<
  typeof mediaConvertWebhookResponseSchema
>;
