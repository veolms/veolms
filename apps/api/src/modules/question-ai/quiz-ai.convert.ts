import type {
  CreateQuizQuestionRequest,
  QuizAiQuestionType,
} from "@veolms/contracts";

/** One question as the AI writes it (QUIZ_AI_OUTPUT_SCHEMA). */
interface AiQuestion {
  type?: unknown;
  prompt?: unknown;
  explanation?: unknown;
  options?: unknown;
}

const PROMPT_MAX = 5_000;
const OPTION_MAX = 1_000;
const EXPLANATION_MAX = 2_000;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * One AI question as the quiz API takes it, or the reason it cannot be
 * used. The rules are those the quiz editor and the API hold every
 * question to, so a converted question always saves.
 */
export function convertQuestion(
  raw: AiQuestion,
  allowed: readonly QuizAiQuestionType[],
  position: number,
): { question: CreateQuizQuestionRequest } | { problem: string } {
  const type = raw.type as QuizAiQuestionType;
  const at = `Question ${position + 1}`;
  if (!allowed.includes(type))
    return {
      problem: `${at} is of a type that was not asked for (${String(raw.type)}).`,
    };
  const prompt = text(raw.prompt);
  if (!prompt) return { problem: `${at} has no question text.` };
  if (prompt.length > PROMPT_MAX) return { problem: `${at} is too long.` };
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((option) => ({
          text: text((option as { text?: unknown })?.text),
          isCorrect: (option as { correct?: unknown })?.correct === true,
        }))
        .filter((option) => option.text.length > 0)
    : [];
  if (options.some((option) => option.text.length > OPTION_MAX))
    return { problem: `${at} has an option that is too long.` };
  const seen = new Set<string>();
  for (const option of options) {
    const key = option.text.toLowerCase();
    if (seen.has(key)) return { problem: `${at} has the same option twice.` };
    seen.add(key);
  }
  const correct = options.filter((option) => option.isCorrect).length;
  if (type === "true_false") {
    const words = options.map((option) => option.text.toLowerCase()).sort();
    if (options.length !== 2 || words[0] !== "false" || words[1] !== "true")
      return {
        problem: `${at} (true/false) must have exactly the options True and False.`,
      };
    if (correct !== 1)
      return {
        problem: `${at} (true/false) must have exactly one correct option.`,
      };
  } else if (type === "single_choice") {
    if (options.length < 3 || options.length > 5)
      return { problem: `${at} (single choice) must have 3 to 5 options.` };
    if (correct !== 1)
      return {
        problem: `${at} (single choice) must have exactly one correct option.`,
      };
  } else {
    if (options.length < 3 || options.length > 6)
      return { problem: `${at} (multiple choice) must have 3 to 6 options.` };
    if (correct < 2 || correct === options.length)
      return {
        problem: `${at} (multiple choice) must have at least two correct options and at least one wrong one.`,
      };
  }
  const explanation = text(raw.explanation).slice(0, EXPLANATION_MAX) || null;
  return {
    question: {
      questionType: type,
      prompt,
      points: 1,
      position,
      explanation,
      // True/False always in that order, as the editor shows them.
      options: (type === "true_false"
        ? [...options].sort((left) =>
            left.text.toLowerCase() === "true" ? -1 : 1,
          )
        : options
      ).map((option, index) => ({
        text:
          type === "true_false"
            ? option.text.toLowerCase() === "true"
              ? "True"
              : "False"
            : option.text,
        isCorrect: option.isCorrect,
        position: index,
      })),
    },
  };
}

export interface ConvertedQuiz {
  title: string;
  summary: string;
  questions: CreateQuizQuestionRequest[];
  problems: string[];
}

/**
 * The AI's quiz: usable questions kept, the others listed as problems (the
 * service asks the AI once more about them). Prompts already in the quiz
 * are dropped as repeats.
 */
export function convertQuiz(
  json: string,
  options: {
    allowed: readonly QuizAiQuestionType[];
    existingPrompts?: readonly string[];
  },
): ConvertedQuiz {
  let parsed: { title?: unknown; summary?: unknown; questions?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return {
      title: "",
      summary: "",
      questions: [],
      problems: ["The answer was not valid JSON."],
    };
  }
  const existing = new Set(
    (options.existingPrompts ?? []).map((prompt) =>
      prompt.trim().toLowerCase(),
    ),
  );
  const questions: CreateQuizQuestionRequest[] = [];
  const problems: string[] = [];
  const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
  raw.forEach((item, index) => {
    const result = convertQuestion(item as AiQuestion, options.allowed, index);
    if ("problem" in result) {
      problems.push(result.problem);
      return;
    }
    const key = result.question.prompt.toLowerCase();
    if (existing.has(key)) return;
    existing.add(key);
    questions.push({ ...result.question, position: questions.length });
  });
  return {
    title: text(parsed.title).slice(0, 255) || "Quiz",
    summary: text(parsed.summary).slice(0, 500),
    questions,
    problems,
  };
}
