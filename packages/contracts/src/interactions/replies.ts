import { z } from "zod";
import {
  interactionStatusSchema,
  learningAuthorSchema,
  learningThreadAttachmentSummarySchema,
} from "./threads.ts";

export const learningReplySchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  parentReplyId: z.uuid().nullable().optional(),
  userId: z.uuid(),
  author: learningAuthorSchema,
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  isAccepted: z.boolean().default(false),
  status: interactionStatusSchema,
  likesCount: z.number().int().nonnegative().default(0),
  attachments: z.array(learningThreadAttachmentSummarySchema).optional(),
  isLiked: z.boolean().optional(),
  isOwn: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningReply = z.infer<typeof learningReplySchema>;

export const createLearningReplyRequestSchema = z.object({
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000).optional(),
  parentReplyId: z.uuid().nullable().optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  attachmentIds: z.array(z.uuid()).optional(),
});
export type CreateLearningReplyRequest = z.infer<
  typeof createLearningReplyRequestSchema
>;

export const updateLearningReplyRequestSchema = z.object({
  content: z.string().min(1).max(20000).optional(),
  plainText: z.string().max(20000).optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
});
export type UpdateLearningReplyRequest = z.infer<
  typeof updateLearningReplyRequestSchema
>;

export const listLearningRepliesQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListLearningRepliesQuery = z.infer<
  typeof listLearningRepliesQuerySchema
>;

export const learningRepliesListResponseSchema = z.object({
  replies: z.array(learningReplySchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
});
export type LearningRepliesListResponse = z.infer<
  typeof learningRepliesListResponseSchema
>;
