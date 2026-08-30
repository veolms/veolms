import { z } from "zod";

export const engagementTargetTypeSchema = z.enum(["thread", "reply"]);
export type EngagementTargetType = z.infer<typeof engagementTargetTypeSchema>;

export const toggleLikeRequestSchema = z.object({
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
});
export type ToggleLikeRequest = z.infer<typeof toggleLikeRequestSchema>;

export const toggleLikeResponseSchema = z.object({
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
  liked: z.boolean(),
  likesCount: z.number().int().nonnegative(),
});
export type ToggleLikeResponse = z.infer<typeof toggleLikeResponseSchema>;

export const toggleBookmarkResponseSchema = z.object({
  threadId: z.uuid(),
  bookmarked: z.boolean(),
});
export type ToggleBookmarkResponse = z.infer<
  typeof toggleBookmarkResponseSchema
>;

export const toggleFollowResponseSchema = z.object({
  threadId: z.uuid(),
  following: z.boolean(),
});
export type ToggleFollowResponse = z.infer<typeof toggleFollowResponseSchema>;

export const acceptAnswerRequestSchema = z.object({
  replyId: z.uuid().nullable(),
});
export type AcceptAnswerRequest = z.infer<typeof acceptAnswerRequestSchema>;

export const acceptAnswerResponseSchema = z.object({
  threadId: z.uuid(),
  acceptedAnswerId: z.uuid().nullable(),
});
export type AcceptAnswerResponse = z.infer<typeof acceptAnswerResponseSchema>;

export const lockThreadRequestSchema = z.object({
  isLocked: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type LockThreadRequest = z.infer<typeof lockThreadRequestSchema>;

export const lockThreadResponseSchema = z.object({
  threadId: z.uuid(),
  isLocked: z.boolean(),
});
export type LockThreadResponse = z.infer<typeof lockThreadResponseSchema>;

export const userMentionSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().nullable().optional(),
});
export type UserMention = z.infer<typeof userMentionSchema>;

export const searchMentionsQuerySchema = z.object({
  query: z.string().max(80).default(""),
  courseId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type SearchMentionsQuery = z.infer<typeof searchMentionsQuerySchema>;

export const searchMentionsResponseSchema = z.object({
  users: z.array(userMentionSchema),
});
export type SearchMentionsResponse = z.infer<
  typeof searchMentionsResponseSchema
>;
