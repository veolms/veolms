import { describe, expect, it } from "vitest";
import {
  gradeQuizQuestion,
  hasQuizAnswer,
} from "../../../api/src/modules/quizzes/shared/quiz.grading";

describe("Quiz grading", () => {
  it("awards full points only for an exact option set", () => {
    expect(
      gradeQuizQuestion({
        points: 5,
        selectedOptionIds: ["b", "a"],
        correctOptionIds: ["a", "b"],
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 5 });
    expect(
      gradeQuizQuestion({
        points: 5,
        selectedOptionIds: ["a", "b", "c"],
        correctOptionIds: ["a", "b"],
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("recognizes unanswered and answered response values", () => {
    expect(hasQuizAnswer(null)).toBe(false);
    expect(hasQuizAnswer({ selectedOptionIds: [] })).toBe(false);
    expect(hasQuizAnswer({ selectedOptionIds: ["option"] })).toBe(true);
  });
});
