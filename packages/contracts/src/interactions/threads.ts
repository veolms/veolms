import { z } from "zod";

export const discussionEntryKindSchema = z.enum(["comment", "question"]);
export type DiscussionEntryKind = z.infer<typeof discussionEntryKindSchema>;

export const discussionVisibilitySchema = z.enum(["public", "unlisted"]);
export type DiscussionVisibility = z.infer<typeof discussionVisibilitySchema>;

export const interactionStatusSchema = z.enum(["active", "hidden", "deleted"]);
export type InteractionStatus = z.infer<typeof interactionStatusSchema>;

export const threadSortSchema = z.enum(["latest", "activity", "replies", "popular"]);
export type ThreadSort = z.infer<typeof threadSortSchema>;

export const questionFilterStatusSchema = z.enum(["all", "answered", "mentioned", "solved", "open"]);
export type QuestionFilterStatus = z.infer<typeof questionFilterStatusSchema>;

export const learningAuthorSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
  username: z.string().min(1).max(80),
  avatarUrl: z.string().nullable().optional(),
  role: z.enum(["Student", "Instructor", "Admin"]).default("Student"),
});
export type LearningAuthor = z.infer<typeof learningAuthorSchema>;

export const learningThreadAttachmentSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["image", "screenshot", "code", "document"]),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type LearningThreadAttachmentSummary = z.infer<
  typeof learningThreadAttachmentSummarySchema
>;

export const learningThreadSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  courseId: z.uuid(),
  lessonId: z.uuid().nullable().optional(),
  assignmentId: z.uuid().nullable().optional(),
  userId: z.uuid(),
  author: learningAuthorSchema,
  kind: discussionEntryKindSchema,
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema,
  status: interactionStatusSchema,
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

export const createLearningThreadRequestSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid().optional(),
  assignmentId: z.uuid().optional(),
  kind: discussionEntryKindSchema.default("comment"),
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(20000),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema.default("public"),
  attachmentIds: z.array(z.uuid()).optional(),
}).refine(
  (data) => (data.lessonId && !data.assignmentId) || (!data.lessonId && data.assignmentId) || (!data.lessonId && !data.assignmentId),
  { message: "Specify either lessonId or assignmentId, not both." },
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
  kind: z.enum(["all", "comment", "question"]).default("all"),
  courseId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  assignmentId: z.uuid().optional(),
  search: z.string().max(200).optional(),
  status: questionFilterStatusSchema.default("all"),
  visibility: discussionVisibilitySchema.optional(),
  sort: threadSortSchema.default("latest"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLearningThreadsQuery = z.infer<
  typeof listLearningThreadsQuerySchema
>;

export const learningThreadsListResponseSchema = z.object({
  threads: z.array(learningThreadSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
});
export type LearningThreadsListResponse = z.infer<
  typeof learningThreadsListResponseSchema
>;
