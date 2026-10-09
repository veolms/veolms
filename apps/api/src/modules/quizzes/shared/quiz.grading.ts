import { cleanQuizTextAnswer } from "./quiz.text.ts";

export interface QuizGradeQuestion {
  questionType?: string;
  points: number;
  selectedOptionIds?: readonly string[];
  correctOptionIds?: readonly string[];
  textResponse?: string | null;
}

export function gradeQuizQuestion({
  questionType,
  points,
  selectedOptionIds = [],
  correctOptionIds = [],
  textResponse,
}: QuizGradeQuestion) {
  if (questionType === "short_answer") {
    // A short answer is a free response: there is no key to match it
    // against. Anything the learner wrote earns the points; a blank answer,
    // or one made only of characters that are not text, earns none.
    const isCorrect = cleanQuizTextAnswer(textResponse ?? "").length > 0;
    return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
  }
  const selected = [...new Set(selectedOptionIds)].sort();
  const correct = [...new Set(correctOptionIds)].sort();
  const isCorrect =
    selected.length === correct.length &&
    selected.every((id, index) => id === correct[index]);
  return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
}

export function hasQuizAnswer(
  value:
    | {
        selectedOptionIds?: readonly string[];
        textResponse?: string | null;
      }
    | null
    | undefined,
) {
  if (!value) return false;
  if (value.selectedOptionIds && value.selectedOptionIds.length > 0)
    return true;
  if (
    typeof value.textResponse === "string" &&
    value.textResponse.trim().length > 0
  )
    return true;
  return false;
}
