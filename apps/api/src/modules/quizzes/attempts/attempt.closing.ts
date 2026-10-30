import type { QuizResponseValue } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import * as repo from "../shared/quiz.repository.ts";
import { gradeQuizQuestion, hasQuizAnswer } from "../shared/quiz.grading.ts";
import type { AssignmentRow } from "../shared/quiz.presenters.ts";
import { resultScope } from "./attempt.result.ts";

type AttemptRow = NonNullable<Awaited<ReturnType<typeof repo.findAttempt>>>;

/** Enough of a course to address the result notification. */
export interface AttemptCourse {
  id: string;
  title: string;
  slug: string;
}
export type FindAttemptCourse = (
  courseId: string,
) => Promise<AttemptCourse | undefined>;

/**
 * How long after the deadline an answer save is still accepted. The page
 * saves and submits as the countdown reaches zero; without this margin that
 * last save lost a race with the clock and the answers were thrown away.
 */
export const ANSWER_SAVE_GRACE_MS = 10_000;

/**
 * When an attempt stops accepting work: its own time limit or the
 * assignment's due date, whichever comes first. The due date used to be
 * checked only when an attempt was started, so an attempt opened before it
 * could be submitted at any time afterwards.
 */
export function attemptDeadline(
  attempt: Pick<AttemptRow, "expires_at">,
  assignment: Pick<AssignmentRow, "available_until">,
): Date | null {
  const limits = [attempt.expires_at, assignment.available_until].filter(
    (value): value is Date => value instanceof Date,
  );
  if (limits.length === 0) return null;
  return new Date(Math.min(...limits.map((value) => value.getTime())));
}

export function isPastDeadline(deadline: Date | null, now: Date, graceMs = 0) {
  return deadline !== null && deadline.getTime() + graceMs <= now.getTime();
}

/**
 * Grades a locked, in-progress attempt and records the outcome.
 *
 * `requireComplete` is the normal submit: every question must be answered.
 * Without it the attempt is being closed because time ran out, and whatever
 * the student saved is graded — unanswered questions score zero. An attempt
 * with nothing saved at all is marked "expired" instead of a zero-score fail.
 *
 * The caller must hold the row lock (`findAttemptForUpdate`) and have
 * checked that the attempt is still in progress.
 */
export async function gradeLockedAttempt(
  trx: Transaction<Database>,
  input: {
    attempt: AttemptRow;
    assignment: AssignmentRow;
    now: Date;
    submittedAt: Date;
    requireComplete: boolean;
    findCourse?: FindAttemptCourse;
  },
) {
  const { attempt, assignment, now, requireComplete } = input;
  // What the learner will be shown once this attempt is closed. Prompts and
  // explanations are read only if that result will carry them.
  const scope = resultScope(
    { status: "graded", attempt_number: attempt.attempt_number },
    assignment,
    now,
  );
  const questions = await repo.listGradingQuestions(
    trx,
    attempt.quiz_version_id,
    {
      prompt: scope.includeFeedback,
      explanation: scope.includeFeedback && scope.revealAnswers,
    },
  );
  const options = await repo.listKeyOptions(
    trx,
    questions.map((question) => question.id),
  );
  const answers = await repo.listAnswers(trx, attempt.id);
  const graded = questions.map((question) => {
    const answer = answers.find((item) => item.question_id === question.id);
    const response = answer
      ? (answer.response_value as QuizResponseValue)
      : null;
    const correctOptions = options.filter(
      (option) => option.question_id === question.id && option.is_correct,
    );
    const score = gradeQuizQuestion({
      questionType: question.question_type,
      points: Number(question.points),
      selectedOptionIds: response?.selectedOptionIds ?? [],
      correctOptionIds: correctOptions.map((option) => option.id),
      textResponse: response?.textResponse ?? null,
    });
    return { question, answer, answered: hasQuizAnswer(response), ...score };
  });

  if (requireComplete && graded.some((item) => !item.answered))
    throw new AppError(
      400,
      "ALL_QUESTIONS_REQUIRED",
      "Answer every Quiz question before submitting.",
    );
  if (!graded.some((item) => item.answered)) {
    const closed = await repo.updateAttempt(trx, attempt.id, {
      status: "expired",
    });
    return {
      outcome: "expired" as const,
      attempt: closed,
      scope,
      questions,
      options,
      answers,
    };
  }

  const maxScore = graded.reduce(
    (sum, item) => sum + Number(item.question.points),
    0,
  );
  const score = graded.reduce((sum, item) => sum + item.pointsAwarded, 0);
  const percentage = maxScore === 0 ? 0 : (score / maxScore) * 100;
  const passed = percentage >= Number(assignment.pass_percentage);
  await repo.upsertAnswers(
    trx,
    graded
      .filter((item) => item.answer)
      .map((item) => ({
        id: item.answer!.id,
        attempt_id: attempt.id,
        question_id: item.question.id,
        response_value: item.answer!.response_value,
        is_correct: item.isCorrect,
        points_awarded: item.pointsAwarded,
        time_spent_seconds: item.answer!.time_spent_seconds,
        created_at: item.answer!.created_at,
        updated_at: now,
      })),
  );
  const closed = await repo.updateAttempt(trx, attempt.id, {
    status: "graded",
    submitted_at: input.submittedAt,
    score_obtained: score,
    max_score: maxScore,
    score_percentage: percentage,
    is_passed: passed,
  });

  const course = await input.findCourse?.(assignment.course_id);
  // The quiz is only named in the notice, and no course means no notice.
  const quiz = course ? await repo.findQuiz(trx, assignment.quiz_id) : null;
  if (course && quiz) {
    const outbox = createOutboxService();
    const deepLink = `/learn/${course.slug}?lessonId=${assignment.lesson_id}&view=quiz`;
    if (passed) {
      await outbox.publish(trx, {
        type: "quiz.attempt.passed",
        version: 1,
        dedupeKey: `quiz:passed:${attempt.id}`,
        occurredAt: now,
        payload: {
          recipientUserId: attempt.user_id,
          courseId: course.id,
          courseTitle: course.title,
          courseSlug: course.slug,
          quizId: quiz.id,
          quizTitle: quiz.title,
          score,
          maxScore,
          scorePercentage: percentage,
          deepLink,
        },
      });
    } else if (attempt.attempt_number >= assignment.max_attempts) {
      await outbox.publish(trx, {
        type: "quiz.attempt.failed_final",
        version: 1,
        dedupeKey: `quiz:failed_final:${attempt.id}`,
        occurredAt: now,
        payload: {
          recipientUserId: attempt.user_id,
          courseId: course.id,
          courseTitle: course.title,
          courseSlug: course.slug,
          quizId: quiz.id,
          quizTitle: quiz.title,
          maxAttempts: assignment.max_attempts,
          scorePercentage: percentage,
          deepLink,
        },
      });
    }
  }
  return {
    outcome: "graded" as const,
    attempt: closed,
    scope,
    questions,
    options,
    // The answers as just graded, so the result needs no second read.
    answers: graded.flatMap((item) =>
      item.answer
        ? [
            {
              ...item.answer,
              is_correct: item.isCorrect,
              points_awarded: item.pointsAwarded,
            },
          ]
        : [],
    ),
  };
}
/** A closed attempt and everything its result is built from. */
export type GradedAttempt = Awaited<ReturnType<typeof gradeLockedAttempt>>;

/**
 * Closes attempts whose time is up. Every place that used to stamp an
 * overdue attempt "expired" — discarding the answers the student had saved
 * and consuming the attempt with no score — goes through here instead.
 */
export function createAttemptCloser(options: {
  database: Kysely<Database>;
  /** Omitted by the offline reaper, which then sends no result notice. */
  findCourse?: FindAttemptCourse;
}) {
  const { database, findCourse } = options;

  /**
   * Closes the attempt if it is in progress and past its deadline (plus
   * `graceMs`). Takes the row lock, so it cannot overwrite an attempt that
   * a concurrent submit has just graded. Returns the attempt as it now is.
   */
  async function closeIfOverdue(attemptId: string, now: Date, graceMs = 0) {
    return await database.transaction().execute(async (trx) => {
      const locked = await repo.findAttemptForUpdate(trx, attemptId);
      if (!locked || locked.status !== "in_progress") return locked;
      const assignment = await repo.findAssignment(trx, locked.assignment_id);
      if (!assignment) return locked;
      const deadline = attemptDeadline(locked, assignment);
      if (!deadline || !isPastDeadline(deadline, now, graceMs)) return locked;
      await gradeLockedAttempt(trx, {
        attempt: locked,
        assignment,
        now,
        submittedAt: deadline,
        requireComplete: false,
        findCourse,
      });
      return await repo.findAttempt(trx, attemptId);
    });
  }

  /** Closes abandoned attempts nobody came back to. */
  async function closeOverdueAttempts(now: Date = new Date(), limit = 500) {
    const overdue = await repo.listOverdueAttempts(
      database,
      new Date(now.getTime() - ANSWER_SAVE_GRACE_MS),
      limit,
    );
    const closed: typeof overdue = [];
    let failed = 0;
    for (const attempt of overdue) {
      try {
        const result = await closeIfOverdue(
          attempt.id,
          now,
          ANSWER_SAVE_GRACE_MS,
        );
        if (result && result.status !== "in_progress") closed.push(attempt);
      } catch {
        // One unreadable attempt must not stop the rest being closed.
        failed += 1;
      }
    }
    return { closed, failed };
  }

  return { closeIfOverdue, closeOverdueAttempts };
}
