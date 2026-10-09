import type {
  BulkQuizAnswersRequest,
  LearnerQuizAttempt,
  QuizResponseValue,
} from "@veolms/contracts";

export interface QuizAttemptDraft {
  answers: Record<string, QuizResponseValue>;
  currentQuestionId: string | null;
}

export function isQuestionAnswered(
  question: LearnerQuizAttempt["questions"][number],
  draft: QuizAttemptDraft,
) {
  const answer = draft.answers[question.id];
  if (!answer) return false;
  if (question.questionType === "short_answer") {
    return Boolean(
      answer.textResponse && answer.textResponse.trim().length > 0,
    );
  }
  return (answer.selectedOptionIds?.length ?? 0) > 0;
}

export function answeredQuestionCount(
  attempt: LearnerQuizAttempt,
  draft: QuizAttemptDraft,
) {
  return attempt.questions.filter((question) =>
    isQuestionAnswered(question, draft),
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

/**
 * How far the server's clock is ahead of this device's, from the server
 * time sent with the attempt and the moment that response arrived. Zero
 * when either is missing.
 */
export function serverClockOffsetMs(
  serverNow: string | undefined,
  receivedAtMs: number,
) {
  const serverNowMs = serverNow ? Date.parse(serverNow) : Number.NaN;
  return Number.isFinite(serverNowMs) && receivedAtMs > 0
    ? serverNowMs - receivedAtMs
    : 0;
}

export function formatQuizRemainingTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
