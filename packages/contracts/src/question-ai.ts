import { z } from "zod";
import { createQuizQuestionRequestSchema } from "./quiz.ts";

const uuid = z.uuid();

/**
 * AI for quizzes, and questions for a whole course at once.
 *
 * A quiz written by AI is a proposal: for one lecture it lands in the quiz
 * editor unsaved, for the author to edit and save; for a whole course every
 * quiz and coding question is saved as a draft that students cannot see
 * until staff publish it.
 */

/** Kinds of question AI writes; short answers have no key to mark against. */
export const quizAiQuestionTypeSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "true_false",
]);
export type QuizAiQuestionType = z.infer<typeof quizAiQuestionTypeSchema>;

/** Easy, a mix that grows harder through the quiz, or hard. */
export const quizAiLevelSchema = z.enum(["easy", "mixed", "hard"]);
export type QuizAiLevel = z.infer<typeof quizAiLevelSchema>;

export const QUIZ_AI_LIMITS = {
  minQuestions: 3,
  maxQuestions: 15,
  maxGuidanceChars: 1_000,
} as const;

export const generateQuizAiRequestSchema = z.strictObject({
  count: z
    .number()
    .int()
    .min(QUIZ_AI_LIMITS.minQuestions)
    .max(QUIZ_AI_LIMITS.maxQuestions)
    .default(5),
  level: quizAiLevelSchema.default("mixed"),
  types: z
    .array(quizAiQuestionTypeSchema)
    .min(1)
    .max(3)
    .default(["single_choice", "multiple_choice", "true_false"]),
  /** The author's own words: what to focus on, who the students are. */
  guidance: z.string().trim().max(QUIZ_AI_LIMITS.maxGuidanceChars).optional(),
  /** Prompts of questions the quiz already has: not to be repeated. */
  existingPrompts: z.array(z.string().max(5_000)).max(100).optional(),
});
export type GenerateQuizAiRequest = z.input<typeof generateQuizAiRequestSchema>;

export const reviseQuizQuestionAiRequestSchema = z.strictObject({
  question: createQuizQuestionRequestSchema,
  /** What to change, in the author's words ("make it harder"). */
  instruction: z.string().trim().min(1).max(QUIZ_AI_LIMITS.maxGuidanceChars),
});
export type ReviseQuizQuestionAiRequest = z.infer<
  typeof reviseQuizQuestionAiRequestSchema
>;

/** NDJSON lines while AI writes a quiz or a question. */
export const quizAiStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("progress"),
    stage: z.enum(["context", "writing", "checking"]),
    message: z.string(),
    chars: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    type: z.literal("done"),
    title: z.string(),
    questions: z.array(createQuizQuestionRequestSchema),
    summary: z.string(),
  }),
  z.strictObject({
    type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type QuizAiStreamEvent = z.infer<typeof quizAiStreamEventSchema>;

/* ------------------------------------------------ a whole course at once */

export const questionGenerationSettingsSchema = z.strictObject({
  /** A quiz for each lecture. */
  quizzes: z.boolean().default(true),
  /** A coding question for each lecture that teaches code. */
  coding: z.boolean().default(true),
  questionsPerQuiz: z
    .number()
    .int()
    .min(QUIZ_AI_LIMITS.minQuestions)
    .max(10)
    .default(5),
  level: quizAiLevelSchema.default("mixed"),
  types: z
    .array(quizAiQuestionTypeSchema)
    .min(1)
    .max(3)
    .default(["single_choice", "multiple_choice", "true_false"]),
  /** Only these sections (empty: all of them). */
  sectionIds: z.array(uuid).max(200).default([]),
  /** Lectures that already have a quiz or coding question keep theirs. */
  skipExisting: z.boolean().default(true),
  guidance: z.string().trim().max(QUIZ_AI_LIMITS.maxGuidanceChars).optional(),
});
export type QuestionGenerationSettings = z.infer<
  typeof questionGenerationSettingsSchema
>;
export const startQuestionGenerationRequestSchema =
  questionGenerationSettingsSchema;
export type StartQuestionGenerationRequest = z.input<
  typeof startQuestionGenerationRequestSchema
>;

export const questionGenerationJobStatusSchema = z.enum([
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
]);
export const questionGenerationItemStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "skipped",
  "failed",
]);

export const questionGenerationItemSchema = z.strictObject({
  id: uuid,
  lessonId: uuid,
  lessonTitle: z.string(),
  sectionTitle: z.string().nullable(),
  /** Course order, from 1. */
  position: z.number().int(),
  status: questionGenerationItemStatusSchema,
  /** Why it was skipped or failed, or a note from the AI. */
  message: z.string().nullable(),
  quiz: z
    .strictObject({
      id: uuid,
      title: z.string(),
      /** Draft (students do not see it) or published. */
      status: z.enum(["draft", "published", "archived"]),
      questionCount: z.number().int().nonnegative(),
    })
    .nullable(),
  coding: z
    .strictObject({
      exerciseId: uuid,
      assignmentId: uuid.nullable(),
      title: z.string(),
      status: z.enum(["draft", "published", "archived"]),
    })
    .nullable(),
});
export type QuestionGenerationItem = z.infer<
  typeof questionGenerationItemSchema
>;

export const questionGenerationJobSchema = z.strictObject({
  id: uuid,
  courseId: uuid,
  status: questionGenerationJobStatusSchema,
  settings: questionGenerationSettingsSchema,
  totalItems: z.number().int(),
  doneItems: z.number().int(),
  quizzesCreated: z.number().int(),
  codingCreated: z.number().int(),
  skippedItems: z.number().int(),
  failedItems: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  items: z.array(questionGenerationItemSchema),
});
export type QuestionGenerationJob = z.infer<typeof questionGenerationJobSchema>;

/** The course's latest run, or none yet. */
export const latestQuestionGenerationResponseSchema = z.strictObject({
  job: questionGenerationJobSchema.nullable(),
});

/**
 * A rough price per lecture at Claude Opus 5.5 rates, to show before a run
 * starts. The real cost is in Platform → AI's usage.
 */
export const QUESTION_GENERATION_COST_USD = {
  quizPerLecture: 0.08,
  codingPerLecture: 0.4,
} as const;
