import { z } from "zod";

export const attachmentKindSchema = z.enum([
  "image",
  "screenshot",
  "code",
  "link",
  "document",
]);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export const attachmentTargetTypeSchema = z.enum(["thread", "reply", "note"]);
export type AttachmentTargetType = z.infer<typeof attachmentTargetTypeSchema>;

export const learningAttachmentSchema = z.object({
  id: z.uuid(),
  targetType: attachmentTargetTypeSchema.nullable().optional(),
  targetId: z.uuid().nullable().optional(),
  kind: attachmentKindSchema,
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type LearningAttachment = z.infer<typeof learningAttachmentSchema>;

export const learningUploadResponseSchema = z.object({
  id: z.uuid(),
  url: z.string().min(1),
  fileName: z.string().min(1),
  kind: attachmentKindSchema,
  mediaType: z.enum(["image", "video", "code", "document", "link"]),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
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
