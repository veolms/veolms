import { z } from "zod";
import { discussionVisibilitySchema } from "./threads.ts";

export const learningNoteSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().optional(),
  sectionId: z.uuid().optional(),
  sectionTitle: z.string().optional(),
  sectionPosition: z.number().int().optional(),
  lessonId: z.uuid(),
  lessonTitle: z.string().optional(),
  lessonPosition: z.number().int().optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(50000),
  plainText: z.string().max(50000),
  visibility: discussionVisibilitySchema.default("private"),
  tags: z.array(z.string().min(1).max(50)).default([]),
  likesCount: z.number().int().nonnegative().default(0).optional(),
  repliesCount: z.number().int().nonnegative().default(0).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningNote = z.infer<typeof learningNoteSchema>;

export const createLearningNoteRequestSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(50000),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema.default("private").optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});
export type CreateLearningNoteRequest = z.infer<
  typeof createLearningNoteRequestSchema
>;

export const updateLearningNoteRequestSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(50000).optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  visibility: discussionVisibilitySchema.optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});
export type UpdateLearningNoteRequest = z.infer<
  typeof updateLearningNoteRequestSchema
>;

export const listLearningNotesQuerySchema = z.object({
  courseId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  visibility: discussionVisibilitySchema.optional(),
  query: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListLearningNotesQuery = z.infer<
  typeof listLearningNotesQuerySchema
>;

export const learningNotesListResponseSchema = z.object({
  notes: z.array(learningNoteSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
});
export type LearningNotesListResponse = z.infer<
  typeof learningNotesListResponseSchema
>;

export const lessonNotesOverviewItemSchema = z.object({
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  lessonPosition: z.number().int(),
  notesCount: z.number().int().nonnegative(),
  notes: z.array(learningNoteSchema),
});
export type LessonNotesOverviewItem = z.infer<
  typeof lessonNotesOverviewItemSchema
>;

export const sectionNotesOverviewItemSchema = z.object({
  sectionId: z.uuid(),
  sectionTitle: z.string(),
  sectionPosition: z.number().int(),
  notesCount: z.number().int().nonnegative(),
  lessons: z.array(lessonNotesOverviewItemSchema),
});
export type SectionNotesOverviewItem = z.infer<
  typeof sectionNotesOverviewItemSchema
>;

export const courseNotesOverviewResponseSchema = z.object({
  courseId: z.uuid(),
  courseTitle: z.string(),
  totalNotesCount: z.number().int().nonnegative(),
  sections: z.array(sectionNotesOverviewItemSchema),
});
export type CourseNotesOverviewResponse = z.infer<
  typeof courseNotesOverviewResponseSchema
>;
