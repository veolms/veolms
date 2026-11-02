import type {
  QuizAttemptStatus,
  QuizQuestionType,
  QuizResponseValue,
  QuizSubmission,
} from "@veolms/contracts";
import { gradeQuizQuestion, hasQuizAnswer } from "../shared/quiz.grading.ts";

interface SubmissionAttempt {
  id: string;
  attempt_number: number;
  status: QuizAttemptStatus;
  started_at: Date;
  submitted_at: Date | null;
  score_obtained: number | null;
  max_score: number | null;
  score_percentage: number | null;
}
interface SubmissionQuestion {
  id: string;
  question_type: QuizQuestionType;
  points: number;
  prompt?: string;
  explanation?: string | null;
}
interface SubmissionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
}
interface SubmissionAnswer {
  question_id: string;
  response_value: unknown;
  is_correct: boolean | null;
  points_awarded: number | null;
}

const isClosed = (status: QuizAttemptStatus) => status !== "in_progress";

/**
 * Passed or failed, by the same rule the assignment's analytics list uses
 * (the recorded percentage against the pass mark), so a submission never
 * disagrees with the row it was opened from. Null while still open.
 */
function outcome(
  attempt: Pick<SubmissionAttempt, "status" | "score_percentage">,
  passPercentage: number,
) {
  if (!isClosed(attempt.status)) return { percentage: null, passed: null };
  const percentage = Number(attempt.score_percentage ?? 0);
  return { percentage, passed: percentage >= Number(passPercentage) };
}

/** What an attempt is marked out of: its recorded maximum or its points. */
function maxScoreOf(
  attempt: Pick<SubmissionAttempt, "max_score">,
  questions: readonly SubmissionQuestion[],
) {
  return Number(
    attempt.max_score ??
      questions.reduce((sum, question) => sum + Number(question.points), 0),
  );
}

/**
 * The wire shape of a submission (`quizSubmissionSchema`). Stored grading
 * wins over a fresh one: imported attempts carry the marks their platform
 * gave, which can differ from what the current answer key would give.
 */
export function presentQuizSubmission(input: {
  assignment: { id: string; pass_percentage: number };
  quizTitle: string;
  lessonTitle: string | null;
  student: { id: string; name: string };
  /** Every attempt of the student on the assignment, newest first. */
  attempts: readonly SubmissionAttempt[];
  attempt: SubmissionAttempt;
  questions: readonly SubmissionQuestion[];
  options: readonly SubmissionOption[];
  answers: readonly SubmissionAnswer[];
}): QuizSubmission {
  const { assignment, attempt, questions, options, answers } = input;
  const closed = isClosed(attempt.status);
  // A submitted attempt always has its answers saved. One without any was
  // imported with its score and dates only (another platform's retake), so
  // its questions are neither unanswered nor wrong: their answers are
  // unknown. An attempt that expired before anything was saved is different:
  // nothing was answered.
  const answersRecorded =
    answers.length > 0 ||
    (attempt.status !== "graded" && attempt.status !== "submitted");
  /** Marks per question are shown for a closed attempt whose answers we have. */
  const marked = closed && answersRecorded;
  const answerByQuestion = new Map(
    answers.map((answer) => [answer.question_id, answer]),
  );

  const reviewed = questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const response = (answer?.response_value ??
      {}) as Partial<QuizResponseValue>;
    const selected = response.selectedOptionIds ?? [];
    const textResponse = response.textResponse ?? null;
    const isShortAnswer = question.question_type === "short_answer";
    // A short answer has no key. Questions written before it became a free
    // response may still hold accepted answers; they are not options.
    const questionOptions = isShortAnswer
      ? []
      : options.filter((option) => option.question_id === question.id);
    const graded = gradeQuizQuestion({
      questionType: question.question_type,
      points: Number(question.points),
      selectedOptionIds: selected,
      correctOptionIds: questionOptions
        .filter((option) => option.is_correct)
        .map((option) => option.id),
      textResponse,
    });
    const answered = hasQuizAnswer(response);
    return {
      id: question.id,
      questionType: question.question_type,
      prompt: question.prompt ?? "",
      points: Number(question.points),
      explanation: question.explanation ?? null,
      answered,
      textResponse,
      isCorrect: marked
        ? answer
          ? Boolean(answer.is_correct ?? graded.isCorrect)
          : false
        : null,
      pointsAwarded: marked
        ? answer
          ? Number(answer.points_awarded ?? graded.pointsAwarded)
          : 0
        : null,
      options: questionOptions.map((option) => ({
        id: option.id,
        text: option.option_text,
        isCorrect: option.is_correct,
        selected: selected.includes(option.id),
      })),
    };
  });

  const maxScore = maxScoreOf(attempt, questions);
  return {
    assignmentId: assignment.id,
    quizTitle: input.quizTitle,
    lessonTitle: input.lessonTitle,
    passPercentage: Number(assignment.pass_percentage),
    student: input.student,
    attempts: input.attempts.map((item) => ({
      id: item.id,
      attemptNumber: item.attempt_number,
      status: item.status,
      score: isClosed(item.status) ? Number(item.score_obtained ?? 0) : null,
      // The caller fills a missing maximum from the attempt's own version;
      // this attempt's questions are only a fallback for the one shown.
      maxScore: Number(
        item.max_score ??
          (item.id === attempt.id ? maxScoreOf(attempt, questions) : 0),
      ),
      ...outcome(item, assignment.pass_percentage),
      submittedAt: item.submitted_at?.toISOString() ?? null,
    })),
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      startedAt: attempt.started_at.toISOString(),
      submittedAt: attempt.submitted_at?.toISOString() ?? null,
      score: closed
        ? Number(
            attempt.score_obtained ??
              reviewed.reduce(
                (sum, question) => sum + (question.pointsAwarded ?? 0),
                0,
              ),
          )
        : null,
      maxScore,
      ...outcome(attempt, assignment.pass_percentage),
      answersRecorded,
      questionCount: reviewed.length,
      answeredCount: reviewed.filter((question) => question.answered).length,
      correctCount: marked
        ? reviewed.filter((question) => question.isCorrect).length
        : null,
      questions: reviewed,
    },
  };
}
