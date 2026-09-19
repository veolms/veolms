import type {
  CreateQuizQuestionRequest,
  QuizQuestionType,
} from "@veolms/contracts";

export interface QuizBuilderOptionDraft {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizBuilderQuestionDraft {
  id: string;
  questionType: QuizQuestionType;
  prompt: string;
  points: number;
  position: number;
  explanation: string;
  options: QuizBuilderOptionDraft[];
}

export interface QuizBuilderAssignmentDraft {
  required: boolean;
  passPercentage: number;
  maxAttempts: number;
  timeLimitMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  availableFrom: string;
  availableUntil: string;
  feedbackMode: "after_submit" | "after_attempt" | "never";
}

export interface QuizBuilderBrowserDraft {
  title: string;
  description: string;
  instructions: string;
  questions: QuizBuilderQuestionDraft[];
  assignment: QuizBuilderAssignmentDraft;
}

const questionTypes: readonly QuizQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asPositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function asNonNegativeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function browserDraftStorageKey({
  courseId,
  lessonId,
}: {
  courseId?: string;
  lessonId?: string;
}) {
  return `veolms:quiz-builder:draft:${courseId ?? "library"}:${lessonId ?? "standalone"}`;
}

export function parseQuizBuilderBrowserDraft(
  value: string | null,
): QuizBuilderBrowserDraft | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const rawQuestions = Array.isArray(parsed.questions)
      ? parsed.questions
      : [];
    const rawAssignment = isRecord(parsed.assignment) ? parsed.assignment : {};
    const feedbackMode = ["after_submit", "after_attempt", "never"].includes(
      rawAssignment.feedbackMode as string,
    )
      ? (rawAssignment.feedbackMode as QuizBuilderAssignmentDraft["feedbackMode"])
      : "after_submit";

    return {
      title: asText(parsed.title),
      description: asText(parsed.description),
      instructions: asText(parsed.instructions),
      questions: rawQuestions.flatMap((rawQuestion, position) => {
        if (!isRecord(rawQuestion)) return [];
        const questionType = questionTypes.includes(
          rawQuestion.questionType as QuizQuestionType,
        )
          ? (rawQuestion.questionType as QuizQuestionType)
          : "single_choice";
        const rawOptions = Array.isArray(rawQuestion.options)
          ? rawQuestion.options
          : [];
        const options = rawOptions.flatMap((rawOption) => {
          if (!isRecord(rawOption)) return [];
          return [
            {
              ...(typeof rawOption.id === "string" ? { id: rawOption.id } : {}),
              text: asText(rawOption.text),
              isCorrect: rawOption.isCorrect === true,
            },
          ];
        });
        return [
          {
            id:
              typeof rawQuestion.id === "string"
                ? rawQuestion.id
                : `temp-q-${Date.now()}-${position}`,
            questionType,
            prompt: asText(rawQuestion.prompt),
            points:
              typeof rawQuestion.points === "number" &&
              Number.isFinite(rawQuestion.points) &&
              rawQuestion.points > 0
                ? rawQuestion.points
                : 1,
            position,
            explanation: asText(rawQuestion.explanation),
            options,
          },
        ];
      }),
      assignment: {
        required: rawAssignment.required !== false,
        passPercentage: asNonNegativeNumber(rawAssignment.passPercentage, 70),
        maxAttempts: asPositiveNumber(rawAssignment.maxAttempts, 1),
        timeLimitMinutes:
          typeof rawAssignment.timeLimitMinutes === "number" &&
          Number.isFinite(rawAssignment.timeLimitMinutes) &&
          rawAssignment.timeLimitMinutes >= 0
            ? rawAssignment.timeLimitMinutes
            : 0,
        shuffleQuestions: rawAssignment.shuffleQuestions === true,
        shuffleOptions: rawAssignment.shuffleOptions === true,
        availableFrom: asText(rawAssignment.availableFrom),
        availableUntil: asText(rawAssignment.availableUntil),
        feedbackMode,
      },
    };
  } catch {
    return null;
  }
}

export function toCreateQuizQuestionRequest(
  question: QuizBuilderQuestionDraft,
  position: number,
): CreateQuizQuestionRequest {
  return {
    questionType: question.questionType,
    prompt: question.prompt.trim(),
    points: question.points,
    position,
    explanation: question.explanation.trim() || null,
    options: question.options.map((option, optionPosition) => ({
      text: option.text.trim(),
      isCorrect: option.isCorrect,
      position: optionPosition,
    })),
  };
}
