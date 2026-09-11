import type { LearnerQuizAttempt } from "@veolms/contracts";
import { describe, expect, it } from "vitest";
import {
  answeredQuestionCount,
  formatQuizRemainingTime,
  hasAnsweredEveryQuestion,
  toBulkQuizAnswers,
  type QuizAttemptDraft,
} from "../../src/quizzes/quizDraft";

const attempt = {
  id: "attempt-1",
  assignmentId: "assignment-1",
  quizVersionId: "version-1",
  attemptNumber: 1,
  status: "in_progress",
  startedAt: "2026-09-11T00:00:00.000Z",
  expiresAt: null,
  questions: [
    {
      id: "question-1",
      questionType: "single_choice",
      prompt: "One",
      points: 1,
      position: 0,
      options: [],
    },
    {
      id: "question-2",
      questionType: "multiple_choice",
      prompt: "Two",
      points: 1,
      position: 1,
      options: [],
    },
  ],
  answers: {},
} as LearnerQuizAttempt;

describe("quiz attempt draft", () => {
  it("only considers non-empty answers complete", () => {
    const draft: QuizAttemptDraft = {
      currentQuestionId: "question-1",
      answers: {
        "question-1": { selectedOptionIds: ["option-1"] },
        "question-2": { selectedOptionIds: [] },
      },
    };
    expect(answeredQuestionCount(attempt, draft)).toBe(1);
    expect(hasAnsweredEveryQuestion(attempt, draft)).toBe(false);
    draft.answers["question-2"] = {
      selectedOptionIds: ["option-2", "option-3"],
    };
    expect(hasAnsweredEveryQuestion(attempt, draft)).toBe(true);
  });

  it("serializes one complete snapshot for the bulk endpoint", () => {
    const draft: QuizAttemptDraft = {
      currentQuestionId: "question-2",
      answers: {
        "question-1": { selectedOptionIds: ["option-1"] },
        "question-2": { selectedOptionIds: ["option-2"] },
      },
    };
    expect(toBulkQuizAnswers(draft)).toEqual({
      answers: [
        {
          questionId: "question-1",
          responseValue: { selectedOptionIds: ["option-1"] },
        },
        {
          questionId: "question-2",
          responseValue: { selectedOptionIds: ["option-2"] },
        },
      ],
    });
  });

  it("formats the visible server-timer countdown", () => {
    expect(formatQuizRemainingTime(125)).toBe("2:05");
    expect(formatQuizRemainingTime(0)).toBe("0:00");
  });
});
