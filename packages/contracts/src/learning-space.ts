import { z } from "zod";

export const learningSpaceSessionOriginSchema = z.enum([
  "home",
  "courses",
  "wishlist",
]);

export const learningSpaceSessionSchema = z.strictObject({
  id: z.uuid(),
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  courseTitle: z.string().min(1).max(255),
  lessonId: z.uuid().nullable(),
  lessonNumber: z.number().int().positive().nullable(),
  lessonTitle: z.string().min(1).max(255).nullable(),
  origin: learningSpaceSessionOriginSchema,
  returnPath: z.string().min(1).max(1000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const learningSpaceSessionsResponseSchema = z.strictObject({
  sessions: z.array(learningSpaceSessionSchema),
});

export const learningSpaceSessionParamsSchema = z.strictObject({
  courseKey: z.string().trim().min(1).max(160),
});

export const upsertLearningSpaceSessionRequestSchema = z.strictObject({
  lessonKey: z.string().trim().min(1).max(160).nullable().optional(),
  origin: learningSpaceSessionOriginSchema.default("courses"),
  returnPath: z.string().trim().min(1).max(1000).optional(),
});

export const closeLearningSpaceSessionResponseSchema = z.strictObject({
  closed: z.literal(true),
});

export type LearningSpaceSessionOrigin = z.infer<
  typeof learningSpaceSessionOriginSchema
>;
export type LearningSpaceSession = z.infer<typeof learningSpaceSessionSchema>;
export type LearningSpaceSessionsResponse = z.infer<
  typeof learningSpaceSessionsResponseSchema
>;
export type LearningSpaceSessionParams = z.infer<
  typeof learningSpaceSessionParamsSchema
>;
export type UpsertLearningSpaceSessionRequest = z.infer<
  typeof upsertLearningSpaceSessionRequestSchema
>;

z.globalRegistry.add(learningSpaceSessionSchema, {
  id: "LearningSpaceSession",
  description: "An authenticated learner's active course-player session.",
});
z.globalRegistry.add(learningSpaceSessionsResponseSchema, {
  id: "LearningSpaceSessionsResponse",
});
z.globalRegistry.add(upsertLearningSpaceSessionRequestSchema, {
  id: "UpsertLearningSpaceSessionRequest",
});
z.globalRegistry.add(closeLearningSpaceSessionResponseSchema, {
  id: "CloseLearningSpaceSessionResponse",
});
