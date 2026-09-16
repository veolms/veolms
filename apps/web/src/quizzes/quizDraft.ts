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
  return attempt.questions.filter((question) => {
    const answer = draft.answers[question.id];
    if (!answer) return false;
    if (question.questionType === "short_answer") {
      return Boolean(
        answer.textResponse && answer.textResponse.trim().length > 0,
      );
    }
    return (answer.selectedOptionIds?.length ?? 0) > 0;
  }).length;
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
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

