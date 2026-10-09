import crypto from "node:crypto";
import type {
  BulkQuizAnswersRequest,
  QuizResponseValue,
} from "@veolms/contracts";
import {
  hasUnsafeQuizAnswerContent,
  UNSAFE_QUIZ_ANSWER_MESSAGE,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import * as pricingRepo from "../shared/quiz-pricing.repository.ts";
import { resolveQuizCharge } from "../../commerce/pricing/quiz-pricing.amount.ts";
import type { AssignmentRow } from "../shared/quiz.presenters.ts";
import { isAdmin, type QuizServiceOptions } from "../shared/quiz.types.ts";
import { cleanQuizTextAnswer } from "../shared/quiz.text.ts";
import {
  ANSWER_SAVE_GRACE_MS,
  attemptDeadline,
  createAttemptCloser,
  gradeLockedAttempt,
  isPastDeadline,
  type GradedAttempt,
} from "./attempt.closing.ts";
import { presentAttemptResult, resultScope } from "./attempt.result.ts";

type AttemptRow = NonNullable<Awaited<ReturnType<typeof repo.findAttempt>>>;

/**
 * How many of a learner's most recent attempts their history returns. The
 * page lists the latest few and totals the rest; this only keeps one very
 * long history from being read in full on every visit.
 */
const ATTEMPT_HISTORY_LIMIT = 500;

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function stableShuffle<T extends { id: string }>(items: T[], seed: string) {
  return [...items].sort((left, right) => {
    const hashDifference =
      stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`);
    return hashDifference || left.id.localeCompare(right.id);
  });
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

const startAttemptTimestamps = new Map<string, number[]>();
const answerSaveTimestamps = new Map<string, number[]>();

function checkRateLimit(
  store: Map<string, number[]>,
  key: string,
  limit: number,
  windowMs: number,
  errorMessage: string,
) {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    throw new AppError(429, "RATE_LIMIT_EXCEEDED", errorMessage);
  }
  timestamps.push(now);
  store.set(key, timestamps);
}

export function createAttemptService(options: QuizServiceOptions) {
  const { database, accessService, courseService } = options;
  const findCourse = (courseId: string) =>
    courseService.findCourseById(courseId);
  const closer = createAttemptCloser({ database, findCourse });

  async function getAssignment(assignmentId: string) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment)
      throw new AppError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Quiz assignment not found.",
      );
    return assignment;
  }

  /**
   * The course and lesson an assignment sits in. Every rule below is decided
   * from these two rows, so they are read once per request and passed along.
   */
  async function loadPlacement(assignment: AssignmentRow) {
    const [course, lesson] = await Promise.all([
      courseService.findCourseById(assignment.course_id),
      courseService.findLessonById(assignment.course_id, assignment.lesson_id),
    ]);
    return { course, lesson };
  }
  type Placement = Awaited<ReturnType<typeof loadPlacement>>;

  /** Admins and the course's own creator may try a quiz without the checks. */
  function isCourseManager(
    placement: Placement,
    userId: string,
    roles: readonly string[],
  ) {
    return (
      isAdmin({ id: userId, roles }) || placement.course?.creator_id === userId
    );
  }

  /**
   * A quiz can be started only once its lesson and course are published.
   * Enrolled students could otherwise open a quiz the instructor was still
   * preparing — and, with feedback on, read its answers before release.
   * The course owner and admins may try it out beforehand. Reported as
   * "not found" so an unreleased quiz is not revealed.
   */
  function assertAssignmentReleased(
    placement: Placement,
    userId: string,
    roles: readonly string[],
  ) {
    if (isCourseManager(placement, userId, roles)) return;
    const { course, lesson } = placement;
    if (
      !course ||
      course.deleted_at ||
      course.status !== "published" ||
      !lesson?.is_published
    )
      throw new AppError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Quiz assignment not found.",
      );
  }

  /**
   * Course access and, for paid quizzes, the quiz pass. A quiz on a
   * free-preview lesson needs neither. A paid course quiz needs the
   * student's quiz pass for the course; one purchase unlocks every quiz in
   * it. Course owners and admins skip both checks.
   */
  async function assertAssignmentAccess(
    assignment: AssignmentRow,
    placement: Placement,
    userId: string,
    roles: readonly string[],
    accessMessage: string,
  ) {
    if (placement.lesson?.is_preview) return;
    if (isCourseManager(placement, userId, roles)) return;
    if (
      !(await repo.isPublishedFreeCourse(database, assignment.course_id)) &&
      !(await accessService.hasActiveAccess(
        database,
        userId,
        assignment.course_id,
      ))
    )
      throw new AppError(403, "COURSE_ACCESS_REQUIRED", accessMessage);
    const charge = resolveQuizCharge(
      await pricingRepo.findPricing(database, assignment.course_id),
    );
    if (!charge.isPaid) return;
    const grant = await pricingRepo.findActiveGrant(database, {
      userId,
      courseId: assignment.course_id,
      now: new Date(),
    });
    if (!grant)
      throw new AppError(
        403,
        "QUIZ_ENROLLMENT_REQUIRED",
        "Purchase the quiz pass for this course to start an attempt.",
      );
  }

  /**
   * The attempt as its learner works on it. Only what the page shows is
   * read: no answer key, no explanations, and not the authored position
   * that shuffling is meant to hide.
   */
  async function buildAttempt(attempt: AttemptRow, assignment: AssignmentRow) {
    const questions = await repo.listAttemptQuestions(
      database,
      attempt.quiz_version_id,
    );
    const [options, answers] = await Promise.all([
      repo.listAttemptOptions(
        database,
        questions
          .filter((question) => question.question_type !== "short_answer")
          .map((question) => question.id),
      ),
      repo.listAnswerResponses(database, attempt.id),
    ]);
    const presentedQuestions = assignment.shuffle_questions
      ? stableShuffle(questions, attempt.id)
      : questions;
    return {
      id: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      // The due date can end an attempt before its own time limit does.
      expiresAt: toIso(attemptDeadline(attempt, assignment)),
      // The countdown is measured against this, not the device clock.
      serverNow: new Date().toISOString(),
      questions: presentedQuestions.map((question) => {
        const questionOptions = options.filter(
          (option) => option.question_id === question.id,
        );
        return {
          id: question.id,
          questionType: question.question_type,
          prompt: question.prompt,
          points: Number(question.points),
          // A short answer's accepted texts are its key: never listed.
          options: (assignment.shuffle_options
            ? stableShuffle(questionOptions, attempt.id)
            : questionOptions
          ).map((option) => ({
            id: option.id,
            text: option.option_text,
          })),
        };
      }),
      answers: Object.fromEntries(
        answers.map((answer) => [
          answer.question_id,
          answer.response_value as QuizResponseValue,
        ]),
      ),
    };
  }

  async function start(
    userId: string,
    assignmentId: string,
    roles: readonly string[] = [],
  ) {
    const assignment = await getAssignment(assignmentId);
    const placement = await loadPlacement(assignment);
    assertAssignmentReleased(placement, userId, roles);
    await assertAssignmentAccess(
      assignment,
      placement,
      userId,
      roles,
      "You need active course access to take this Quiz.",
    );
    const version = await repo.findVersion(
      database,
      assignment.quiz_version_id,
    );
    if (!version?.published_at)
      throw new AppError(
        409,
        "QUIZ_VERSION_NOT_PUBLISHED",
        "The assigned Quiz version is not published.",
      );
    const existing = await repo.findActiveAttempt(
      database,
      assignmentId,
      userId,
    );
    if (existing) {
      const now = new Date();
      const stillOpen = !isPastDeadline(
        attemptDeadline(existing, assignment),
        now,
        ANSWER_SAVE_GRACE_MS,
      );
      if (stillOpen && existing.quiz_version_id === version.id)
        return buildAttempt(existing, assignment);
      if (stillOpen) {
        // Open on a version the assignment has since moved away from. The
        // move clears these out; this one was started while it happened.
        // It goes the same way, and a fresh attempt on the current version
        // is opened below under the same attempt number.
        await repo.deleteOpenAttemptsOnOtherVersions(
          database,
          assignmentId,
          version.id,
          now,
        );
      } else {
        // Time ran out on the previous attempt: grade what was saved
        // before a new attempt is opened.
        await closer.closeIfOverdue(existing.id, now, ANSWER_SAVE_GRACE_MS);
      }
    }
    checkRateLimit(
      startAttemptTimestamps,
      `${userId}:${assignmentId}`,
      5,
      60_000,
      "Too many attempt start requests. Please wait a moment.",
    );
    const now = new Date();
    if (assignment.available_from && assignment.available_from > now)
      throw new AppError(
        403,
        "QUIZ_NOT_AVAILABLE",
        "This Quiz is not available yet.",
      );
    if (assignment.available_until && assignment.available_until < now)
      throw new AppError(
        403,
        "QUIZ_NOT_AVAILABLE",
        "This Quiz is no longer available.",
      );
    const max = await repo.maxAttemptNumber(database, assignmentId, userId);
    const attemptNumber = Number(max?.max ?? 0) + 1;
    if (attemptNumber > assignment.max_attempts)
      throw new AppError(
        409,
        "MAX_ATTEMPTS_REACHED",
        "You have used all allowed Quiz attempts.",
      );
    try {
      const attempt = await repo.insertAttempt(database, {
        id: crypto.randomUUID(),
        assignment_id: assignmentId,
        quiz_version_id: version.id,
        user_id: userId,
        attempt_number: attemptNumber,
        status: "in_progress",
        started_at: now,
        expires_at: assignment.time_limit_seconds
          ? new Date(now.getTime() + assignment.time_limit_seconds * 1000)
          : null,
        submitted_at: null,
        score_obtained: null,
        max_score: null,
        score_percentage: null,
        is_passed: null,
        created_at: now,
        updated_at: now,
      });
      return buildAttempt(attempt, assignment);
    } catch (error) {
      // The partial unique index is the final concurrency guard. If another
      // request won the race to create the active attempt, resume that one.
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await repo.findActiveAttempt(
        database,
        assignmentId,
        userId,
      );
      if (concurrent) return buildAttempt(concurrent, assignment);
      throw error;
    }
  }

  /**
   * The caller's own attempt, still open for answers. An attempt whose time
   * is up is closed here — its saved answers graded — before the error.
   */
  async function requireOwnedActiveAttempt(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const attempt = await repo.findAttempt(database, attemptId);
    if (!attempt || attempt.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    const assignment = await getAssignment(attempt.assignment_id);
    await assertAssignmentAccess(
      assignment,
      await loadPlacement(assignment),
      userId,
      roles,
      "You need active course access to continue this Quiz.",
    );
    if (attempt.status !== "in_progress")
      throw new AppError(
        409,
        "ATTEMPT_NOT_ACTIVE",
        "This Quiz attempt is no longer active.",
      );
    const now = new Date();
    if (
      isPastDeadline(
        attemptDeadline(attempt, assignment),
        now,
        ANSWER_SAVE_GRACE_MS,
      )
    ) {
      await closer.closeIfOverdue(attemptId, now, ANSWER_SAVE_GRACE_MS);
      throw new AppError(
        409,
        "ATTEMPT_EXPIRED",
        "This Quiz attempt has expired.",
      );
    }
    return { attempt, assignment };
  }

  /**
   * An answer as it is stored: only the part its question type uses, and a
   * typed answer cleaned of what is not text (see quiz.text.ts). Option ids
   * sent with a short answer, or text sent with a choice, were stored as
   * they came.
   */
  function storedResponse(
    question: { question_type: string },
    response: QuizResponseValue,
  ): QuizResponseValue {
    return question.question_type === "short_answer"
      ? {
          selectedOptionIds: [],
          textResponse: cleanQuizTextAnswer(response.textResponse ?? ""),
        }
      : { selectedOptionIds: response.selectedOptionIds ?? [] };
  }

  function validateResponse(
    question: { question_type: string },
    response: QuizResponseValue,
    validOptionIds: Set<string>,
  ) {
    if (question.question_type === "short_answer") {
      if (
        response.textResponse !== undefined &&
        typeof response.textResponse !== "string"
      )
        throw new AppError(
          400,
          "INVALID_TEXT_RESPONSE",
          "Short answer response must be a text string.",
        );
      // Checked as it will be stored. The page refuses this before it is
      // sent; this is for whatever does not go through the page.
      if (
        hasUnsafeQuizAnswerContent(
          cleanQuizTextAnswer(response.textResponse ?? ""),
        )
      )
        throw new AppError(400, "UNSAFE_ANSWER", UNSAFE_QUIZ_ANSWER_MESSAGE);
      return;
    }
    const ids = response.selectedOptionIds ?? [];
    if (new Set(ids).size !== ids.length)
      throw new AppError(
        400,
        "DUPLICATE_OPTION_ID",
        "An answer contains a duplicate option.",
      );
    if (ids.some((id) => !validOptionIds.has(id)))
      throw new AppError(
        400,
        "INVALID_OPTION",
        "An answer references an option from another question.",
      );
    if (
      (question.question_type === "single_choice" ||
        question.question_type === "true_false") &&
      ids.length > 1
    )
      throw new AppError(
        400,
        "TOO_MANY_OPTIONS",
        "This question accepts only one option.",
      );
  }

  async function bulkSaveAnswers(
    userId: string,
    attemptId: string,
    payload: BulkQuizAnswersRequest,
    roles: readonly string[] = [],
  ) {
    const { attempt, assignment } = await requireOwnedActiveAttempt(
      userId,
      attemptId,
      roles,
    );
    // After the ownership check, so another user cannot spend this budget.
    // Answers are saved as the student goes, not only once all are filled.
    checkRateLimit(
      answerSaveTimestamps,
      attemptId,
      120,
      60_000,
      "Saving answers too rapidly. Please slow down.",
    );
    const ids = payload.answers.map((answer) => answer.questionId);
    if (new Set(ids).size !== ids.length)
      throw new AppError(
        400,
        "DUPLICATE_QUESTION_ID",
        "Each question may appear only once in a bulk answer snapshot.",
      );
    // Saving runs on every change the student makes. It only has to know
    // each question's type and which options are its own — not the key.
    const questions = await repo.listQuestionTypesByIds(
      database,
      attempt.quiz_version_id,
      ids,
    );
    if (questions.length !== ids.length)
      throw new AppError(
        400,
        "INVALID_QUESTION",
        "An answer references a question outside this Quiz version.",
      );
    const options = await repo.listOptionRefs(database, ids);
    for (const answer of payload.answers)
      validateResponse(
        questions.find((question) => question.id === answer.questionId)!,
        answer.responseValue,
        new Set(
          options
            .filter((option) => option.question_id === answer.questionId)
            .map((option) => option.id),
        ),
      );
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const locked = await repo.findAttemptForUpdate(trx, attemptId);
      if (
        !locked ||
        locked.user_id !== userId ||
        locked.status !== "in_progress"
      )
        throw new AppError(
          409,
          "ATTEMPT_NOT_ACTIVE",
          "This Quiz attempt is no longer active.",
        );
      // Nothing is written here when time is up: the attempt is closed,
      // with its saved answers graded, by the next read or submit.
      if (
        isPastDeadline(
          attemptDeadline(locked, assignment),
          now,
          ANSWER_SAVE_GRACE_MS,
        )
      )
        throw new AppError(
          409,
          "ATTEMPT_EXPIRED",
          "This Quiz attempt has expired.",
        );
      await repo.upsertAnswers(
        trx,
        payload.answers.map((answer) => ({
          id: crypto.randomUUID(),
          attempt_id: attemptId,
          question_id: answer.questionId,
          response_value: storedResponse(
            questions.find((question) => question.id === answer.questionId)!,
            answer.responseValue,
          ),
          is_correct: null,
          points_awarded: null,
          time_spent_seconds: answer.timeSpentSeconds ?? null,
          created_at: now,
          updated_at: now,
        })),
      );
    });
    return { saved: true as const };
  }

  /**
   * The result of an attempt read back from what was stored. Questions,
   * options and answers are loaded only as far as the result will show
   * them: nothing at all when it carries no answer list and the score is
   * already recorded.
   */
  async function readResult(attempt: AttemptRow, assignment: AssignmentRow) {
    const scope = resultScope(attempt, assignment);
    const questions =
      scope.includeFeedback || attempt.max_score === null
        ? await repo.listGradingQuestions(database, attempt.quiz_version_id, {
            prompt: scope.includeFeedback,
            explanation: scope.includeFeedback && scope.revealAnswers,
          })
        : [];
    const [options, answers] = scope.includeFeedback
      ? await Promise.all([
          repo.listKeyOptions(
            database,
            questions.map((question) => question.id),
          ),
          repo.listAnswers(database, attempt.id),
        ])
      : [[], []];
    return presentAttemptResult({
      attempt,
      assignment,
      scope,
      questions,
      options,
      answers,
    });
  }

  async function result(userId: string, attemptId: string) {
    const attempt = await repo.findAttempt(database, attemptId);
    if (!attempt || attempt.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    return readResult(attempt, await getAssignment(attempt.assignment_id));
  }

  /**
   * Grades the attempt. Before the deadline every question must be
   * answered. At or after it the attempt is closed with whatever was saved,
   * so a submit that arrives a moment late — or the page's automatic submit
   * when the countdown ends — still produces a score.
   */
  async function submit(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const existing = await repo.findAttempt(database, attemptId);
    if (!existing || existing.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    const assignment = await getAssignment(existing.assignment_id);
    if (existing.status !== "in_progress")
      return readResult(existing, assignment);
    const placement = await loadPlacement(assignment);
    await assertAssignmentAccess(
      assignment,
      placement,
      userId,
      roles,
      "You need active course access to continue this Quiz.",
    );
    const now = new Date();
    const graded = await database
      .transaction()
      .execute(async (trx): Promise<GradedAttempt | null> => {
        const locked = await repo.findAttemptForUpdate(trx, attemptId);
        if (!locked || locked.user_id !== userId)
          throw new AppError(
            404,
            "ATTEMPT_NOT_FOUND",
            "Quiz attempt not found.",
          );
        // Graded or closed by a concurrent request: report that outcome.
        if (locked.status !== "in_progress") return null;
        const deadline = attemptDeadline(locked, assignment);
        const timedOut = deadline !== null && isPastDeadline(deadline, now);
        return await gradeLockedAttempt(trx, {
          attempt: locked,
          assignment,
          now,
          submittedAt: timedOut ? deadline : now,
          requireComplete: !timedOut,
          // Already loaded for the access check above.
          findCourse: () => Promise.resolve(placement.course),
        });
      });
    if (!graded) return result(userId, attemptId);
    // Built from what was just graded; nothing is read a second time.
    return presentAttemptResult({ ...graded, assignment });
  }

  async function getAttempt(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const { attempt, assignment } = await requireOwnedActiveAttempt(
      userId,
      attemptId,
      roles,
    );
    return buildAttempt(attempt, assignment);
  }

  async function listMine(userId: string) {
    const attempts = await repo.listAttemptHistory(
      database,
      userId,
      ATTEMPT_HISTORY_LIMIT,
    );
    return attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      score: Number(attempt.score_percentage ?? 0),
      passed: Boolean(attempt.is_passed),
      submittedAt: toIso(attempt.submitted_at),
    }));
  }

  async function listAssignments(userId: string) {
    const grants = await accessService.listUserGrants(database, userId);
    const accessibleCourseIds = grants
      .filter(
        (grant) =>
          grant.status === "active" &&
          (!grant.validUntil || grant.validUntil > new Date()),
      )
      .map((grant) => grant.courseId);
    const courseIds = [
      ...new Set([
        ...accessibleCourseIds,
        ...(await repo.listPublishedFreeCourseIds(database)),
      ]),
    ];
    const assignments = await repo.listAssignmentsForCourses(
      database,
      courseIds,
    );
    // Batched lookups instead of a query per assignment or per course.
    const [courseRows, quizRows, lessonRows, userAttempts] = await Promise.all([
      // Only published courses: a quiz in a course that was unpublished or
      // deleted after the student got access is not offered.
      repo.listPublishedCourseTitles(database, [
        ...new Set(assignments.map((assignment) => assignment.course_id)),
      ]),
      repo.listQuizzesByIds(database, [
        ...new Set(assignments.map((assignment) => assignment.quiz_id)),
      ]),
      repo.listLessonsByIds(database, [
        ...new Set(assignments.map((assignment) => assignment.lesson_id)),
      ]),
      repo.listAttemptsForAssignments(
        database,
        userId,
        assignments.map((assignment) => assignment.id),
      ),
    ]);
    const courseTitles = new Map(
      courseRows.map((course) => [course.id, course.title]),
    );
    const quizzesById = new Map(quizRows.map((quiz) => [quiz.id, quiz]));
    const lessonsById = new Map(
      lessonRows.map((lesson) => [lesson.id, lesson]),
    );
    const attemptsByAssignment = new Map<string, typeof userAttempts>();
    for (const attempt of userAttempts) {
      const current = attemptsByAssignment.get(attempt.assignment_id) ?? [];
      current.push(attempt);
      attemptsByAssignment.set(attempt.assignment_id, current);
    }
    const items = [];
    for (const assignment of assignments) {
      const quiz = quizzesById.get(assignment.quiz_id);
      const lesson = lessonsById.get(assignment.lesson_id);
      const courseTitle = courseTitles.get(assignment.course_id);
      // Unpublished lessons are left out, like the lesson itself is.
      if (
        !quiz ||
        !lesson ||
        lesson.course_id !== assignment.course_id ||
        !lesson.is_published ||
        courseTitle === undefined
      )
        continue;
      const attempts = attemptsByAssignment.get(assignment.id) ?? [];
      // At most one attempt per assignment is in progress (partial unique index).
      const activeAttempt = attempts.find(
        (attempt) => attempt.status === "in_progress",
      );
      const gradedAttempts = attempts.filter(
        (attempt) => attempt.status === "graded",
      );
      const latestAttempt = attempts[0];
      items.push({
        id: assignment.id,
        courseId: assignment.course_id,
        lessonId: assignment.lesson_id,
        quizTitle: quiz.title,
        lessonTitle: lesson.title,
        courseTitle,
        maxAttempts: assignment.max_attempts,
        availableFrom: toIso(assignment.available_from),
        availableUntil: toIso(assignment.available_until),
        activeAttemptId: activeAttempt?.id ?? null,
        attemptCount: attempts.length,
        latestAttemptStatus: latestAttempt?.status ?? null,
        bestScore: gradedAttempts.length
          ? Math.max(
              ...gradedAttempts.map((attempt) =>
                Number(attempt.score_percentage ?? 0),
              ),
            )
          : null,
        latestPassed:
          latestAttempt?.is_passed === null ||
          latestAttempt?.is_passed === undefined
            ? null
            : Boolean(latestAttempt.is_passed),
      });
    }
    return { assignments: items };
  }

  return {
    start,
    getAttempt,
    bulkSaveAnswers,
    submit,
    result,
    listMine,
    listAssignments,
  };
}
export type AttemptService = ReturnType<typeof createAttemptService>;
