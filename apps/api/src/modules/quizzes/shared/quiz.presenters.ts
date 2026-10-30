import type * as repo from "./quiz.repository.ts";

export type AssignmentRow = NonNullable<
  Awaited<ReturnType<typeof repo.findAssignment>>
>;

/** The one wire shape of a quiz assignment (`quizAssignmentSchema`). */
export function presentAssignment(row: AssignmentRow) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    quizVersionId: row.quiz_version_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    required: row.required,
    passPercentage: Number(row.pass_percentage),
    maxAttempts: row.max_attempts,
    timeLimitSeconds: row.time_limit_seconds,
    shuffleQuestions: row.shuffle_questions,
    shuffleOptions: row.shuffle_options,
    feedbackMode: row.feedback_mode,
    availableFrom: row.available_from?.toISOString() ?? null,
    availableUntil: row.available_until?.toISOString() ?? null,
  };
}
