import {
  generateQuizAiRequestSchema,
  reviseQuizQuestionAiRequestSchema,
  type CreateQuizQuestionRequest,
  type AiModelId,
  type GenerateQuizAiRequest,
  type QuizAiLevel,
  type QuizAiQuestionType,
  type QuizAiStreamEvent,
  type ReviseQuizQuestionAiRequest,
} from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { AiService } from "../ai/index.ts";
import { assertCanManageCourse } from "../quizzes/shared/quiz.types.ts";
import {
  buildLectureContext,
  type LectureContext,
  type LectureContextDeps,
} from "./lecture-context.ts";
import { convertQuestion, convertQuiz } from "./quiz-ai.convert.ts";
import {
  QUIZ_AI_OUTPUT_SCHEMA,
  QUIZ_AI_QUESTION_SCHEMA,
  QUIZ_AI_SYSTEM,
} from "./quiz-ai.prompt.ts";

/** Room for thinking plus up to fifteen questions with explanations. */
const MAX_TOKENS = 24_000;

type Emit = (event: QuizAiStreamEvent) => void;
type Actor = { id: string; roles: readonly string[] };

const LEVEL_WORDS: Record<QuizAiLevel, string> = {
  easy: "easy: checks the main ideas, for a student who just watched the lecture",
  mixed:
    "a mix that grows from easy to a little harder, in the order the lecture teaches",
  hard: "harder: applying the ideas to new small cases, still only from this lecture",
};

const TYPE_WORDS: Record<QuizAiQuestionType, string> = {
  single_choice: "single_choice (one right option)",
  multiple_choice: "multiple_choice (select all that apply)",
  true_false: "true_false",
};

export interface QuizAiServiceOptions extends LectureContextDeps {
  ai: AiService;
}

export interface DraftedQuiz {
  title: string;
  summary: string;
  questions: CreateQuizQuestionRequest[];
  /** The lecture had little to write from. */
  thin: boolean;
}

/**
 * AI writes quiz questions for a lecture. Nothing here saves anything: the
 * caller shows them in the quiz editor (one lecture) or saves them as a
 * draft quiz (a whole course).
 */
export function createQuizAiService(options: QuizAiServiceOptions) {
  const { database, ai, courseService } = options;

  async function requireManagedCourse(actor: Actor, courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    await assertCanManageCourse(database, actor, course, "quiz.create");
    return course;
  }

  /**
   * Writes `count` questions for a lecture, checks every one, and asks the
   * AI once more for the ones it got wrong.
   */
  async function writeQuiz(
    actor: Actor,
    context: LectureContext,
    request: ReturnType<typeof generateQuizAiRequestSchema.parse>,
    emit: Emit,
    signal: AbortSignal,
    run: {
      background?: boolean;
      subjectId?: string | null;
      /** A course-wide run's model and effort (cheaper than one-off). */
      model?: AiModelId;
      effort?: "low" | "medium" | "high";
    } = {},
  ): Promise<DraftedQuiz> {
    const wanted = [
      `\n# What to write`,
      `Number of questions: ${request.count}`,
      `Level: ${LEVEL_WORDS[request.level]}`,
      `Question types to use (only these; mix them): ${request.types.map((type) => TYPE_WORDS[type]).join(", ")}`,
      request.guidance
        ? `The teacher's own note (follow it): ${request.guidance}`
        : "",
      request.existingPrompts?.length
        ? `\nThe quiz already has these questions; do not repeat them:\n${request.existingPrompts
            .slice(0, 40)
            .map((prompt) => `- ${prompt.slice(0, 200)}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    let message = `${context.text}\n${wanted}`;
    let best: DraftedQuiz = {
      title: "",
      summary: "",
      questions: [],
      thin: context.thin,
    };
    for (let round = 0; round < 2; round += 1) {
      emit({
        type: "progress",
        stage: "writing",
        message:
          round === 0 ? "Writing the questions…" : "Fixing a few questions…",
        chars: 0,
      });
      let lastSent = 0;
      const { text } = await ai.runJson({
        feature: "quiz.generate",
        userId: actor.id,
        subjectId: run.subjectId ?? null,
        system: QUIZ_AI_SYSTEM,
        user: message,
        schema: QUIZ_AI_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: MAX_TOKENS,
        effort: run.effort ?? "medium",
        model: run.model,
        signal,
        background: run.background,
        onProgress: (chars) => {
          if (chars - lastSent < 300) return;
          lastSent = chars;
          emit({
            type: "progress",
            stage: "writing",
            message: "Writing the questions…",
            chars,
          });
        },
      });
      emit({
        type: "progress",
        stage: "checking",
        message: "Checking every question…",
      });
      const converted = convertQuiz(text, {
        allowed: request.types,
        existingPrompts: [
          ...(request.existingPrompts ?? []),
          ...best.questions.map((question) => question.prompt),
        ],
      });
      best = {
        title: best.title || converted.title,
        summary: best.summary || converted.summary,
        questions: [...best.questions, ...converted.questions]
          .slice(0, request.count)
          .map((question, position) => ({ ...question, position })),
        thin: context.thin,
      };
      const missing = request.count - best.questions.length;
      // Done: enough good questions, or the AI said there is nothing to ask.
      if (
        missing <= 0 ||
        (converted.problems.length === 0 && converted.questions.length === 0)
      )
        break;
      if (round === 1) break;
      message = `${context.text}\n${wanted}\n\n# Write ${missing} more question(s)\nThese of your questions could not be used:\n${converted.problems
        .map((problem) => `- ${problem}`)
        .join(
          "\n",
        )}\n\nThe questions already accepted (do not repeat them):\n${best.questions
        .map((question) => `- ${question.prompt.slice(0, 200)}`)
        .join("\n")}\n\nReturn JSON with only the ${missing} new question(s).`;
    }
    if (best.questions.length === 0 && !best.summary)
      throw new AppError(
        422,
        "AI_INVALID_QUIZ",
        "The AI could not write usable questions for this lecture. Try again, or add notes to the lecture first.",
      );
    return best;
  }

  /** Questions for one lecture, for the quiz editor (not saved). */
  async function draftForLecture(
    actor: Actor,
    courseId: string,
    lessonId: string,
    raw: GenerateQuizAiRequest,
    emit: Emit,
    signal: AbortSignal,
  ) {
    const request = generateQuizAiRequestSchema.parse(raw);
    await requireManagedCourse(actor, courseId);
    emit({
      type: "progress",
      stage: "context",
      message: "Reading the lecture…",
    });
    const context = await buildLectureContext(
      options,
      actor,
      courseId,
      lessonId,
    );
    const quiz = await writeQuiz(actor, context, request, emit, signal);
    emit({
      type: "done",
      title: quiz.title || `Quick check: ${context.lessonTitle}`,
      questions: quiz.questions,
      summary:
        quiz.summary ||
        `${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"} for “${context.lessonTitle}”.`,
    });
  }

  /** One question changed as the author asks (not saved). */
  async function reviseQuestion(
    actor: Actor,
    courseId: string,
    lessonId: string,
    raw: ReviseQuizQuestionAiRequest,
    emit: Emit,
    signal: AbortSignal,
  ) {
    const request = reviseQuizQuestionAiRequestSchema.parse(raw);
    await requireManagedCourse(actor, courseId);
    emit({
      type: "progress",
      stage: "context",
      message: "Reading the lecture…",
    });
    const context = await buildLectureContext(
      options,
      actor,
      courseId,
      lessonId,
    );
    const current = request.question;
    const type = (
      current.questionType === "short_answer"
        ? "single_choice"
        : current.questionType
    ) as QuizAiQuestionType;
    const shown = {
      type,
      prompt: current.prompt,
      explanation: current.explanation ?? "",
      options: current.options.map((option) => ({
        text: option.text,
        correct: option.isCorrect,
      })),
    };
    let message = `${context.text}\n\n# The question to change\n${JSON.stringify(shown, null, 2)}\n\n# What the teacher wants\n${request.instruction}\n\nReturn the whole changed question. Keep its type unless the teacher asks for another.`;
    for (let round = 0; round < 2; round += 1) {
      emit({
        type: "progress",
        stage: "writing",
        message: round === 0 ? "Rewriting the question…" : "Fixing it…",
      });
      const { text } = await ai.runJson({
        feature: "quiz.revise",
        userId: actor.id,
        system: QUIZ_AI_SYSTEM,
        user: message,
        schema: QUIZ_AI_QUESTION_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8_000,
        effort: "low",
        signal,
      });
      let parsed: { question?: unknown; summary?: unknown } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        parsed = {};
      }
      const result = convertQuestion(
        (parsed.question ?? {}) as Parameters<typeof convertQuestion>[0],
        ["single_choice", "multiple_choice", "true_false"],
        current.position ?? 0,
      );
      if ("question" in result) {
        emit({
          type: "done",
          title: "",
          questions: [{ ...result.question, points: current.points }],
          summary:
            typeof parsed.summary === "string" && parsed.summary.trim()
              ? parsed.summary.trim().slice(0, 500)
              : "Rewrote the question.",
        });
        return;
      }
      message = `${message}\n\nYour previous answer could not be used: ${result.problem} Return the whole corrected question.`;
    }
    throw new AppError(
      422,
      "AI_INVALID_QUIZ",
      "The AI's question was not usable. Try again with other words.",
    );
  }

  return { requireManagedCourse, writeQuiz, draftForLecture, reviseQuestion };
}

export type QuizAiService = ReturnType<typeof createQuizAiService>;
