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
    expect(hasQuizAnswer({ textResponse: "" })).toBe(false);
    expect(hasQuizAnswer({ textResponse: "   " })).toBe(false);
    expect(hasQuizAnswer({ textResponse: "Paris" })).toBe(true);
  });

  it("grades short_answer input box questions with case-insensitivity and trimming", () => {
    const acceptedOptionTexts = ["Paris", "City of Light"];

    // Exact match
    expect(
      gradeQuizQuestion({
        questionType: "short_answer",
        points: 10,
        textResponse: "Paris",
        acceptedOptionTexts,
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 10 });

    // Case-insensitive match
    expect(
      gradeQuizQuestion({
        questionType: "short_answer",
        points: 10,
        textResponse: "pArIs",
        acceptedOptionTexts,
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 10 });

    // Trimmed match
    expect(
      gradeQuizQuestion({
        questionType: "short_answer",
        points: 10,
        textResponse: "   City of Light   ",
        acceptedOptionTexts,
      }),
    ).toEqual({ isCorrect: true, pointsAwarded: 10 });

    // Incorrect match
    expect(
      gradeQuizQuestion({
        questionType: "short_answer",
        points: 10,
        textResponse: "London",
        acceptedOptionTexts,
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: 0 });

    // Empty text response
    expect(
      gradeQuizQuestion({
        questionType: "short_answer",
        points: 10,
        textResponse: "   ",
        acceptedOptionTexts,
      }),
    ).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });
});
