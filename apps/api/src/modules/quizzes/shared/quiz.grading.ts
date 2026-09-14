export interface QuizGradeQuestion {
  questionType?: string;
  points: number;
  selectedOptionIds?: readonly string[];
  correctOptionIds?: readonly string[];
  textResponse?: string | null;
  acceptedOptionTexts?: readonly string[];
}

export function gradeQuizQuestion({
  questionType,
  points,
  selectedOptionIds = [],
  correctOptionIds = [],
  textResponse,
  acceptedOptionTexts = [],
}: QuizGradeQuestion) {
  if (questionType === "short_answer") {
    const trimmedInput = (textResponse ?? "").trim().toLowerCase();
    const isCorrect =
      trimmedInput.length > 0 &&
      acceptedOptionTexts.some(
        (accepted) => accepted.trim().toLowerCase() === trimmedInput,
      );
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
  if (value.selectedOptionIds && value.selectedOptionIds.length > 0) return true;
  if (
    typeof value.textResponse === "string" &&
    value.textResponse.trim().length > 0
  )
    return true;
  return false;
}
