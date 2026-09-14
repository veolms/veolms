import type { QuizAssignment } from "@veolms/contracts";

interface SelectQuizAssignmentOptions {
  assignments: readonly QuizAssignment[];
  activeQuizId: string | null | undefined;
  targetCourseId: string | null | undefined;
  targetLessonId: string | null | undefined;
  /**
   * A quiz lesson opened from the course editor may not have an active quiz
   * id yet. In that one embedded flow, resolve the existing assignment once
   * so the editor can load the quiz that already belongs to that lesson.
   * Standalone course selection must never use this fallback because a course
   * can contain multiple independent quizzes.
   */
  allowEmbeddedInitialResolution?: boolean;
}

/**
 * Finds the assignment for the quiz currently being edited.
 *
 * The old implementation searched by course first and returned whichever quiz
 * was assigned there. That made selecting a course replace the active quiz
 * with an older assignment. Quiz identity is now the primary scope; course
 * and lesson only identify the delivery target.
 */
export function selectQuizAssignment({
  assignments,
  activeQuizId,
  targetCourseId,
  targetLessonId,
  allowEmbeddedInitialResolution = false,
}: SelectQuizAssignmentOptions): QuizAssignment | undefined {
  const uniqueAssignments = Array.from(
    new Map(
      assignments.map((assignment) => [assignment.id, assignment]),
    ).values(),
  );

  const scopedAssignments = activeQuizId
    ? uniqueAssignments.filter(
        (assignment) => assignment.quizId === activeQuizId,
      )
    : allowEmbeddedInitialResolution && targetCourseId && targetLessonId
      ? uniqueAssignments.filter(
          (assignment) =>
            assignment.courseId === targetCourseId &&
            assignment.lessonId === targetLessonId,
        )
      : [];

  if (targetLessonId) {
    return scopedAssignments.find(
      (assignment) => assignment.lessonId === targetLessonId,
    );
  }
  if (targetCourseId) {
    return scopedAssignments.find(
      (assignment) => assignment.courseId === targetCourseId,
    );
  }
  return scopedAssignments[0];
}
