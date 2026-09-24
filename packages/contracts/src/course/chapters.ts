import { z } from "zod";

export const lessonChapterSchema = z.strictObject({
  id: z.uuid(),
  lessonId: z.uuid(),
  title: z.string(),
  startSeconds: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LessonChapter = z.infer<typeof lessonChapterSchema>;

export const createLessonChapterRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  startSeconds: z.number().int().nonnegative(),
});
export type CreateLessonChapterRequest = z.infer<
  typeof createLessonChapterRequestSchema
>;

export const updateLessonChapterRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(255).optional(),
    startSeconds: z.number().int().nonnegative().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.startSeconds !== undefined,
    {
      message: "At least one chapter field must be provided.",
    },
  );
export type UpdateLessonChapterRequest = z.infer<
  typeof updateLessonChapterRequestSchema
>;

export const lessonChaptersListResponseSchema = z.strictObject({
  items: z.array(lessonChapterSchema),
});
