import type { QuizResponseValue } from "@veolms/contracts";
import { gradeQuizQuestion } from "../shared/quiz.grading.ts";

type FeedbackMode = "after_submit" | "after_attempt" | "never";

interface ResultAttempt {
  id: string;
  attempt_number: number;
  status: "in_progress" | "submitted" | "graded" | "expired";
  score_obtained: number | null;
  max_score: number | null;
  score_percentage: number | null;
  is_passed: boolean | null;
}
interface ResultAssignment {
  feedback_mode: FeedbackMode;
  max_attempts: number;
  available_until: Date | null;
}
interface ResultQuestion {
  id: string;
  question_type: string;
  points: number;
  prompt?: string;
  explanation?: string | null;
}
interface ResultOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
}
interface ResultAnswer {
  question_id: string;
  response_value: unknown;
  is_correct: boolean | null;
  points_awarded: number | null;
}

/** How much of an attempt's outcome its learner is shown. */
export interface ResultScope {
  /** The result lists each answer with whether it was right. */
  includeFeedback: boolean;
  /** The correct answers and explanations are shown as well. */
  revealAnswers: boolean;
}

export function shouldRevealAnswers(
  feedbackMode: string,
  attemptNumber: number,
  maxAttempts: number,
  availableUntil: Date | null,
  now: Date = new Date(),
) {
  if (feedbackMode === "after_submit") return true;
  if (feedbackMode === "after_attempt") {
    return (
      attemptNumber >= maxAttempts ||
      Boolean(availableUntil && availableUntil <= now)
    );
  }
  return false;
}

export function resultScope(
  attempt: Pick<ResultAttempt, "status" | "attempt_number">,
  assignment: ResultAssignment,
  now: Date = new Date(),
): ResultScope {
  return {
    includeFeedback:
      assignment.feedback_mode !== "never" && attempt.status !== "in_progress",
    revealAnswers: shouldRevealAnswers(
      assignment.feedback_mode,
      attempt.attempt_number,
      assignment.max_attempts,
      assignment.available_until,
      now,
    ),
  };
}

/**
 * The wire shape of an attempt's result (`quizResultSchema`). The caller
 * supplies only what `scope` allows: no answers at all when feedback is off,
 * and no explanations while the correct answers are still withheld.
 */
export function presentAttemptResult(input: {
  attempt: ResultAttempt;
  assignment: ResultAssignment;
  scope: ResultScope;
  questions: readonly ResultQuestion[];
  options: readonly ResultOption[];
  answers: readonly ResultAnswer[];
}) {
  const { attempt, assignment, scope, questions, options, answers } = input;
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attempt_number,
    score: Number(attempt.score_obtained ?? 0),
    maxScore: Number(
      attempt.max_score ??
        questions.reduce((sum, question) => sum + Number(question.points), 0),
    ),
    percentage: Number(attempt.score_percentage ?? 0),
    passed: Boolean(attempt.is_passed),
    status: attempt.status,
    feedbackMode: assignment.feedback_mode,
    ...(scope.includeFeedback
      ? {
          // In question order, so the response to a submit and a later read
          // of the same result list the answers identically.
          answers: questions.flatMap((question) => {
            const answer = answers.find(
              (item) => item.question_id === question.id,
            );
            if (!answer) return [];
            const response = answer.response_value as QuizResponseValue;
            const selected = response.selectedOptionIds ?? [];
            const textResponse = response.textResponse ?? null;
            const questionOptions = options.filter(
              (option) => option.question_id === question.id,
            );
            const correctOptions = questionOptions.filter(
              (option) => option.is_correct,
            );
            // A short answer has no key. Questions written before it
            // became a free response may still hold accepted answers;
            // they are not a "correct answer" to show.
            const correctTexts =
              question.question_type === "short_answer"
                ? []
                : correctOptions.map((option) => option.option_text);
            const graded = gradeQuizQuestion({
              questionType: question.question_type,
              points: Number(question.points),
              selectedOptionIds: selected,
              correctOptionIds: correctOptions.map((option) => option.id),
              textResponse,
            });
            return [
              {
                questionId: question.id,
                prompt: question.prompt ?? "",
                selectedOptionTexts: questionOptions
                  .filter((option) => selected.includes(option.id))
                  .map((option) => option.option_text),
                correctOptionTexts: scope.revealAnswers ? correctTexts : [],
                textResponse,
                isCorrect: Boolean(answer.is_correct ?? graded.isCorrect),
                pointsAwarded: Number(
                  answer.points_awarded ?? graded.pointsAwarded,
                ),
                explanation: scope.revealAnswers
                  ? (question.explanation ?? null)
                  : null,
              },
            ];
          }),
        }
      : {}),
  };
}
