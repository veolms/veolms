import { z } from "zod";

export const attachmentKindSchema = z.enum([
  "image",
  "screenshot",
  "code",
  "document",
]);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export const attachmentTargetTypeSchema = z.enum(["thread", "reply"]);
export type AttachmentTargetType = z.infer<typeof attachmentTargetTypeSchema>;

export const attachmentStatusSchema = z.enum([
  "uploading",
  "ready",
  "rejected",
  "deleted",
]);
export type AttachmentStatus = z.infer<typeof attachmentStatusSchema>;

export const learningAttachmentSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  targetType: attachmentTargetTypeSchema.nullable().optional(),
  targetId: z.uuid().nullable().optional(),
  kind: attachmentKindSchema,
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  status: attachmentStatusSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type LearningAttachment = z.infer<typeof learningAttachmentSchema>;

export const initiateAttachmentUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  fileSize: z.number().int().positive().max(50_000_000),
  kind: attachmentKindSchema.optional(),
});
export type InitiateAttachmentUploadRequest = z.infer<
  typeof initiateAttachmentUploadRequestSchema
>;

export const initiateAttachmentUploadResponseSchema = z.object({
  attachmentId: z.uuid(),
  uploadUrl: z.string().min(1),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  kind: attachmentKindSchema,
  maxSize: z.number().int().positive(),
});
export type InitiateAttachmentUploadResponse = z.infer<
  typeof initiateAttachmentUploadResponseSchema
>;

export const completeAttachmentUploadRequestSchema = z.object({
  attachmentId: z.uuid(),
});
export type CompleteAttachmentUploadRequest = z.infer<
  typeof completeAttachmentUploadRequestSchema
>;

export const learningUploadResponseSchema = z.object({
  id: z.uuid(),
  url: z.string().min(1),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  kind: attachmentKindSchema,
  mediaType: z.enum(["image", "video", "code", "document"]),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  status: attachmentStatusSchema,
});
export type LearningUploadResponse = z.infer<
  typeof learningUploadResponseSchema
>;

export const createLinkPreviewRequestSchema = z.object({
  url: z.string().url(),
});
export type CreateLinkPreviewRequest = z.infer<
  typeof createLinkPreviewRequestSchema
>;

export const linkPreviewResponseSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
export type LinkPreviewResponse = z.infer<typeof linkPreviewResponseSchema>;
