import { z } from "zod";

export const discussionEntryKindSchema = z.enum([
  "comment",
  "question",
  "note",
  "qna",
]);
export type DiscussionEntryKind = z.infer<typeof discussionEntryKindSchema>;

export const discussionVisibilitySchema = z.enum([
  "public",
  "unlisted",
  "private",
]);
export type DiscussionVisibility = z.infer<typeof discussionVisibilitySchema>;

export const interactionStatusSchema = z.enum(["active", "hidden", "deleted"]);
export type InteractionStatus = z.infer<typeof interactionStatusSchema>;

export const threadSortSchema = z.enum([
  "latest",
  "recent",
  "activity",
  "replies",
  "popular",
  "highest_engagement",
  "me",
]);
export type ThreadSort = z.infer<typeof threadSortSchema>;

export const discussionTabSchema = z.enum([
  "all",
  "q-and-a",
  "comments",
  "notes",
  "mentions",
  "following",
  "saved",
]);
export type DiscussionTab = z.infer<typeof discussionTabSchema>;

export const questionFilterStatusSchema = z.enum([
  "all",
  "answered",
  "mentioned",
  "solved",
  "open",
]);
export type QuestionFilterStatus = z.infer<typeof questionFilterStatusSchema>;

export const learningAuthorSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
  username: z.string().min(1).max(80),
  avatarUrl: z.string().nullable().optional(),
  role: z.enum(["Student", "Instructor", "Admin"]).default("Student"),
});
export type LearningAuthor = z.infer<typeof learningAuthorSchema>;

/**
 * The author shown on a thread or reply. It carries no user id: a caller only
 * needs to know whether a post is its own, which `isOwn` answers. The
 * username is null when the account behind the post is no longer active.
 */
export const discussionAuthorSchema = z.object({
  displayName: z.string().min(1).max(120),
  username: z.string().min(1).max(80).nullable(),
  avatarUrl: z.string().nullable().optional(),
  role: z.enum(["Student", "Instructor", "Admin"]).default("Student"),
});
export type DiscussionAuthor = z.infer<typeof discussionAuthorSchema>;

/** The author of a workspace feed item, which shows no role badge. */
export const workspaceDiscussionAuthorSchema = discussionAuthorSchema.omit({
  role: true,
});
export type WorkspaceDiscussionAuthor = z.infer<
  typeof workspaceDiscussionAuthorSchema
>;

export const learningThreadAttachmentSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "screenshot", "code", "document"]),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});
export type LearningThreadAttachmentSummary = z.infer<
  typeof learningThreadAttachmentSummarySchema
>;

export const discussionAttachmentSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  hasImages: z.boolean(),
  hasVideos: z.boolean(),
  hasFiles: z.boolean(),
});
export type DiscussionAttachmentSummary = z.infer<
  typeof discussionAttachmentSummarySchema
>;

export const learningThreadSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  lessonId: z.uuid().nullable().optional(),
  author: discussionAuthorSchema,
  kind: discussionEntryKindSchema,
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema,
  isLocked: z.boolean().default(false),
  acceptedAnswerId: z.uuid().nullable().optional(),
  likesCount: z.number().int().nonnegative().default(0),
  repliesCount: z.number().int().nonnegative().default(0),
  attachments: z.array(learningThreadAttachmentSummarySchema).optional(),
  isLiked: z.boolean().optional(),
  isBookmarked: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
  isOwn: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningThread = z.infer<typeof learningThreadSchema>;

/** What an edit returns: the fields an edit can change, and nothing else. */
export const learningThreadEditResponseSchema = z.object({
  id: z.uuid(),
  title: z.string().max(255).nullable(),
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000),
  timestampSeconds: z.number().int().nonnegative().nullable(),
  visibility: discussionVisibilitySchema,
  updatedAt: z.string(),
});
export type LearningThreadEditResponse = z.infer<
  typeof learningThreadEditResponseSchema
>;

export const createLearningThreadRequestSchema = z
  .object({
    courseId: z.uuid(),
    lessonId: z.uuid().optional(),
    kind: discussionEntryKindSchema.default("comment"),
    title: z.string().max(255).optional(),
    content: z.string().min(1).max(20000),
    timestampSeconds: z.number().int().nonnegative().nullable().optional(),
    visibility: discussionVisibilitySchema.default("public"),
    attachmentIds: z.array(z.uuid()).optional(),
  })
  .refine(
    (data) => {
      const normalized = data.kind === "qna" ? "question" : data.kind;
      if (normalized === "comment" || normalized === "question") {
        return data.visibility === "public" || data.visibility === "unlisted";
      }
      return true;
    },
    {
      message:
        "Comments and Q&A can only be 'public' or 'unlisted'. Notes can be 'public', 'unlisted', or 'private'.",
    },
  );
export type CreateLearningThreadRequest = z.infer<
  typeof createLearningThreadRequestSchema
>;

export const updateLearningThreadRequestSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20000).optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema.optional(),
});
export type UpdateLearningThreadRequest = z.infer<
  typeof updateLearningThreadRequestSchema
>;

export const listLearningThreadsQuerySchema = z.object({
  kind: z.enum(["all", "comment", "question", "note", "qna"]).default("all"),
  tab: discussionTabSchema.optional(),
  courseId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  search: z.string().max(200).optional(),
  status: questionFilterStatusSchema.default("all"),
  visibility: discussionVisibilitySchema.optional(),
  sort: threadSortSchema.default("latest"),
  mine: z.stringbool().optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLearningThreadsQuery = z.infer<
  typeof listLearningThreadsQuerySchema
>;

export const learningThreadsListResponseSchema = z.object({
  threads: z.array(learningThreadSchema),
  nextCursor: z.string().nullable(),
});
export type LearningThreadsListResponse = z.infer<
  typeof learningThreadsListResponseSchema
>;

export const userDiscussionActivitySchema = z.object({
  questionsAsked: z.number().int().nonnegative(),
  repliesCount: z.number().int().nonnegative(),
  answersAccepted: z.number().int().nonnegative(),
  helpfulVotes: z.number().int().nonnegative(),
});
export type UserDiscussionActivity = z.infer<
  typeof userDiscussionActivitySchema
>;

export const userMentionNotificationSchema = z.object({
  id: z.uuid(),
  sourceType: z.enum(["thread", "reply"]),
  sourceId: z.uuid(),
  threadId: z.uuid(),
  threadTitle: z.string().nullable().optional(),
  courseId: z.uuid(),
  courseTitle: z.string().nullable().optional(),
  lessonId: z.uuid().nullable().optional(),
  lessonTitle: z.string().nullable().optional(),
  author: learningAuthorSchema,
  snippet: z.string(),
  createdAt: z.string(),
});
export type UserMentionNotification = z.infer<
  typeof userMentionNotificationSchema
>;

export const userMentionsListResponseSchema = z.object({
  mentions: z.array(userMentionNotificationSchema),
  totalCount: z.number().int().nonnegative().optional(),
});
export type UserMentionsListResponse = z.infer<
  typeof userMentionsListResponseSchema
>;

export const discussionsWorkspaceCourseOptionSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
});
export type DiscussionsWorkspaceCourseOption = z.infer<
  typeof discussionsWorkspaceCourseOptionSchema
>;

export const workspaceDiscussionItemSchema = z.object({
  id: z.uuid(),
  itemType: z.enum(["thread", "note", "reply"]),
  kind: discussionEntryKindSchema,
  title: z.string().nullable().optional(),
  parentThreadId: z.uuid().nullable().optional(),
  parentThreadTitle: z.string().nullable().optional(),
  content: z.string(),
  plainText: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string().nullable().optional(),
  lessonId: z.uuid().nullable().optional(),
  lessonTitle: z.string().nullable().optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  author: workspaceDiscussionAuthorSchema,
  status: questionFilterStatusSchema.optional(),
  visibility: discussionVisibilitySchema.optional(),
  isLocked: z.boolean().optional(),
  repliesCount: z.number().int().nonnegative().default(0),
  likesCount: z.number().int().nonnegative().default(0),
  isBookmarked: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
  isOwn: z.boolean().optional(),
  mentionedAt: z.string().optional(),
  attachmentSummary: discussionAttachmentSummarySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  // Present for bookmark workspace items; omitted by existing tabs.
  bookmarkedAt: z.string().optional(),
});
export type WorkspaceDiscussionItem = z.infer<
  typeof workspaceDiscussionItemSchema
>;

export const discussionsWorkspaceResponseSchema = z.object({
  items: z.array(workspaceDiscussionItemSchema),
  /** The course filter options. Sent with the first page only. */
  courses: z.array(discussionsWorkspaceCourseOptionSchema),
  nextCursor: z.string().nullable(),
});
export type DiscussionsWorkspaceResponse = z.infer<
  typeof discussionsWorkspaceResponseSchema
>;
