import { z } from "zod";

export const publicPopularDiscussionSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["comment", "question"]),
  title: z.string().max(255).nullable(),
  snippet: z.string().max(500),
  courseTitle: z.string().min(1).max(255),
  lessonTitle: z.string().min(1).max(255),
  replyCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  engagementScore: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PublicPopularDiscussion = z.infer<
  typeof publicPopularDiscussionSchema
>;

export const publicPopularDiscussionsResponseSchema = z.strictObject({
  discussions: z.array(publicPopularDiscussionSchema),
});

export type PublicPopularDiscussionsResponse = z.infer<
  typeof publicPopularDiscussionsResponseSchema
>;
