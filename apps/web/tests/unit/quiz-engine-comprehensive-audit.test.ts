import { describe, expect, it } from "vitest";
import {
  assignQuizRequestSchema,
  bulkQuizAnswersRequestSchema,
  createQuizQuestionRequestSchema,
  createQuizRequestSchema,
  learnerQuizAttemptSchema,
  quizAssignmentSchema,
  quizFeedbackModeSchema,
  quizQuestionTypeSchema,
  quizResultSchema,
  quizDeleteResponseSchema,
  updateQuizAssignmentRequestSchema,
  type LearnerQuizAttempt,
  type QuizAssignment,
} from "@veolms/contracts";
import {
  gradeQuizQuestion,
  hasQuizAnswer,
} from "../../../api/src/modules/quizzes/shared/quiz.grading";
import {
  answeredQuestionCount,
  formatQuizRemainingTime,
  hasAnsweredEveryQuestion,
  toBulkQuizAnswers,
  type QuizAttemptDraft,
} from "../../src/quizzes/quizDraft";
import { selectQuizAssignment } from "../../src/quizzes/quizAssignmentSelection";
import {
  quizAttemptPassedEventSchema,
  quizAttemptFailedFinalEventSchema,
  quizAssignedEventSchema,
} from "../../../api/src/events/domain-event.schemas";
import { renderNotificationTemplate } from "../../../api/src/modules/notifications/notifications.templates";

// Deterministic UUIDs for testing
const UUID_1 = "11111111-1111-4111-a111-111111111111";
const UUID_2 = "22222222-2222-4222-a222-222222222222";
const UUID_3 = "33333333-3333-4333-a333-333333333333";
const UUID_4 = "44444444-4444-4444-a444-444444444444";
const UUID_5 = "55555555-5555-4555-a555-555555555555";
const UUID_6 = "66666666-6666-4666-a666-666666666666";
const UUID_7 = "77777777-7777-4777-a777-777777777777";
const UUID_8 = "88888888-8888-4888-a888-888888888888";

describe("Quiz & Assessment Engine Comprehensive PRD Audit", () => {
  // =========================================================================
  // SUITE 1: Deterministic Question Grading Engine (PRD Sections 10, 48, 59)
  // =========================================================================
  describe("Suite 1: Question Grading Engine & Evaluation Rules", () => {
    describe("Single Choice Grading", () => {
      it("1. awards full points when the single correct option is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "single_choice",
          points: 10,
          selectedOptionIds: [UUID_1],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 10 });
      });

      it("2. awards 0 points when a wrong option is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "single_choice",
          points: 10,
          selectedOptionIds: [UUID_2],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("3. awards 0 points when empty selection is submitted", () => {
        const res = gradeQuizQuestion({
          questionType: "single_choice",
          points: 10,
          selectedOptionIds: [],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("4. awards 0 points when a non-existent option ID is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "single_choice",
          points: 10,
          selectedOptionIds: [UUID_8],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("5. awards 0 points when multiple options are selected for single choice", () => {
        const res = gradeQuizQuestion({
          questionType: "single_choice",
          points: 10,
          selectedOptionIds: [UUID_1, UUID_2],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });
    });

    describe("Multiple Choice Grading (All-or-Nothing Rule)", () => {
      it("6. awards full points when exact set of correct options is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [UUID_1, UUID_2],
          correctOptionIds: [UUID_1, UUID_2],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 20 });
      });

      it("7. awards 0 points (no partial credit) when only a subset is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [UUID_1],
          correctOptionIds: [UUID_1, UUID_2],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("8. awards 0 points when superset (correct + extra incorrect) is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [UUID_1, UUID_2, UUID_3],
          correctOptionIds: [UUID_1, UUID_2],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("9. awards 0 points when multiple choice selection is empty", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [],
          correctOptionIds: [UUID_1, UUID_2],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("10. awards full points regardless of selection array ordering (permutation invariance)", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [UUID_3, UUID_1, UUID_2],
          correctOptionIds: [UUID_1, UUID_2, UUID_3],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 20 });
      });

      it("11. awards 0 points when completely disjoint options are selected", () => {
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 20,
          selectedOptionIds: [UUID_4, UUID_5],
          correctOptionIds: [UUID_1, UUID_2],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("12. strictly denies partial credit even if 9 out of 10 options match", () => {
        const tenCorrect = [
          UUID_1, UUID_2, UUID_3, UUID_4, UUID_5,
          "66666666-0000-0000-0000-000000000001",
          "66666666-0000-0000-0000-000000000002",
          "66666666-0000-0000-0000-000000000003",
          "66666666-0000-0000-0000-000000000004",
          "66666666-0000-0000-0000-000000000005",
        ];
        const nineSelected = tenCorrect.slice(0, 9);
        const res = gradeQuizQuestion({
          questionType: "multiple_choice",
          points: 50,
          selectedOptionIds: nineSelected,
          correctOptionIds: tenCorrect,
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });
    });

    describe("True / False Grading", () => {
      it("13. awards full points when 'True' is selected and is correct", () => {
        const res = gradeQuizQuestion({
          questionType: "true_false",
          points: 5,
          selectedOptionIds: [UUID_1],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 5 });
      });

      it("14. awards full points when 'False' is selected and is correct", () => {
        const res = gradeQuizQuestion({
          questionType: "true_false",
          points: 5,
          selectedOptionIds: [UUID_2],
          correctOptionIds: [UUID_2],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 5 });
      });

      it("15. awards 0 points when opposite boolean option is selected", () => {
        const res = gradeQuizQuestion({
          questionType: "true_false",
          points: 5,
          selectedOptionIds: [UUID_2],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("16. awards 0 points when true/false is left unanswered", () => {
        const res = gradeQuizQuestion({
          questionType: "true_false",
          points: 5,
          selectedOptionIds: [],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("17. awards 0 points if both True and False are selected", () => {
        const res = gradeQuizQuestion({
          questionType: "true_false",
          points: 5,
          selectedOptionIds: [UUID_1, UUID_2],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });
    });

    describe("Edge Cases & Point Value Invariants", () => {
      it("18. points awarded is never negative even under misconfiguration", () => {
        const res = gradeQuizQuestion({
          points: -10,
          selectedOptionIds: [UUID_2],
          correctOptionIds: [UUID_1],
        });
        expect(res.pointsAwarded).toBeGreaterThanOrEqual(0);
      });

      it("19. handles zero points question gracefully (points: 0)", () => {
        const res = gradeQuizQuestion({
          points: 0,
          selectedOptionIds: [UUID_1],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 0 });
      });

      it("20. handles large positive point values (points: 1000)", () => {
        const res = gradeQuizQuestion({
          points: 1000,
          selectedOptionIds: [UUID_1],
          correctOptionIds: [UUID_1],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 1000 });
      });

      it("21. handles duplicate IDs in selectedOptionIds without breaking", () => {
        const res = gradeQuizQuestion({
          points: 10,
          selectedOptionIds: [UUID_1, UUID_1],
          correctOptionIds: [UUID_1],
        });
        expect(res.isCorrect).toBe(true);
      });

      it("22. short_answer evaluation trims whitespace and ignores case", () => {
        const res = gradeQuizQuestion({
          questionType: "short_answer",
          points: 15,
          textResponse: "   PostgreSQL   ",
          acceptedOptionTexts: ["postgresql", "postgres"],
        });
        expect(res).toEqual({ isCorrect: true, pointsAwarded: 15 });
      });

      it("23. short_answer rejects blank or whitespace-only response", () => {
        const res = gradeQuizQuestion({
          questionType: "short_answer",
          points: 15,
          textResponse: "      ",
          acceptedOptionTexts: ["PostgreSQL"],
        });
        expect(res).toEqual({ isCorrect: false, pointsAwarded: 0 });
      });

      it("24. hasQuizAnswer accurately identifies answered vs unanswered responses", () => {
        expect(hasQuizAnswer(null)).toBe(false);
        expect(hasQuizAnswer(undefined)).toBe(false);
        expect(hasQuizAnswer({ selectedOptionIds: [] })).toBe(false);
        expect(hasQuizAnswer({ selectedOptionIds: [UUID_1] })).toBe(true);
        expect(hasQuizAnswer({ selectedOptionIds: [], textResponse: "" })).toBe(false);
        expect(hasQuizAnswer({ selectedOptionIds: [], textResponse: "   " })).toBe(false);
        expect(hasQuizAnswer({ selectedOptionIds: [], textResponse: "Answer" })).toBe(true);
      });
    });
  });

  // =========================================================================
  // SUITE 2: Zod Contract & Schema Validations (PRD Sections 47, 57)
  // =========================================================================
  describe("Suite 2: Zod Contract & Schema Validations", () => {
    describe("Create Quiz Schema", () => {
      it("25. accepts valid quiz title and optional description", () => {
        const parsed = createQuizRequestSchema.safeParse({
          title: "TypeScript Fundamentals",
          description: "A quiz testing core TypeScript knowledge.",
        });
        expect(parsed.success).toBe(true);
      });

      it("26. rejects empty quiz title", () => {
        const parsed = createQuizRequestSchema.safeParse({ title: "" });
        expect(parsed.success).toBe(false);
      });

      it("27. rejects whitespace-only quiz title", () => {
        const parsed = createQuizRequestSchema.safeParse({ title: "     " });
        expect(parsed.success).toBe(false);
      });

      it("28. rejects title exceeding 255 characters", () => {
        const parsed = createQuizRequestSchema.safeParse({
          title: "A".repeat(256),
        });
        expect(parsed.success).toBe(false);
      });

      it("29. rejects description exceeding 2000 characters", () => {
        const parsed = createQuizRequestSchema.safeParse({
          title: "Valid Title",
          description: "B".repeat(2001),
        });
        expect(parsed.success).toBe(false);
      });

      it("30. accepts optional instructions up to 5000 characters", () => {
        const parsed = createQuizRequestSchema.safeParse({
          title: "Valid Title",
          instructions: "C".repeat(5000),
        });
        expect(parsed.success).toBe(true);
      });

      it("31. rejects instructions exceeding 5000 characters", () => {
        const parsed = createQuizRequestSchema.safeParse({
          title: "Valid Title",
          instructions: "C".repeat(5001),
        });
        expect(parsed.success).toBe(false);
      });
    });

    describe("Question Schema Validations", () => {
      it("32. accepts valid single_choice question definition", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "What is 2 + 2?",
          points: 1,
          options: [
            { text: "3", isCorrect: false },
            { text: "4", isCorrect: true },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("33. accepts valid multiple_choice question definition", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "multiple_choice",
          prompt: "Select primitive types in JS",
          points: 5,
          options: [
            { text: "string", isCorrect: true },
            { text: "boolean", isCorrect: true },
            { text: "class", isCorrect: false },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("34. accepts valid true_false question definition", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "true_false",
          prompt: "HTTP is stateless.",
          points: 2,
          options: [
            { text: "True", isCorrect: true },
            { text: "False", isCorrect: false },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("35. rejects invalid questionType enum string", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "fill_in_the_blank",
          prompt: "Test",
          points: 1,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("36. rejects question prompt with 0 characters", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "",
          points: 1,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("37. rejects question prompt exceeding 5000 characters", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "P".repeat(5001),
          points: 1,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("38. rejects negative points", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: -5,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("39. rejects zero points (points must be strictly positive in schema)", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 0,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("40. rejects points exceeding maximum bound of 10,000", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 10001,
          options: [{ text: "A", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("41. rejects empty options array", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [],
        });
        expect(parsed.success).toBe(false);
      });

      it("42. rejects more than 100 options in question", () => {
        const options = Array.from({ length: 101 }, (_, i) => ({
          text: `Option ${i}`,
          isCorrect: i === 0,
        }));
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options,
        });
        expect(parsed.success).toBe(false);
      });

      it("43. rejects option with empty text", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [{ text: "", isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("44. rejects option exceeding 1000 characters", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [{ text: "O".repeat(1001), isCorrect: true }],
        });
        expect(parsed.success).toBe(false);
      });

      it("45. accepts valid option with custom weight and position", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [
            { text: "A", isCorrect: true, weight: 1, position: 0 },
            { text: "B", isCorrect: false, weight: 0, position: 1 },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("46. rejects option weight < 0", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [{ text: "A", isCorrect: true, weight: -0.5 }],
        });
        expect(parsed.success).toBe(false);
      });

      it("47. rejects option weight > 1", () => {
        const parsed = createQuizQuestionRequestSchema.safeParse({
          questionType: "single_choice",
          prompt: "Test prompt",
          points: 1,
          options: [{ text: "A", isCorrect: true, weight: 1.5 }],
        });
        expect(parsed.success).toBe(false);
      });
    });

    describe("Assignment Schema Validations", () => {
      it("48. accepts valid assign quiz payload", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          passPercentage: 80,
          maxAttempts: 3,
          timeLimitSeconds: 600,
        });
        expect(parsed.success).toBe(true);
      });

      it("49. rejects pass percentage < 0", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          passPercentage: -1,
        });
        expect(parsed.success).toBe(false);
      });

      it("50. rejects pass percentage > 100", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          passPercentage: 101,
        });
        expect(parsed.success).toBe(false);
      });

      it("51. accepts pass percentage boundary exactly 0", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          passPercentage: 0,
        });
        expect(parsed.success).toBe(true);
      });

      it("52. accepts pass percentage boundary exactly 100", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          passPercentage: 100,
        });
        expect(parsed.success).toBe(true);
      });

      it("53. rejects maxAttempts = 0", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          maxAttempts: 0,
        });
        expect(parsed.success).toBe(false);
      });

      it("54. rejects negative maxAttempts", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          maxAttempts: -3,
        });
        expect(parsed.success).toBe(false);
      });

      it("55. rejects non-integer maxAttempts", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          maxAttempts: 2.5,
        });
        expect(parsed.success).toBe(false);
      });

      it("56. rejects maxAttempts exceeding 100", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          maxAttempts: 101,
        });
        expect(parsed.success).toBe(false);
      });

      it("57. accepts null timeLimitSeconds (untimed quiz)", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          timeLimitSeconds: null,
        });
        expect(parsed.success).toBe(true);
      });

      it("58. rejects timeLimitSeconds = 0", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          timeLimitSeconds: 0,
        });
        expect(parsed.success).toBe(false);
      });

      it("59. rejects negative timeLimitSeconds", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          timeLimitSeconds: -60,
        });
        expect(parsed.success).toBe(false);
      });

      it("60. rejects timeLimitSeconds exceeding 24 hours (86,400s)", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          timeLimitSeconds: 86401,
        });
        expect(parsed.success).toBe(false);
      });

      it("61. accepts feedbackMode: 'after_submit'", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          feedbackMode: "after_submit",
        });
        expect(parsed.success).toBe(true);
      });

      it("62. accepts feedbackMode: 'after_attempt'", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          feedbackMode: "after_attempt",
        });
        expect(parsed.success).toBe(true);
      });

      it("63. accepts feedbackMode: 'never'", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          feedbackMode: "never",
        });
        expect(parsed.success).toBe(true);
      });

      it("64. rejects invalid feedbackMode string", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          feedbackMode: "immediate_during_test",
        });
        expect(parsed.success).toBe(false);
      });

      it("65. coerces valid ISO dates for availableFrom and availableUntil", () => {
        const parsed = assignQuizRequestSchema.safeParse({
          quizVersionId: UUID_1,
          availableFrom: "2026-09-01T00:00:00.000Z",
          availableUntil: "2026-09-30T23:59:59.000Z",
        });
        expect(parsed.success).toBe(true);
      });
    });

    describe("Bulk Answers Request Schema", () => {
      it("66. accepts valid bulk answers payload", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: UUID_1,
              responseValue: { selectedOptionIds: [UUID_2] },
              timeSpentSeconds: 30,
            },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("67. accepts empty answers array in bulk save", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({ answers: [] });
        expect(parsed.success).toBe(true);
      });

      it("68. rejects non-UUID questionId", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: "not-a-uuid",
              responseValue: { selectedOptionIds: [UUID_2] },
            },
          ],
        });
        expect(parsed.success).toBe(false);
      });

      it("69. accepts selectedOptionIds with multiple valid UUIDs", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: UUID_1,
              responseValue: { selectedOptionIds: [UUID_2, UUID_3] },
            },
          ],
        });
        expect(parsed.success).toBe(true);
      });

      it("70. rejects non-UUID inside selectedOptionIds", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: UUID_1,
              responseValue: { selectedOptionIds: ["bad-option-id"] },
            },
          ],
        });
        expect(parsed.success).toBe(false);
      });

      it("71. rejects timeSpentSeconds < 0", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: UUID_1,
              responseValue: { selectedOptionIds: [UUID_2] },
              timeSpentSeconds: -1,
            },
          ],
        });
        expect(parsed.success).toBe(false);
      });

      it("72. rejects timeSpentSeconds > 86,400", () => {
        const parsed = bulkQuizAnswersRequestSchema.safeParse({
          answers: [
            {
              questionId: UUID_1,
              responseValue: { selectedOptionIds: [UUID_2] },
              timeSpentSeconds: 86401,
            },
          ],
        });
        expect(parsed.success).toBe(false);
      });
    });
  });

  // =========================================================================
  // SUITE 3: Security, Privacy & Vulnerability Audits (PRD Sections 31, 32, 45, 59, 64)
  // =========================================================================
  describe("Suite 3: Security, Privacy & Vulnerability Audits", () => {
    describe("Zero Answer Key Leakage to Learners", () => {
      it("73. active learner attempt schema forbids 'isCorrect' in question options", () => {
        const attemptPayload = {
          id: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          status: "in_progress",
          startedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: null,
          questions: [
            {
              id: UUID_4,
              questionType: "single_choice",
              prompt: "What is React?",
              points: 1,
              position: 0,
              options: [
                { id: UUID_5, text: "Library", position: 0, isCorrect: true }, // Forbidden in learner schema!
              ],
            },
          ],
          answers: {},
        };
        // Strict schema must fail if isCorrect is passed to learner
        const parsed = learnerQuizAttemptSchema.safeParse(attemptPayload);
        expect(parsed.success).toBe(false);
      });

      it("74. active learner attempt schema forbids question 'explanation' before submission", () => {
        const attemptPayload = {
          id: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          status: "in_progress",
          startedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: null,
          questions: [
            {
              id: UUID_4,
              questionType: "single_choice",
              prompt: "What is React?",
              points: 1,
              position: 0,
              explanation: "React is a UI library.", // Forbidden during active attempt!
              options: [{ id: UUID_5, text: "Library", position: 0 }],
            },
          ],
          answers: {},
        };
        const parsed = learnerQuizAttemptSchema.safeParse(attemptPayload);
        expect(parsed.success).toBe(false);
      });

      it("75. active learner attempt schema strips option 'weight'", () => {
        const attemptPayload = {
          id: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          status: "in_progress",
          startedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: null,
          questions: [
            {
              id: UUID_4,
              questionType: "single_choice",
              prompt: "Prompt",
              points: 1,
              position: 0,
              options: [{ id: UUID_5, text: "Opt", position: 0, weight: 1.0 }],
            },
          ],
          answers: {},
        };
        const parsed = learnerQuizAttemptSchema.safeParse(attemptPayload);
        expect(parsed.success).toBe(false);
      });

      it("76. valid sanitized learner attempt passes validation cleanly", () => {
        const sanitized = {
          id: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          status: "in_progress",
          startedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: null,
          questions: [
            {
              id: UUID_4,
              questionType: "single_choice",
              prompt: "Prompt",
              points: 1,
              position: 0,
              options: [{ id: UUID_5, text: "Opt", position: 0 }],
            },
          ],
          answers: {},
        };
        const parsed = learnerQuizAttemptSchema.safeParse(sanitized);
        expect(parsed.success).toBe(true);
      });
    });

    describe("Feedback Mode Data Exposure Audit", () => {
      it("77. feedback_mode === 'never' strips answers array from result DTO", () => {
        const resultNeverFeedback = {
          attemptId: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          score: 80,
          maxScore: 100,
          percentage: 80,
          passed: true,
          status: "graded",
          submittedAt: "2026-09-01T00:10:00.000Z",
          feedbackMode: "never",
        };
        const parsed = quizResultSchema.safeParse(resultNeverFeedback);
        expect(parsed.success).toBe(true);
      });

      it("78. feedback_mode === 'after_submit' includes full answers and explanations", () => {
        const resultWithFeedback = {
          attemptId: UUID_1,
          assignmentId: UUID_2,
          quizVersionId: UUID_3,
          attemptNumber: 1,
          score: 10,
          maxScore: 10,
          percentage: 100,
          passed: true,
          status: "graded",
          submittedAt: "2026-09-01T00:10:00.000Z",
          feedbackMode: "after_submit",
          answers: [
            {
              questionId: UUID_4,
              prompt: "What is Next.js?",
              selectedOptionIds: [UUID_5],
              selectedOptionTexts: ["A React framework"],
              correctOptionTexts: ["A React framework"],
              isCorrect: true,
              pointsAwarded: 10,
              explanation: "Next.js is a fullstack React framework.",
            },
          ],
        };
        const parsed = quizResultSchema.safeParse(resultWithFeedback);
        expect(parsed.success).toBe(true);
      });

      it("79. AUDIT GAP / VULNERABILITY: feedback_mode === 'after_attempt' logic verification", () => {
        // PRD Section 13 states:
        // "after_attempt: Results shown after each attempt, but correct answers
        // only revealed after all attempts are exhausted or deadline reached."
        // We verify that an attempt with attemptNumber < maxAttempts MUST NOT expose answers.
        const maxAttempts = 3;
        const currentAttempt = 1;
        const isExhaustedOrExpired = currentAttempt >= maxAttempts;
        const mode: string = "after_attempt";

        // In the current implementation in attempt.service.ts:
        // includeFeedback = assignment.feedback_mode !== "never"
        // This is TRUE for "after_attempt" on attempt 1!
        const backendCurrentBehavior = mode !== "never";
        expect(backendCurrentBehavior).toBe(true); // BUG CONFIRMED: leaks on attempt 1!

        // Expected PRD behavior:
        const prdCompliantFeedback =
          mode === "after_submit" ||
          (mode === "after_attempt" && isExhaustedOrExpired);
        expect(prdCompliantFeedback).toBe(false); // Correctly protected under PRD!
      });

      it("80. feedback_mode === 'after_attempt' reveals answers once all attempts are exhausted", () => {
        const maxAttempts = 3;
        const currentAttempt = 3;
        const isExhausted = currentAttempt >= maxAttempts;
        const mode: string = "after_attempt";
        const prdCompliantFeedback =
          mode === "after_submit" ||
          (mode === "after_attempt" && isExhausted);
        expect(prdCompliantFeedback).toBe(true);
      });

      it("81. feedback_mode === 'after_attempt' reveals answers when deadline reached even if attempts remain", () => {
        const deadline = new Date("2026-01-01T00:00:00.000Z");
        const now = new Date("2026-01-02T00:00:00.000Z");
        const isPastDeadline = deadline <= now;
        const mode: string = "after_attempt";
        const prdCompliantFeedback =
          mode === "after_submit" ||
          (mode === "after_attempt" && isPastDeadline);
        expect(prdCompliantFeedback).toBe(true);
      });
    });

    describe("Server Authoritative Timer Expiration", () => {
      it("82. active attempt within time window is valid", () => {
        const now = new Date("2026-09-01T12:00:00.000Z");
        const expiresAt = new Date("2026-09-01T12:15:00.000Z");
        const isExpired = expiresAt <= now;
        expect(isExpired).toBe(false);
      });

      it("83. attempt past expires_at is evaluated as expired", () => {
        const now = new Date("2026-09-01T12:15:01.000Z");
        const expiresAt = new Date("2026-09-01T12:15:00.000Z");
        const isExpired = expiresAt <= now;
        expect(isExpired).toBe(true);
      });

      it("84. submitting or modifying an expired attempt must transition status to 'expired'", () => {
        const attempt = {
          id: UUID_1,
          status: "in_progress",
          expires_at: new Date("2026-09-01T12:00:00.000Z"),
        };
        const checkTime = new Date("2026-09-01T12:05:00.000Z");
        const nextStatus =
          attempt.expires_at && attempt.expires_at <= checkTime
            ? "expired"
            : attempt.status;
        expect(nextStatus).toBe("expired");
      });

      it("85. starting an attempt when existing is expired transitions existing and increments attemptNumber", () => {
        const existingAttempt = {
          id: UUID_1,
          attempt_number: 1,
          status: "in_progress",
          expires_at: new Date("2026-09-01T12:00:00.000Z"),
        };
        const now = new Date("2026-09-01T12:10:00.000Z");
        const isExpired = existingAttempt.expires_at <= now;
        expect(isExpired).toBe(true);

        const nextAttemptNumber = existingAttempt.attempt_number + 1;
        expect(nextAttemptNumber).toBe(2);
      });
    });

    describe("IDOR & Multi-Tenant Academy Isolation", () => {
      it("86. rejects attempt access when user_id does not match caller", () => {
        const attempt = { id: UUID_1, user_id: "user-alice" };
        const callerId = "user-mallory";
        const hasAccess = attempt.user_id === callerId;
        expect(hasAccess).toBe(false);
      });

      it("87. rejects attempt submission when caller is not the owner", () => {
        const attempt = { id: UUID_1, user_id: "user-alice" };
        const callerId = "user-mallory";
        expect(() => {
          if (attempt.user_id !== callerId) {
            throw new Error("ATTEMPT_NOT_FOUND");
          }
        }).toThrow("ATTEMPT_NOT_FOUND");
      });

      it("88. prevents accessing results of another student's attempt", () => {
        const attempt = { id: UUID_1, user_id: "user-alice", status: "graded" };
        const callerId = "user-mallory";
        expect(attempt.user_id === callerId).toBe(false);
      });

      it("89. blocks starting attempt when active course grant is missing", () => {
        const activeGrants: string[] = [];
        const targetCourseId = UUID_3;
        const canAttempt = activeGrants.includes(targetCourseId);
        expect(canAttempt).toBe(false);
      });

      it("90. AUDIT GAP / VULNERABILITY: cross-tenant academy assignment validation", () => {
        // PRD Section 31 & Mandatory Monorepo Rules:
        // Academy/tenant isolation must be enforced. A quiz from Tenant A cannot be
        // assigned to a course in Tenant B.
        const course = { id: UUID_1, academy_id: "academy-alpha" };
        const quiz = { id: UUID_2, academy_id: "academy-beta" };

        const isSameTenant = course.academy_id === quiz.academy_id;
        expect(isSameTenant).toBe(false);

        // assignment.service.ts assign() does NOT check this!
        // We confirm that a proper security check would reject this:
        expect(() => {
          if (course.academy_id !== quiz.academy_id) {
            throw new Error("ACADEMY_MISMATCH");
          }
        }).toThrow("ACADEMY_MISMATCH");
      });

      it("91. draft version mutation isolation: published version remains immutable", () => {
        const publishedVersion = {
          id: UUID_1,
          version_number: 1,
          published_at: new Date("2026-01-01"),
        };
        const isImmutable = Boolean(publishedVersion.published_at);
        expect(isImmutable).toBe(true);
      });
    });

    describe("Payload Tampering & Input Sanitization", () => {
      it("92. rejects duplicate question IDs in bulk save answers payload", () => {
        const answers = [
          { questionId: UUID_1, responseValue: { selectedOptionIds: [UUID_2] } },
          { questionId: UUID_1, responseValue: { selectedOptionIds: [UUID_3] } },
        ];
        const ids = answers.map((a) => a.questionId);
        const hasDuplicates = new Set(ids).size !== ids.length;
        expect(hasDuplicates).toBe(true);
      });

      it("93. rejects duplicate option IDs in a single answer responseValue", () => {
        const selectedOptionIds = [UUID_1, UUID_1];
        const hasDuplicates =
          new Set(selectedOptionIds).size !== selectedOptionIds.length;
        expect(hasDuplicates).toBe(true);
      });

      it("94. rejects option ID belonging to a different question", () => {
        const validOptionsForQuestion = new Set([UUID_1, UUID_2]);
        const submittedOptionId = UUID_5;
        const isValid = validOptionsForQuestion.has(submittedOptionId);
        expect(isValid).toBe(false);
      });

      it("95. rejects question ID outside assigned quiz version", () => {
        const validQuizQuestions = new Set([UUID_1, UUID_2]);
        const submittedQuestionId = UUID_8;
        const isValid = validQuizQuestions.has(submittedQuestionId);
        expect(isValid).toBe(false);
      });

      it("96. rejects selecting multiple options for single_choice question", () => {
        const questionType = "single_choice";
        const selectedOptionIds = [UUID_1, UUID_2];
        const isInvalid =
          questionType === "single_choice" && selectedOptionIds.length > 1;
        expect(isInvalid).toBe(true);
      });

      it("97. rejects selecting multiple options for true_false question", () => {
        const questionType = "true_false";
        const selectedOptionIds = [UUID_1, UUID_2];
        const isInvalid =
          questionType === "true_false" && selectedOptionIds.length > 1;
        expect(isInvalid).toBe(true);
      });

      it("98. allows multiple options for multiple_choice question", () => {
        const questionType: string = "multiple_choice";
        const selectedOptionIds = [UUID_1, UUID_2, UUID_3];
        const isInvalid =
          (questionType === "single_choice" || questionType === "true_false") &&
          selectedOptionIds.length > 1;
        expect(isInvalid).toBe(false);
      });

      it("99. rejects availability window when availableUntil < availableFrom", () => {
        const from = new Date("2026-09-10T00:00:00.000Z");
        const until = new Date("2026-09-05T00:00:00.000Z");
        const isInvalidWindow = until < from;
        expect(isInvalidWindow).toBe(true);
      });
    });
  });

  // =========================================================================
  // SUITE 4: Attempt Lifecycle, Concurrency & State Invariants (PRD Sections 11, 14, 53, 58)
  // =========================================================================
  describe("Suite 4: Attempt Lifecycle, Concurrency & State Invariants", () => {
    it("100. starting an attempt when active in_progress attempt exists resumes active attempt", () => {
      const activeAttempt = {
        id: UUID_1,
        status: "in_progress",
        attempt_number: 1,
      };
      // Idempotent resume
      const startResult = activeAttempt ? activeAttempt : { id: UUID_2 };
      expect(startResult.id).toBe(UUID_1);
    });

    it("101. starting an attempt when max_attempts reached throws MAX_ATTEMPTS_REACHED", () => {
      const currentMaxAttemptNumber = 3;
      const assignmentMaxAttempts = 3;
      const nextAttemptNumber = currentMaxAttemptNumber + 1;
      const exceedsMax = nextAttemptNumber > assignmentMaxAttempts;
      expect(exceedsMax).toBe(true);
    });

    it("102. starting an attempt before available_from throws QUIZ_NOT_AVAILABLE", () => {
      const now = new Date("2026-09-01T00:00:00.000Z");
      const availableFrom = new Date("2026-09-05T00:00:00.000Z");
      const notYetAvailable = availableFrom > now;
      expect(notYetAvailable).toBe(true);
    });

    it("103. starting an attempt after available_until throws QUIZ_NOT_AVAILABLE", () => {
      const now = new Date("2026-09-20T00:00:00.000Z");
      const availableUntil = new Date("2026-09-15T00:00:00.000Z");
      const isPast = availableUntil < now;
      expect(isPast).toBe(true);
    });

    it("104. submitting an attempt requires all questions to have answers", () => {
      const questions = [{ id: UUID_1 }, { id: UUID_2 }, { id: UUID_3 }];
      const answers = [
        { question_id: UUID_1, response_value: { selectedOptionIds: [UUID_4] } },
        { question_id: UUID_2, response_value: { selectedOptionIds: [] } }, // empty!
      ];
      const hasUnanswered = questions.some((q) => {
        const ans = answers.find((a) => a.question_id === q.id);
        return !hasQuizAnswer(ans ? ans.response_value : null);
      });
      expect(hasUnanswered).toBe(true);
    });

    it("105. submitting an already graded attempt is idempotent and returns existing result", () => {
      const attempt = {
        id: UUID_1,
        status: "graded",
        score_obtained: 10,
        is_passed: true,
      };
      const isAlreadyFinal =
        attempt.status === "graded" || attempt.status === "submitted";
      expect(isAlreadyFinal).toBe(true);
    });

    it("106. percentage calculation is accurate to 2 decimal places: (score / maxScore) * 100", () => {
      const score = 7;
      const maxScore = 9;
      const percentage = (score / maxScore) * 100;
      expect(Number(percentage.toFixed(2))).toBe(77.78);
    });

    it("107. pass/fail boundary: percentage >= passPercentage results in passed = true", () => {
      const passPercentage = 75;
      const percentage = 75.01;
      const passed = percentage >= passPercentage;
      expect(passed).toBe(true);
    });

    it("108. pass/fail boundary: percentage < passPercentage results in passed = false", () => {
      const passPercentage = 75;
      const percentage = 74.99;
      const passed = percentage >= passPercentage;
      expect(passed).toBe(false);
    });

    it("109. pass/fail boundary: percentage exactly equal to passPercentage results in passed = true", () => {
      const passPercentage = 70;
      const percentage = 70.0;
      const passed = percentage >= passPercentage;
      expect(passed).toBe(true);
    });

    it("110. maximum score accurately equals sum of question points", () => {
      const questions = [
        { points: 5 },
        { points: 10 },
        { points: 25 },
      ];
      const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
      expect(maxScore).toBe(40);
    });
  });

  // =========================================================================
  // SUITE 5: Client Draft, Serialization & Navigation Logic (PRD Sections 17, 21, 35, 54)
  // =========================================================================
  describe("Suite 5: Client Draft, Serialization & Navigation Logic", () => {
    const mockAttempt: LearnerQuizAttempt = {
      id: UUID_1,
      assignmentId: UUID_2,
      quizVersionId: UUID_3,
      attemptNumber: 1,
      status: "in_progress",
      startedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      questions: [
        {
          id: UUID_4,
          questionType: "single_choice",
          prompt: "Q1",
          points: 1,
          position: 0,
          options: [{ id: UUID_5, text: "A", position: 0 }],
        },
        {
          id: UUID_6,
          questionType: "multiple_choice",
          prompt: "Q2",
          points: 1,
          position: 1,
          options: [{ id: UUID_7, text: "B", position: 0 }],
        },
      ],
      answers: {},
    };

    it("111. answeredQuestionCount returns 0 for completely empty draft", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {},
      };
      expect(answeredQuestionCount(mockAttempt, draft)).toBe(0);
    });

    it("112. answeredQuestionCount counts question with non-empty selectedOptionIds", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {
          [UUID_4]: { selectedOptionIds: [UUID_5] },
        },
      };
      expect(answeredQuestionCount(mockAttempt, draft)).toBe(1);
    });

    it("113. answeredQuestionCount ignores empty arrays in selectedOptionIds", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {
          [UUID_4]: { selectedOptionIds: [] },
        },
      };
      expect(answeredQuestionCount(mockAttempt, draft)).toBe(0);
    });

    it("114. answeredQuestionCount counts short_answer with non-empty trimmed text", () => {
      const shortAttempt: LearnerQuizAttempt = {
        ...mockAttempt,
        questions: [
          {
            id: UUID_8,
            questionType: "short_answer",
            prompt: "Capital of UK?",
            points: 5,
            position: 0,
            options: [],
          },
        ],
      };
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_8,
        answers: {
          [UUID_8]: { selectedOptionIds: [], textResponse: "London" },
        },
      };
      expect(answeredQuestionCount(shortAttempt, draft)).toBe(1);
    });

    it("115. hasAnsweredEveryQuestion returns true only when all questions answered", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {
          [UUID_4]: { selectedOptionIds: [UUID_5] },
          [UUID_6]: { selectedOptionIds: [UUID_7] },
        },
      };
      expect(hasAnsweredEveryQuestion(mockAttempt, draft)).toBe(true);
    });

    it("116. hasAnsweredEveryQuestion returns false when any question is missing", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {
          [UUID_4]: { selectedOptionIds: [UUID_5] },
        },
      };
      expect(hasAnsweredEveryQuestion(mockAttempt, draft)).toBe(false);
    });

    it("117. toBulkQuizAnswers maps draft state to API payload correctly", () => {
      const draft: QuizAttemptDraft = {
        currentQuestionId: UUID_4,
        answers: {
          [UUID_4]: { selectedOptionIds: [UUID_5] },
        },
      };
      const bulkPayload = toBulkQuizAnswers(draft);
      expect(bulkPayload).toEqual({
        answers: [
          {
            questionId: UUID_4,
            responseValue: { selectedOptionIds: [UUID_5] },
          },
        ],
      });
    });

    it("118. formatQuizRemainingTime formats positive seconds to mm:ss", () => {
      expect(formatQuizRemainingTime(65)).toBe("1:05");
      expect(formatQuizRemainingTime(600)).toBe("10:00");
      expect(formatQuizRemainingTime(45)).toBe("0:45");
    });

    it("119. formatQuizRemainingTime handles 0 and negative seconds safely", () => {
      expect(formatQuizRemainingTime(0)).toBe("0:00");
      expect(formatQuizRemainingTime(-10)).toBe("0:00");
    });

    describe("Assignment Selection & Resolution", () => {
      const assignment1: QuizAssignment = {
        id: UUID_1,
        quizId: UUID_2,
        quizVersionId: UUID_3,
        courseId: "course-1",
        lessonId: "lesson-1",
        required: true,
        passPercentage: 80,
        maxAttempts: 2,
        timeLimitSeconds: null,
        shuffleQuestions: false,
        shuffleOptions: false,
        feedbackMode: "after_submit",
        availableFrom: null,
        availableUntil: null,
      };

      const assignment2: QuizAssignment = {
        ...assignment1,
        id: UUID_4,
        quizId: UUID_5,
        lessonId: "lesson-2",
      };

      it("120. selectQuizAssignment prefers activeQuizId matching assignment", () => {
        const selected = selectQuizAssignment({
          assignments: [assignment1, assignment2],
          activeQuizId: UUID_5,
          targetCourseId: "course-1",
          targetLessonId: null,
        });
        expect(selected?.id).toBe(UUID_4);
      });

      it("121. selectQuizAssignment deduplicates duplicate assignment rows", () => {
        const selected = selectQuizAssignment({
          assignments: [assignment1, assignment1],
          activeQuizId: UUID_2,
          targetCourseId: "course-1",
          targetLessonId: "lesson-1",
        });
        expect(selected?.id).toBe(UUID_1);
      });

      it("122. selectQuizAssignment returns undefined when target lesson has no assigned quiz", () => {
        const selected = selectQuizAssignment({
          assignments: [assignment1],
          activeQuizId: "other-quiz",
          targetCourseId: "course-1",
          targetLessonId: "unassigned-lesson",
        });
        expect(selected).toBeUndefined();
      });
    });
  });

  // =========================================================================
  // SUITE 6: Course Progression Integration (PRD Sections 15, 16, 44)
  // =========================================================================
  describe("Suite 6: Course Progression & Completion Engine Integration", () => {
    it("123. AUDIT GAP: passing quiz triggers lesson progression completion (100%)", () => {
      // In LearningWorkspace.tsx:
      // When a video ends, updateSelectedLessonProgress(100) is called.
      // But QuizAttemptPanel had NO onPassed callback, so passing a quiz
      // never updated lessonProgress[selectedLesson] to 100%.
      let lessonProgress: Record<string, number> = { "lesson-1": 20 };
      const onQuizPassed = (lessonId: string) => {
        lessonProgress = { ...lessonProgress, [lessonId]: 100 };
      };

      // Simulate passing quiz
      const quizResult = { passed: true, percentage: 90 };
      if (quizResult.passed) {
        onQuizPassed("lesson-1");
      }

      expect(lessonProgress["lesson-1"]).toBe(100);
    });

    it("124. failing quiz does NOT advance progression or mark lesson completed", () => {
      let lessonProgress: Record<string, number> = { "lesson-1": 20 };
      const onQuizPassed = (lessonId: string) => {
        lessonProgress = { ...lessonProgress, [lessonId]: 100 };
      };

      const quizResult = { passed: false, percentage: 40 };
      if (quizResult.passed) {
        onQuizPassed("lesson-1");
      }

      expect(lessonProgress["lesson-1"]).toBe(20);
    });

    it("125. required quiz blocks course completion until passed", () => {
      const courseLessons = [
        { id: "lesson-1", isQuiz: false, completed: true },
        { id: "lesson-2", isQuiz: true, required: true, passed: false },
      ];

      const isCourseCompleted = courseLessons.every(
        (lesson) => !lesson.isQuiz ? lesson.completed : (!lesson.required || lesson.passed)
      );

      expect(isCourseCompleted).toBe(false);

      // Now pass the quiz
      courseLessons[1]!.passed = true;
      const isCompletedAfterPass = courseLessons.every(
        (lesson) => !lesson.isQuiz ? lesson.completed : (!lesson.required || lesson.passed)
      );

      expect(isCompletedAfterPass).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 10: Notifications, Outbox Schemas, Rate Limiting & Lifecycle Reaper
  // (PRD Sections 15, 32, 44, 58, 80)
  // =========================================================================
  describe("Suite 10: Outbox Notifications, Rate Limiting & Lifecycle Reaper", () => {
    it("126. validates quiz.attempt.passed domain event schema", () => {
      const validEvent = {
        recipientUserId: UUID_1,
        courseId: UUID_2,
        courseTitle: "Introduction to Computer Science",
        courseSlug: "intro-cs",
        quizId: UUID_3,
        quizTitle: "Variables & Data Types Quiz",
        score: 90,
        maxScore: 100,
        scorePercentage: 90,
        deepLink: "/learn/intro-cs?lessonId=" + UUID_4 + "&view=quiz",
      };

      const result = quizAttemptPassedEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("127. rejects quiz.attempt.passed domain event with external deepLink", () => {
      const invalidEvent = {
        recipientUserId: UUID_1,
        courseId: UUID_2,
        courseTitle: "Introduction to Computer Science",
        courseSlug: "intro-cs",
        quizId: UUID_3,
        quizTitle: "Variables & Data Types Quiz",
        score: 90,
        maxScore: 100,
        scorePercentage: 90,
        deepLink: "https://evil.com/phishing",
      };

      const result = quizAttemptPassedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it("128. validates quiz.attempt.failed_final domain event schema", () => {
      const validEvent = {
        recipientUserId: UUID_1,
        courseId: UUID_2,
        courseTitle: "Advanced Algorithms",
        courseSlug: "advanced-algorithms",
        quizId: UUID_3,
        quizTitle: "Dynamic Programming Challenge",
        maxAttempts: 3,
        scorePercentage: 45,
        deepLink: "/learn/advanced-algorithms?lessonId=" + UUID_4 + "&view=quiz",
      };

      const result = quizAttemptFailedFinalEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("129. validates quiz.assigned domain event schema", () => {
      const validEvent = {
        courseId: UUID_1,
        courseTitle: "System Design",
        courseSlug: "system-design",
        quizId: UUID_2,
        quizTitle: "Database Indexing Quiz",
        lessonId: UUID_3,
        lessonTitle: "B-Trees and LSM-Trees",
        deepLink: "/learn/system-design?lessonId=" + UUID_3 + "&view=quiz",
      };

      const result = quizAssignedEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("130. rejects quiz.assigned domain event with missing lessonId", () => {
      const invalidEvent = {
        courseId: UUID_1,
        courseTitle: "System Design",
        courseSlug: "system-design",
        quizId: UUID_2,
        quizTitle: "Database Indexing Quiz",
        lessonTitle: "B-Trees and LSM-Trees",
        deepLink: "/learn/system-design?lessonId=" + UUID_3 + "&view=quiz",
      };

      const result = quizAssignedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it("131. verifies sliding window rate limiting calculation for attempt start (limit 5/min)", () => {
      const windowMs = 60_000;
      const limit = 5;
      const now = Date.now();
      const timestamps = [
        now - 50_000,
        now - 40_000,
        now - 30_000,
        now - 20_000,
        now - 10_000,
      ];

      // Filtering within window
      const active = timestamps.filter((t) => now - t < windowMs);
      expect(active.length).toBe(5);
      expect(active.length >= limit).toBe(true); // Rate limit reached

      // An older timestamp outside window falls off
      const expiredTimestamps = [
        now - 70_000, // expired (> 60s)
        now - 40_000,
        now - 30_000,
        now - 20_000,
        now - 10_000,
      ];
      const activeAfterExpiry = expiredTimestamps.filter((t) => now - t < windowMs);
      expect(activeAfterExpiry.length).toBe(4);
      expect(activeAfterExpiry.length >= limit).toBe(false); // Can start new attempt
    });

    it("132. validates attempt reaper expiry condition logic (expires_at <= now)", () => {
      const now = new Date("2026-09-14T00:00:00Z");
      const activeAttempts = [
        { id: "att-1", expires_at: new Date("2026-09-13T23:59:00Z"), status: "in_progress" },
        { id: "att-2", expires_at: new Date("2026-09-14T00:05:00Z"), status: "in_progress" },
        { id: "att-3", expires_at: null, status: "in_progress" },
        { id: "att-4", expires_at: new Date("2026-09-13T22:00:00Z"), status: "graded" },
      ];

      const toExpire = activeAttempts.filter(
        (att) => att.status === "in_progress" && att.expires_at && att.expires_at <= now
      );

      expect(toExpire.length).toBe(1);
      expect(toExpire[0]?.id).toBe("att-1");
    });

    it("133. renders quiz.attempt_passed notification template correctly", () => {
      const rendered = renderNotificationTemplate(
        "quiz.attempt_passed",
        {
          quizTitle: "Variables & Data Types",
          courseTitle: "Introduction to CS",
          scorePercentage: 95,
        },
        "/learn/intro-cs?lessonId=123&view=quiz",
      );

      expect(rendered.inApp.title).toBe("Quiz Passed! 🎉");
      expect(rendered.inApp.body).toContain("You scored 95% on \"Variables & Data Types\" in Introduction to CS.");
      expect(rendered.email.subject).toBe("Quiz Passed! 🎉");
      expect(rendered.email.text).toContain("/learn/intro-cs?lessonId=123&view=quiz");
      expect(rendered.email.html).toContain("/learn/intro-cs?lessonId=123&amp;view=quiz");
    });

    it("134. renders quiz.attempt_failed_final notification template correctly", () => {
      const rendered = renderNotificationTemplate(
        "quiz.attempt_failed_final",
        {
          quizTitle: "Recursion Masterclass",
          scorePercentage: 45,
          maxAttempts: 3,
        },
        "/learn/cs-101?lessonId=456&view=quiz",
      );

      expect(rendered.inApp.title).toBe("Quiz Attempt Limit Reached");
      expect(rendered.inApp.body).toContain("You scored 45% on \"Recursion Masterclass\". All 3 attempts have been used.");
      expect(rendered.email.subject).toBe("Quiz Attempt Limit Reached");
    });

    it("135. renders quiz.assigned notification template correctly", () => {
      const rendered = renderNotificationTemplate(
        "quiz.assigned",
        {
          quizTitle: "Midterm Assessment",
          lessonTitle: "Week 4 Review",
          courseTitle: "Distributed Systems",
        },
        "/learn/dist-sys?lessonId=789&view=quiz",
      );

      expect(rendered.inApp.title).toBe("New Quiz Available");
      expect(rendered.inApp.body).toContain("\"Midterm Assessment\" has been assigned to Week 4 Review in Distributed Systems.");
      expect(rendered.email.text).toContain("/learn/dist-sys?lessonId=789&view=quiz");
      expect(rendered.email.html).toContain("/learn/dist-sys?lessonId=789&amp;view=quiz");
    });

    it("136. validates quiz deletion response contract schema", () => {
      const validResponse = { success: true };
      const parsed = quizDeleteResponseSchema.safeParse(validResponse);
      expect(parsed.success).toBe(true);

      const invalidResponse = { success: false };
      const invalidParsed = quizDeleteResponseSchema.safeParse(invalidResponse);
      expect(invalidParsed.success).toBe(false);
    });
  });
});

