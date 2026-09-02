import { z } from "zod";
import {
  interactionStatusSchema,
  learningAuthorSchema,
  learningThreadAttachmentSummarySchema,
} from "./threads.ts";

export const learningRepliedToSummarySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  textSnippet: z.string().optional(),
});
export type LearningRepliedToSummary = z.infer<
  typeof learningRepliedToSummarySchema
>;

export const learningReplySchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  parentReplyId: z.uuid().nullable().optional(),
  replyToReplyId: z.uuid().nullable().optional(),
  replyToUserId: z.uuid().nullable().optional(),
  repliedTo: learningRepliedToSummarySchema.nullable().optional(),
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
  parentReplyId: z.uuid().nullable().optional(),
  replyToReplyId: z.uuid().nullable().optional(),
  replyToUserId: z.uuid().nullable().optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  attachmentIds: z.array(z.uuid()).optional(),
});
export type CreateLearningReplyRequest = z.infer<
  typeof createLearningReplyRequestSchema
>;

export const updateLearningReplyRequestSchema = z.object({
  content: z.string().min(1).max(20000).optional(),
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

export const acceptReplyRequestSchema = z.object({
  accepted: z.boolean().default(true),
});
export type AcceptReplyRequest = z.infer<typeof acceptReplyRequestSchema>;

export const acceptReplyResponseSchema = z.object({
  replyId: z.uuid(),
  threadId: z.uuid(),
  isAccepted: z.boolean(),
  acceptedAnswerId: z.uuid().nullable(),
});
export type AcceptReplyResponse = z.infer<typeof acceptReplyResponseSchema>;
