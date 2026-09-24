import { z } from "zod";

export const quizStatusSchema = z.enum(["draft", "published", "archived"]);
export const quizQuestionTypeSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
]);
export const quizAttemptStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "graded",
  "expired",
]);
export const quizFeedbackModeSchema = z.enum([
  "after_submit",
  "after_attempt",
  "never",
]);
const uuid = z.uuid();
const nonNegativeNumber = z.number().finite().nonnegative();

export const quizResponseValueSchema = z.strictObject({
  selectedOptionIds: z.array(uuid).max(100).default([]),
  textResponse: z.string().max(2000).optional(),
});
export const quizAnswerInputSchema = z.strictObject({
  questionId: uuid,
  responseValue: quizResponseValueSchema,
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
});
export const bulkQuizAnswersRequestSchema = z.strictObject({
  answers: z.array(quizAnswerInputSchema).max(500),
});

export const quizOptionSchema = z.strictObject({
  id: uuid,
  text: z.string().min(1),
  position: z.number().int().nonnegative(),
});
export const learnerQuizQuestionSchema = z.strictObject({
  id: uuid,
  questionType: quizQuestionTypeSchema,
  prompt: z.string().min(1),
  points: nonNegativeNumber,
  position: z.number().int().nonnegative(),
  options: z.array(quizOptionSchema),
});
export const quizPricingTypeSchema = z.enum(["free", "paid"]);
export type QuizPricingType = z.infer<typeof quizPricingTypeSchema>;

export const quizAssignmentSchema = z.strictObject({
  id: uuid,
  quizId: uuid,
  quizVersionId: uuid,
  courseId: uuid,
  lessonId: uuid,
  required: z.boolean(),
  passPercentage: z.number().min(0).max(100),
  maxAttempts: z.number().int().positive(),
  timeLimitSeconds: z.number().int().positive().nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  feedbackMode: quizFeedbackModeSchema,
  availableFrom: z.string().nullable(),
  availableUntil: z.string().nullable(),
  /**
   * Pricing is read-only here: it is joined from the course's quiz pricing
   * row and shared by every quiz attached to the course. Edit it through
   * `setQuizCoursePricingRequestSchema`.
   */
  quizPricingId: uuid.nullable(),
  pricingType: quizPricingTypeSchema.default("free"),
  price: z.number().int().nonnegative().default(0),
  currency: z.string().length(3).default("INR"),
  salePrice: z.number().int().nonnegative().nullable().optional(),
});
export const instructorQuizAssignmentSchema = quizAssignmentSchema.extend({
  quizTitle: z.string().min(1),
});
export const courseQuizAssignmentsResponseSchema = z.array(
  instructorQuizAssignmentSchema,
);
export const quizSchema = z.strictObject({
  id: uuid,
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: quizStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  versions: z.array(
    z.strictObject({
      id: uuid,
      versionNumber: z.number().int().positive(),
      instructions: z.string().nullable(),
      publishedAt: z.string().nullable(),
      questions: z.array(
        z.strictObject({
          id: uuid,
          questionType: quizQuestionTypeSchema,
          prompt: z.string().min(1),
          points: nonNegativeNumber,
          position: z.number().int().nonnegative(),
          explanation: z.string().nullable(),
          options: z.array(
            z.strictObject({
              id: uuid,
              text: z.string().min(1),
              isCorrect: z.boolean(),
              weight: z.number(),
              position: z.number().int().nonnegative(),
            }),
          ),
        }),
      ),
    }),
  ),
  assignments: z.array(quizAssignmentSchema).optional(),
});
export const createQuizRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(2_000).nullable().optional(),
  instructions: z.string().max(5_000).nullable().optional(),
});
export const updateQuizRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(2_000).nullable().optional(),
  instructions: z.string().max(5_000).nullable().optional(),
});
export const quizOptionInputSchema = z.strictObject({
  id: uuid.optional(),
  text: z.string().trim().min(1).max(1_000),
  isCorrect: z.boolean(),
  weight: z.number().finite().min(0).max(1).optional(),
  position: z.number().int().nonnegative().optional(),
});
export const createQuizQuestionRequestSchema = z.strictObject({
  questionType: quizQuestionTypeSchema,
  prompt: z.string().trim().min(1).max(5_000),
  points: z.number().finite().positive().max(10_000),
  position: z.number().int().nonnegative().optional(),
  explanation: z.string().max(5_000).nullable().optional(),
  options: z.array(quizOptionInputSchema).min(1).max(100),
});
export const createQuizWithQuestionsRequestSchema = createQuizRequestSchema.extend({
  questions: z.array(createQuizQuestionRequestSchema).max(100),
});
export const updateQuizQuestionRequestSchema = createQuizQuestionRequestSchema
  .partial()
  .extend({
    options: z.array(quizOptionInputSchema).min(1).max(100).optional(),
  });
export const assignQuizRequestSchema = z.strictObject({
  quizVersionId: uuid,
  required: z.boolean().optional(),
  passPercentage: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().positive().max(100).optional(),
  timeLimitSeconds: z
    .number()
    .int()
    .positive()
    .max(86_400)
    .nullable()
    .optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  feedbackMode: quizFeedbackModeSchema.optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  availableUntil: z.coerce.date().nullable().optional(),
});
export const updateQuizAssignmentRequestSchema = assignQuizRequestSchema
  .omit({ quizVersionId: true })
  .extend({ quizVersionId: uuid.optional() });

/** Highest quiz pass price, in whole major currency units. Keeps order totals well inside DB and gateway limits. */
export const MAX_QUIZ_PRICE = 1_000_000;

export const setQuizCoursePricingRequestSchema = z
  .strictObject({
    pricingType: quizPricingTypeSchema,
    price: z.number().int().nonnegative().max(MAX_QUIZ_PRICE).default(0),
    /** Optional: the server always uses the course's currency and rejects a different one. */
    currency: z.string().length(3).optional(),
    salePrice: z
      .number()
      .int()
      .positive()
      .max(MAX_QUIZ_PRICE)
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pricingType !== "paid") return;
    if (value.price <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "A paid quiz pass needs a price greater than 0.",
      });
    }
    if (
      value.salePrice !== null &&
      value.salePrice !== undefined &&
      value.salePrice >= value.price
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "Sale price must be lower than the price.",
      });
    }
  });

/** `id` is null while the course has no pricing row (its quizzes are free). */
export const quizCoursePricingSchema = z.strictObject({
  id: uuid.nullable(),
  courseId: uuid,
  pricingType: quizPricingTypeSchema,
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
  salePrice: z.number().int().positive().nullable(),
});

export const quizPricingPreviewResponseSchema = z.strictObject({
  quizAssignmentId: uuid,
  quizId: uuid,
  quizPricingId: uuid.nullable(),
  quizTitle: z.string(),
  courseId: uuid,
  lessonId: uuid,
  pricingType: quizPricingTypeSchema,
  catalogPrice: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().nullable(),
  effectivePrice: z.number().int().nonnegative(),
  currency: z.string().length(3),
  isEnrolled: z.boolean(),
});
export type QuizPricingPreviewResponse = z.infer<
  typeof quizPricingPreviewResponseSchema
>;
export const learnerQuizAttemptSchema = z.strictObject({
  id: uuid,
  assignmentId: uuid,
  quizVersionId: uuid,
  attemptNumber: z.number().int().positive(),
  status: quizAttemptStatusSchema,
  startedAt: z.string(),
  expiresAt: z.string().nullable(),
  questions: z.array(learnerQuizQuestionSchema),
  answers: z.record(
    z.string(),
    z.object({
      selectedOptionIds: z.array(uuid).default([]),
      textResponse: z.string().max(2000).optional(),
    }),
  ),
});
export const quizResultSchema = z.strictObject({
  attemptId: uuid,
  assignmentId: uuid,
  quizVersionId: uuid,
  attemptNumber: z.number().int().positive(),
  score: nonNegativeNumber,
  maxScore: nonNegativeNumber,
  percentage: z.number().min(0).max(100),
  passed: z.boolean(),
  status: quizAttemptStatusSchema,
  submittedAt: z.string(),
  feedbackMode: quizFeedbackModeSchema,
  answers: z
    .array(
      z.strictObject({
        questionId: uuid,
        prompt: z.string().min(1),
        selectedOptionIds: z.array(uuid),
        selectedOptionTexts: z.array(z.string()),
        correctOptionTexts: z.array(z.string()),
        textResponse: z.string().nullable().optional(),
        isCorrect: z.boolean(),
        pointsAwarded: nonNegativeNumber,
        explanation: z.string().nullable(),
      }),
    )
    .optional(),
});
export const quizHistoryEntrySchema = z.strictObject({
  id: uuid,
  assignmentId: uuid,
  attemptNumber: z.number().int().positive(),
  status: quizAttemptStatusSchema,
  score: nonNegativeNumber,
  passed: z.boolean(),
  submittedAt: z.string().nullable(),
});
export const quizHistoryResponseSchema = z.array(quizHistoryEntrySchema);
export const quizAnswerSyncResponseSchema = z.strictObject({
  saved: z.literal(true),
  answerCount: z.number().int().nonnegative(),
});
export const quizDeleteResponseSchema = z.strictObject({
  success: z.literal(true),
});
export const myQuizAssignmentsResponseSchema = z.strictObject({
  assignments: z.array(
    quizAssignmentSchema.extend({
      quizTitle: z.string(),
      lessonTitle: z.string(),
      activeAttemptId: uuid.nullable(),
      courseTitle: z.string(),
      attemptCount: z.number().int().nonnegative(),
      latestAttemptStatus: quizAttemptStatusSchema.nullable(),
      latestScore: z.number().nonnegative().nullable(),
      bestScore: z.number().nonnegative().nullable(),
      latestPassed: z.boolean().nullable(),
    }),
  ),
});
export const quizAnalyticsSchema = z.strictObject({
  assignedStudents: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  notAttempted: z.number().int().nonnegative(),
  averageScore: z.number().nonnegative(),
  highestScore: z.number().nonnegative(),
  lowestScore: z.number().nonnegative(),
  students: z.array(
    z.strictObject({
      studentId: uuid,
      studentName: z.string(),
      attemptCount: z.number().int().nonnegative(),
      latestScore: z.number().nullable(),
      bestScore: z.number().nullable(),
      status: z.enum(["passed", "failed", "in_progress", "not_attempted"]),
      lastAttempt: z.string().nullable(),
    }),
  ),
});

export const courseQuizAnalyticsSchema = z.strictObject({
  totalQuizzes: z.number().int().nonnegative(),
  requiredQuizzes: z.number().int().nonnegative(),
  students: z.number().int().nonnegative(),
  averageQuizScore: z.number().nonnegative(),
  quizCompletionRate: z.number().min(0).max(100),
  passRate: z.number().min(0).max(100),
  quizzes: z.array(
    z.strictObject({
      assignmentId: uuid,
      quizTitle: z.string(),
      averageScore: z.number().nonnegative(),
      completionRate: z.number().min(0).max(100),
      passRate: z.number().min(0).max(100),
    }),
  ),
});
export const studentQuizReportSchema = z.strictObject({
  studentId: uuid,
  completedQuizzes: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  averageScore: z.number().nonnegative(),
  bestScore: z.number().nonnegative(),
  quizzes: z.array(
    z.strictObject({
      assignmentId: uuid,
      quizTitle: z.string(),
      courseId: uuid,
      attempts: z.number().int().nonnegative(),
      bestScore: z.number().nullable(),
      latestScore: z.number().nullable(),
      status: z.enum(["passed", "failed", "in_progress", "not_attempted"]),
    }),
  ),
});

export type QuizStatus = z.infer<typeof quizStatusSchema>;
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;
export type QuizAttemptStatus = z.infer<typeof quizAttemptStatusSchema>;
export type QuizResponseValue = z.infer<typeof quizResponseValueSchema>;
export type BulkQuizAnswersRequest = z.infer<
  typeof bulkQuizAnswersRequestSchema
>;
export type CreateQuizRequest = z.infer<typeof createQuizRequestSchema>;
export type CreateQuizWithQuestionsRequest = z.infer<
  typeof createQuizWithQuestionsRequestSchema
>;
export type UpdateQuizRequest = z.infer<typeof updateQuizRequestSchema>;
export type CreateQuizQuestionRequest = z.infer<
  typeof createQuizQuestionRequestSchema
>;
export type UpdateQuizQuestionRequest = z.infer<
  typeof updateQuizQuestionRequestSchema
>;
export type AssignQuizRequest = z.infer<typeof assignQuizRequestSchema>;
export type SetQuizCoursePricingRequest = z.infer<
  typeof setQuizCoursePricingRequestSchema
>;
export type QuizCoursePricing = z.infer<typeof quizCoursePricingSchema>;
export type UpdateQuizAssignmentRequest = z.infer<
  typeof updateQuizAssignmentRequestSchema
>;
export type LearnerQuizAttempt = z.infer<typeof learnerQuizAttemptSchema>;
export type QuizResult = z.infer<typeof quizResultSchema>;
export type QuizHistoryEntry = z.infer<typeof quizHistoryEntrySchema>;
export type QuizAssignment = z.infer<typeof quizAssignmentSchema>;
export type MyQuizAssignment = z.infer<
  typeof myQuizAssignmentsResponseSchema
>["assignments"][number];
