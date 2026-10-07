import { z } from "zod";

import { avatarImageVariantSchema } from "../auth/user.ts";

const publicDiscussionAuthorSchema = z.strictObject({
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().max(3_000).nullable(),
  avatarSrcSet: z.array(avatarImageVariantSchema).default([]),
});

export const publicPopularDiscussionSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["comment", "question"]),
  title: z.string().max(255).nullable(),
  snippet: z.string().max(500),
  author: publicDiscussionAuthorSchema,
  courseId: z.uuid(),
  lessonId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  lessonTitle: z.string().min(1).max(255),
  replyCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
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
