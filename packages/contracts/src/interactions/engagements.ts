import { z } from "zod";

export const engagementTargetTypeSchema = z.enum(["thread", "reply", "note"]);
export type EngagementTargetType = z.infer<typeof engagementTargetTypeSchema>;

export const toggleLikeRequestSchema = z.object({
  targetType: engagementTargetTypeSchema,
  targetId: z.uuid(),
});
export type ToggleLikeRequest = z.infer<typeof toggleLikeRequestSchema>;

export const toggleLikeResponseSchema = z.object({
  liked: z.boolean(),
});
export type ToggleLikeResponse = z.infer<typeof toggleLikeResponseSchema>;

export const toggleBookmarkResponseSchema = z.object({
  bookmarked: z.boolean(),
});
export type ToggleBookmarkResponse = z.infer<
  typeof toggleBookmarkResponseSchema
>;

export const toggleFollowResponseSchema = z.object({
  following: z.boolean(),
});
export type ToggleFollowResponse = z.infer<typeof toggleFollowResponseSchema>;

export const lockThreadRequestSchema = z.object({
  isLocked: z.boolean(),
});
export type LockThreadRequest = z.infer<typeof lockThreadRequestSchema>;

export const lockThreadResponseSchema = z.object({
  isLocked: z.boolean(),
});
export type LockThreadResponse = z.infer<typeof lockThreadResponseSchema>;

export const userAutocompleteItemSchema = z.object({
  username: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().nullable().optional(),
});
export type UserAutocompleteItem = z.infer<typeof userAutocompleteItemSchema>;

export const userAutocompleteQuerySchema = z.object({
  query: z.string().min(1).max(80).optional(),
  courseId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type UserAutocompleteQuery = z.infer<typeof userAutocompleteQuerySchema>;

export const userAutocompleteResponseSchema = z.object({
  users: z.array(userAutocompleteItemSchema),
});
export type UserAutocompleteResponse = z.infer<
  typeof userAutocompleteResponseSchema
>;

// Earlier names for the autocomplete contracts. Nothing in this repository
// uses them any more; they stay so an outside importer keeps compiling.
export const userMentionSchema = userAutocompleteItemSchema;
export type UserMention = UserAutocompleteItem;
export const searchMentionsQuerySchema = userAutocompleteQuerySchema;
export type SearchMentionsQuery = UserAutocompleteQuery;
export const searchMentionsResponseSchema = userAutocompleteResponseSchema;
export type SearchMentionsResponse = UserAutocompleteResponse;
