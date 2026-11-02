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

/** The longest answer a learner can type into a short-answer question. */
export const QUIZ_TEXT_RESPONSE_MAX_LENGTH = 2000;

export const quizResponseValueSchema = z.strictObject({
  selectedOptionIds: z.array(uuid).max(100).default([]),
  textResponse: z.string().max(QUIZ_TEXT_RESPONSE_MAX_LENGTH).optional(),
});
export const quizAnswerInputSchema = z.strictObject({
  questionId: uuid,
  responseValue: quizResponseValueSchema,
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
});
export const bulkQuizAnswersRequestSchema = z.strictObject({
  answers: z.array(quizAnswerInputSchema).max(500),
});

/**
 * What a learner sees of a question while attempting it. Questions and
 * options arrive in the order to show them (shuffled when the assignment
 * says so); the authored position is deliberately not sent.
 */
export const quizOptionSchema = z.strictObject({
  id: uuid,
  text: z.string().min(1),
});
export const learnerQuizQuestionSchema = z.strictObject({
  id: uuid,
  questionType: quizQuestionTypeSchema,
  prompt: z.string().min(1),
  points: nonNegativeNumber,
  options: z.array(quizOptionSchema),
});
export const quizPricingTypeSchema = z.enum(["free", "paid"]);

/**
 * Delivery rules of a quiz attached to a lesson. Pricing is not part of it:
 * the quiz price belongs to the course (`quizCoursePricingSchema`).
 */
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
});
export const instructorQuizAssignmentSchema = quizAssignmentSchema.extend({
  quizTitle: z.string().min(1),
});
export const courseQuizAssignmentsResponseSchema = z.array(
  instructorQuizAssignmentSchema,
);

/** One row of the author's quiz library. */
export const quizSummarySchema = z.strictObject({
  id: uuid,
  title: z.string().min(1).max(255),
  status: quizStatusSchema,
  updatedAt: z.string(),
  /** Questions in the newest version. */
  questionCount: z.number().int().nonnegative(),
  publishedVersionCount: z.number().int().nonnegative(),
});
export const quizAuthoringQuestionSchema = z.strictObject({
  id: uuid,
  questionType: quizQuestionTypeSchema,
  prompt: z.string().min(1),
  points: nonNegativeNumber,
  explanation: z.string().nullable(),
  options: z.array(
    z.strictObject({
      id: uuid,
      text: z.string().min(1),
      isCorrect: z.boolean(),
    }),
  ),
});
/** A quiz as its author edits it. */
export const quizSchema = z.strictObject({
  id: uuid,
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  versions: z.array(
    z.strictObject({
      id: uuid,
      versionNumber: z.number().int().positive(),
      publishedAt: z.string().nullable(),
    }),
  ),
  /**
   * The version edits apply to: the draft when there is one, otherwise the
   * newest version. It is the only version sent with its questions.
   */
  editableVersion: z
    .strictObject({
      id: uuid,
      instructions: z.string().nullable(),
      publishedAt: z.string().nullable(),
      questions: z.array(quizAuthoringQuestionSchema),
    })
    .nullable(),
  assignments: z.array(quizAssignmentSchema),
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
  // Empty for a short answer, which is a free response with no key. The
  // choice types are held to "at least one correct option" by the API.
  options: z.array(quizOptionInputSchema).max(100),
});
export const createQuizWithQuestionsRequestSchema =
  createQuizRequestSchema.extend({
    questions: z.array(createQuizQuestionRequestSchema).max(100),
  });
export const updateQuizQuestionRequestSchema = createQuizQuestionRequestSchema
  .partial()
  .extend({
    options: z.array(quizOptionInputSchema).max(100).optional(),
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

/**
 * The course's quiz pass price, in the course's own currency. A course with
 * no price set reads as free.
 */
export const quizCoursePricingSchema = z.strictObject({
  pricingType: quizPricingTypeSchema,
  price: z.number().int().nonnegative(),
  salePrice: z.number().int().positive().nullable(),
});

export const quizPricingPreviewResponseSchema = z.strictObject({
  /** Null while the course has no quiz pricing row, i.e. its quizzes are free. */
  quizPricingId: uuid.nullable(),
  pricingType: quizPricingTypeSchema,
  catalogPrice: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  /** True when the caller may attempt without buying. */
  isEnrolled: z.boolean(),
});
export const learnerQuizAttemptSchema = z.strictObject({
  id: uuid,
  attemptNumber: z.number().int().positive(),
  status: quizAttemptStatusSchema,
  /** Time limit or due date, whichever ends the attempt first. */
  expiresAt: z.string().nullable(),
  /** Server clock when this was sent; count down against it, not the device. */
  serverNow: z.string(),
  questions: z.array(learnerQuizQuestionSchema),
  answers: z.record(
    z.string(),
    z.object({
      selectedOptionIds: z.array(uuid).default([]),
      textResponse: z.string().max(QUIZ_TEXT_RESPONSE_MAX_LENGTH).optional(),
    }),
  ),
});
export const quizResultSchema = z.strictObject({
  attemptId: uuid,
  attemptNumber: z.number().int().positive(),
  score: nonNegativeNumber,
  maxScore: nonNegativeNumber,
  /**
   * Not capped at 100: attempts imported from another platform keep the
   * score it recorded, which can be above the quiz's current total.
   */
  percentage: nonNegativeNumber,
  passed: z.boolean(),
  status: quizAttemptStatusSchema,
  feedbackMode: quizFeedbackModeSchema,
  answers: z
    .array(
      z.strictObject({
        questionId: uuid,
        prompt: z.string().min(1),
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
  attemptNumber: z.number().int().positive(),
  status: quizAttemptStatusSchema,
  score: nonNegativeNumber,
  passed: z.boolean(),
  submittedAt: z.string().nullable(),
});
export const quizHistoryResponseSchema = z.array(quizHistoryEntrySchema);
export const quizAnswerSyncResponseSchema = z.strictObject({
  saved: z.literal(true),
});
export const quizDeleteResponseSchema = z.strictObject({
  success: z.literal(true),
});
/** A quiz the learner can take, with where they stand on it. */
export const myQuizAssignmentSchema = z.strictObject({
  id: uuid,
  courseId: uuid,
  lessonId: uuid,
  quizTitle: z.string(),
  lessonTitle: z.string(),
  courseTitle: z.string(),
  maxAttempts: z.number().int().positive(),
  availableFrom: z.string().nullable(),
  availableUntil: z.string().nullable(),
  activeAttemptId: uuid.nullable(),
  attemptCount: z.number().int().nonnegative(),
  latestAttemptStatus: quizAttemptStatusSchema.nullable(),
  bestScore: z.number().nonnegative().nullable(),
  latestPassed: z.boolean().nullable(),
});
export const myQuizAssignmentsResponseSchema = z.strictObject({
  assignments: z.array(myQuizAssignmentSchema),
});
/**
 * One assignment's outcomes. `students` lists those who attempted first, the
 * latest activity first, then those who have not attempted, by name.
 */
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
      /**
       * Present only for someone who may read the course's students, to
       * find a student by email.
       */
      studentEmail: z.string().nullable(),
      attemptCount: z.number().int().nonnegative(),
      latestScore: z.number().nullable(),
      /**
       * The latest closed attempt's marks out of the quiz total ("6 / 21").
       * Null when the student has not attempted or the attempt is open.
       */
      latestMarks: z
        .strictObject({ obtained: nonNegativeNumber, max: nonNegativeNumber })
        .nullable(),
      status: z.enum(["passed", "failed", "in_progress", "not_attempted"]),
      lastAttempt: z.string().nullable(),
    }),
  ),
});

/** One of a student's attempts on an assignment, as a manager lists them. */
export const quizSubmissionAttemptSummarySchema = z.strictObject({
  id: uuid,
  attemptNumber: z.number().int().positive(),
  status: quizAttemptStatusSchema,
  /** Marks obtained; null while the attempt is still open. */
  score: nonNegativeNumber.nullable(),
  /** The total the attempt is marked out of. */
  maxScore: nonNegativeNumber,
  /**
   * Null while the attempt is still open. Not capped at 100: attempts
   * imported from another platform can carry a recorded score above the
   * quiz's current total.
   */
  percentage: nonNegativeNumber.nullable(),
  passed: z.boolean().nullable(),
  submittedAt: z.string().nullable(),
});

/**
 * A question of a submission with the student's answer and the answer key.
 * Grading fields are null while the attempt is still open, and when the
 * attempt's answers were not recorded.
 */
export const quizSubmissionQuestionSchema = z.strictObject({
  id: uuid,
  questionType: quizQuestionTypeSchema,
  prompt: z.string(),
  points: nonNegativeNumber,
  explanation: z.string().nullable(),
  answered: z.boolean(),
  textResponse: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
  pointsAwarded: nonNegativeNumber.nullable(),
  options: z.array(
    z.strictObject({
      id: uuid,
      text: z.string(),
      isCorrect: z.boolean(),
      selected: z.boolean(),
    }),
  ),
});

/**
 * One student's attempt on a quiz assignment, read by someone who manages
 * the course: every question with what the student answered, whether it was
 * right, the marks, and the totals. `attempts` lists all of the student's
 * attempts on the assignment, newest first, to switch between them.
 */
export const quizSubmissionSchema = z.strictObject({
  assignmentId: uuid,
  quizTitle: z.string(),
  lessonTitle: z.string().nullable(),
  passPercentage: z.number().min(0).max(100),
  student: z.strictObject({ id: uuid, name: z.string() }),
  attempts: z.array(quizSubmissionAttemptSummarySchema).min(1),
  attempt: z.strictObject({
    id: uuid,
    attemptNumber: z.number().int().positive(),
    status: quizAttemptStatusSchema,
    startedAt: z.string(),
    submittedAt: z.string().nullable(),
    score: nonNegativeNumber.nullable(),
    maxScore: nonNegativeNumber,
    percentage: nonNegativeNumber.nullable(),
    passed: z.boolean().nullable(),
    /**
     * False for a submitted attempt with no saved answers: one imported with
     * only its score and dates. Its questions then carry no answer or marks.
     */
    answersRecorded: z.boolean(),
    questionCount: z.number().int().nonnegative(),
    answeredCount: z.number().int().nonnegative(),
    /** Null while the attempt is still open or its answers were not recorded. */
    correctCount: z.number().int().nonnegative().nullable(),
    questions: z.array(quizSubmissionQuestionSchema),
  }),
});
export const quizSubmissionQuerySchema = z.strictObject({
  /** Which attempt to show; the newest when left out. */
  attemptId: uuid.optional(),
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
  completedQuizzes: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  averageScore: z.number().nonnegative(),
  bestScore: z.number().nonnegative(),
  quizzes: z.array(
    z.strictObject({
      assignmentId: uuid,
      quizTitle: z.string(),
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
export type UpdateQuizAssignmentRequest = z.infer<
  typeof updateQuizAssignmentRequestSchema
>;
export type LearnerQuizAttempt = z.infer<typeof learnerQuizAttemptSchema>;
export type QuizResult = z.infer<typeof quizResultSchema>;
export type QuizAssignment = z.infer<typeof quizAssignmentSchema>;
export type MyQuizAssignment = z.infer<typeof myQuizAssignmentSchema>;
export type QuizSummary = z.infer<typeof quizSummarySchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;
export type QuizSubmissionQuestion = z.infer<
  typeof quizSubmissionQuestionSchema
>;
