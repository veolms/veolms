import { z } from "zod";

export const learningNoteSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().optional(),
  lessonId: z.uuid(),
  lessonTitle: z.string().optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(50000),
  plainText: z.string().max(50000),
  tags: z.array(z.string().min(1).max(50)).default([]),
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
  tags: z.array(z.string().min(1).max(50)).optional(),
});
export type CreateLearningNoteRequest = z.infer<
  typeof createLearningNoteRequestSchema
>;

export const updateLearningNoteRequestSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  content: z.string().min(1).max(50000).optional(),
  timestampSeconds: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
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
