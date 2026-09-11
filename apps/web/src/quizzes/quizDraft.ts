import type {
  BulkQuizAnswersRequest,
  LearnerQuizAttempt,
  QuizResponseValue,
} from "@veolms/contracts";

export interface QuizAttemptDraft {
  answers: Record<string, QuizResponseValue>;
  currentQuestionId: string | null;
}

export function answeredQuestionCount(
  attempt: LearnerQuizAttempt,
  draft: QuizAttemptDraft,
) {
  return attempt.questions.filter(
    (question) =>
      (draft.answers[question.id]?.selectedOptionIds.length ?? 0) > 0,
  ).length;
}

export function hasAnsweredEveryQuestion(
  attempt: LearnerQuizAttempt,
  draft: QuizAttemptDraft,
) {
  return answeredQuestionCount(attempt, draft) === attempt.questions.length;
}

/** The only payload shape used by the attempt autosync boundary. */
export function toBulkQuizAnswers(
  draft: QuizAttemptDraft,
): BulkQuizAnswersRequest {
  return {
    answers: Object.entries(draft.answers).map(
      ([questionId, responseValue]) => ({
        questionId,
        responseValue,
      }),
    ),
  };
}

export function formatQuizRemainingTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
