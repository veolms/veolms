import { z } from "zod";
import { discussionVisibilitySchema } from "./threads.ts";

export const learningNoteSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().min(1),
  lessonId: z.uuid(),
  lessonTitle: z.string().min(1),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000),
  tags: z.array(z.string().max(50)).default([]),
  visibility: discussionVisibilitySchema.default("private"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningNote = z.infer<typeof learningNoteSchema>;

export const createLearningNoteRequestSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(20000),
  plainText: z.string().max(20000).optional(),
  tags: z.array(z.string().max(50)).optional(),
  visibility: discussionVisibilitySchema.default("private"),
});
export type CreateLearningNoteRequest = z.infer<
  typeof createLearningNoteRequestSchema
>;

export const updateLearningNoteRequestSchema = z.object({
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(20000).optional(),
  plainText: z.string().max(20000).optional(),
  tags: z.array(z.string().max(50)).optional(),
  visibility: discussionVisibilitySchema.optional(),
});
export type UpdateLearningNoteRequest = z.infer<
  typeof updateLearningNoteRequestSchema
>;

export const listLearningNotesQuerySchema = z.object({
  courseId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  query: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
