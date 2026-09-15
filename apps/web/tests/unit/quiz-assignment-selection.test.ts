import { describe, expect, it } from "vitest";
import type { QuizAssignment } from "@veolms/contracts";
import { selectQuizAssignment } from "../../src/quizzes/quizAssignmentSelection";

const assignment = (
  id: string,
  quizId: string,
  courseId: string,
  lessonId: string,
): QuizAssignment => ({
  id,
  quizId,
  quizVersionId: `version-${id}`,
  courseId,
  lessonId,
  required: true,
  passPercentage: 70,
  maxAttempts: 1,
  timeLimitSeconds: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  feedbackMode: "after_submit",
  availableFrom: null,
  availableUntil: null,
});

describe("quiz assignment selection", () => {
  const oldQuiz = assignment(
    "assignment-old",
    "quiz-old",
    "course-next",
    "lesson-old",
  );
  const newQuiz = assignment(
    "assignment-new",
    "quiz-new",
    "course-next",
    "lesson-new",
  );

  it("keeps the active quiz when selecting a course with another quiz", () => {
    expect(
      selectQuizAssignment({
        assignments: [oldQuiz, newQuiz],
        activeQuizId: "quiz-new",
        targetCourseId: "course-next",
        targetLessonId: null,
      }),
    ).toEqual(newQuiz);
  });

  it("does not select another quiz for an unassigned target", () => {
    expect(
      selectQuizAssignment({
        assignments: [oldQuiz],
        activeQuizId: "quiz-new",
        targetCourseId: "course-next",
        targetLessonId: "lesson-new",
      }),
    ).toBeUndefined();
  });

  it("loads an existing embedded course lesson assignment once", () => {
    expect(
      selectQuizAssignment({
        assignments: [oldQuiz],
        activeQuizId: null,
        targetCourseId: "course-next",
        targetLessonId: "lesson-old",
        allowEmbeddedInitialResolution: true,
      }),
    ).toEqual(oldQuiz);
  });

  it("deduplicates assignment data returned by course and quiz queries", () => {
    expect(
      selectQuizAssignment({
        assignments: [newQuiz, newQuiz],
        activeQuizId: "quiz-new",
        targetCourseId: "course-next",
        targetLessonId: "lesson-new",
      }),
    ).toEqual(newQuiz);
  });
});
