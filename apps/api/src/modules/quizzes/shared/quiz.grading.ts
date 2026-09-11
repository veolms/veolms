export interface QuizGradeQuestion {
  points: number;
  selectedOptionIds: readonly string[];
  correctOptionIds: readonly string[];
}

export function gradeQuizQuestion({
  points,
  selectedOptionIds,
  correctOptionIds,
}: QuizGradeQuestion) {
  const selected = [...new Set(selectedOptionIds)].sort();
  const correct = [...new Set(correctOptionIds)].sort();
  const isCorrect =
    selected.length === correct.length &&
    selected.every((id, index) => id === correct[index]);
  return { isCorrect, pointsAwarded: isCorrect ? points : 0 };
}

export function hasQuizAnswer(
  value: { selectedOptionIds: readonly string[] } | null | undefined,
) {
  return Boolean(value && value.selectedOptionIds.length > 0);
}
