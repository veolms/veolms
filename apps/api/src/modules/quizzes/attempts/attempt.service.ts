import crypto from "node:crypto";
import type {
  BulkQuizAnswersRequest,
  QuizResponseValue,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import * as pricingRepo from "../shared/quiz-pricing.repository.ts";
import { resolveQuizCharge } from "../../commerce/pricing/quiz-pricing.amount.ts";
import { isAdmin, type QuizServiceOptions } from "../shared/quiz.types.ts";
import { gradeQuizQuestion } from "../shared/quiz.grading.ts";
import {
  ANSWER_SAVE_GRACE_MS,
  attemptDeadline,
  createAttemptCloser,
  gradeLockedAttempt,
  isPastDeadline,
} from "./attempt.closing.ts";

function assignmentDto(row: Awaited<ReturnType<typeof repo.findAssignment>>) {
  if (!row)
    throw new AppError(
      404,
      "ASSIGNMENT_NOT_FOUND",
      "Quiz assignment not found.",
    );
  return row;
}

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

/** Read-only pricing joined from the course's shared quiz pricing row. */
function presentPricing(
  pricing: Awaited<ReturnType<typeof pricingRepo.findPricing>>,
) {
  return {
    quizPricingId: pricing?.id ?? null,
    pricingType: pricing?.pricing_type ?? ("free" as const),
    price: Number(pricing?.price ?? 0),
    currency: pricing?.currency ?? "INR",
    salePrice:
      pricing?.sale_price !== null && pricing?.sale_price !== undefined
        ? Number(pricing.sale_price)
        : null,
  };
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

function shouldRevealAnswers(
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

  async function hasCourseAccess(
    userId: string,
    courseId: string,
    roles: readonly string[] = [],
  ) {
    if (isAdmin({ id: userId, roles })) return true;
    const course = await courseService.findCourseById(courseId);
    if (course?.creator_id === userId) return true;
    if (await repo.isPublishedFreeCourse(database, courseId)) return true;
    return accessService.hasActiveAccess(database, userId, courseId);
  }

  async function getAssignment(assignmentId: string) {
    return assignmentDto(await repo.findAssignment(database, assignmentId));
  }

  /**
   * Paid course quizzes need the student's quiz pass for the course; one
   * purchase unlocks every quiz in it. Free quizzes need no grant. Course
   * owners and admins skip the check.
   */
  async function assertQuizPurchased(
    assignment: NonNullable<Awaited<ReturnType<typeof repo.findAssignment>>>,
    userId: string,
    roles: readonly string[],
  ) {
    if (isAdmin({ id: userId, roles })) return;
    const course = await courseService.findCourseById(assignment.course_id);
    if (course?.creator_id === userId) return;
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
   * A quiz can be started only once its lesson and course are published.
   * Enrolled students could otherwise open a quiz the instructor was still
   * preparing — and, with feedback on, read its answers before release.
   * The course owner and admins may try it out beforehand. Reported as
   * "not found" so an unreleased quiz is not revealed.
   */
  async function assertAssignmentReleased(
    assignment: NonNullable<Awaited<ReturnType<typeof repo.findAssignment>>>,
    userId: string,
    roles: readonly string[],
  ) {
    if (isAdmin({ id: userId, roles })) return;
    const course = await courseService.findCourseById(assignment.course_id);
    if (course?.creator_id === userId) return;
    const lesson = assignment.lesson_id
      ? await courseService.findLessonById(
          assignment.course_id,
          assignment.lesson_id,
        )
      : undefined;
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

  /** Course access and, for paid quizzes, the quiz pass. */
  async function assertAssignmentAccess(
    assignment: NonNullable<Awaited<ReturnType<typeof repo.findAssignment>>>,
    userId: string,
    roles: readonly string[],
    accessMessage: string,
  ) {
    let isPreviewLesson = false;
    if (assignment.lesson_id) {
      const lesson = await courseService.findLessonById(
        assignment.course_id,
        assignment.lesson_id,
      );
      if (lesson?.is_preview) {
        isPreviewLesson = true;
      }
    }

    if (!isPreviewLesson) {
      if (!(await hasCourseAccess(userId, assignment.course_id, roles)))
        throw new AppError(403, "COURSE_ACCESS_REQUIRED", accessMessage);
      await assertQuizPurchased(assignment, userId, roles);
    }
  }

  async function assertCanAttempt(
    assignmentId: string,
    userId: string,
    roles: readonly string[] = [],
  ) {
    const assignment = await getAssignment(assignmentId);
    await assertAssignmentReleased(assignment, userId, roles);
    await assertAssignmentAccess(
      assignment,
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
    return { assignment, version };
  }

  async function buildAttempt(
    attempt: NonNullable<Awaited<ReturnType<typeof repo.findAttempt>>>,
  ) {
    const assignment = await getAssignment(attempt.assignment_id);
    const questions = await repo.listQuestions(
      database,
      attempt.quiz_version_id,
    );
    const options = await repo.listOptions(
      database,
      questions.map((question) => question.id),
    );
    const answers = await repo.listAnswers(database, attempt.id);
    const presentedQuestions = assignment.shuffle_questions
      ? stableShuffle(questions, attempt.id)
      : questions;
    return {
      id: attempt.id,
      assignmentId: attempt.assignment_id,
      quizVersionId: attempt.quiz_version_id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      startedAt: attempt.started_at.toISOString(),
      // The due date can end an attempt before its own time limit does.
      expiresAt: toIso(attemptDeadline(attempt, assignment)),
      // The countdown is measured against this, not the device clock.
      serverNow: new Date().toISOString(),
      questions: presentedQuestions.map((question) => ({
        id: question.id,
        questionType: question.question_type,
        prompt: question.prompt,
        points: Number(question.points),
        position: question.position,
        options:
          question.question_type === "short_answer"
            ? []
            : (assignment.shuffle_options
                ? stableShuffle(
                    options.filter(
                      (option) => option.question_id === question.id,
                    ),
                    attempt.id,
                  )
                : options.filter((option) => option.question_id === question.id)
              ).map((option) => ({
                id: option.id,
                text: option.option_text,
                position: option.position,
              })),
      })),
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
    const { assignment, version } = await assertCanAttempt(
      assignmentId,
      userId,
      roles,
    );
    const existing = await repo.findActiveAttempt(
      database,
      assignmentId,
      userId,
    );
    if (existing) {
      const now = new Date();
      if (
        !isPastDeadline(
          attemptDeadline(existing, assignment),
          now,
          ANSWER_SAVE_GRACE_MS,
        )
      )
        return buildAttempt(existing);
      // Time ran out on the previous attempt: grade what was saved before
      // a new attempt is opened.
      await closer.closeIfOverdue(existing.id, now, ANSWER_SAVE_GRACE_MS);
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
      return buildAttempt(attempt);
    } catch (error) {
      // The partial unique index is the final concurrency guard. If another
      // request won the race to create the active attempt, resume that one.
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await repo.findActiveAttempt(
        database,
        assignmentId,
        userId,
      );
      if (concurrent) return buildAttempt(concurrent);
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
    const questions = await repo.listQuestionsByIds(
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
    const options = await repo.listOptions(database, ids);
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
          response_value: answer.responseValue,
          is_correct: null,
          points_awarded: null,
          time_spent_seconds: answer.timeSpentSeconds ?? null,
          created_at: now,
          updated_at: now,
        })),
      );
    });
    return { saved: true as const, answerCount: payload.answers.length };
  }

  function grade(
    question: { id: string; points: number; question_type: string },
    selected: string[],
    correct: string[],
    textResponse?: string | null,
    acceptedOptionTexts?: string[],
  ) {
    return gradeQuizQuestion({
      questionType: question.question_type,
      points: question.points,
      selectedOptionIds: selected,
      correctOptionIds: correct,
      textResponse,
      acceptedOptionTexts,
    });
  }

  async function result(userId: string, attemptId: string) {
    const attempt = await repo.findAttempt(database, attemptId);
    if (!attempt || attempt.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    const assignment = await getAssignment(attempt.assignment_id);
    const questions = await repo.listQuestions(
      database,
      attempt.quiz_version_id,
    );
    const options = await repo.listOptions(
      database,
      questions.map((question) => question.id),
    );
    const answers = await repo.listAnswers(database, attempt.id);
    const includeFeedback =
      assignment.feedback_mode !== "never" && attempt.status !== "in_progress";
    const revealAnswers = shouldRevealAnswers(
      assignment.feedback_mode,
      attempt.attempt_number,
      assignment.max_attempts,
      assignment.available_until,
    );
    return {
      attemptId: attempt.id,
      assignmentId: attempt.assignment_id,
      quizVersionId: attempt.quiz_version_id,
      attemptNumber: attempt.attempt_number,
      score: Number(attempt.score_obtained ?? 0),
      maxScore: Number(
        attempt.max_score ??
          questions.reduce((sum, question) => sum + Number(question.points), 0),
      ),
      percentage: Number(attempt.score_percentage ?? 0),
      passed: Boolean(attempt.is_passed),
      status: attempt.status,
      submittedAt:
        toIso(attempt.submitted_at) ?? attempt.updated_at.toISOString(),
      feedbackMode: assignment.feedback_mode,
      ...(includeFeedback
        ? {
            answers: answers.map((answer) => {
              const question = questions.find(
                (item) => item.id === answer.question_id,
              )!;
              const responseVal = answer.response_value as QuizResponseValue;
              const selected = responseVal.selectedOptionIds ?? [];
              const textResp = responseVal.textResponse ?? null;
              const correct = options
                .filter(
                  (option) =>
                    option.question_id === question.id && option.is_correct,
                )
                .map((option) => option.id);
              const acceptedTexts = options
                .filter(
                  (option) =>
                    option.question_id === question.id && option.is_correct,
                )
                .map((option) => option.option_text);
              const selectedOptionTexts = options
                .filter(
                  (option) =>
                    option.question_id === question.id &&
                    selected.includes(option.id),
                )
                .map((option) => option.option_text);
              const correctOptionTexts = revealAnswers ? acceptedTexts : [];
              const graded = grade(
                {
                  id: question.id,
                  points: Number(question.points),
                  question_type: question.question_type,
                },
                selected,
                correct,
                textResp,
                acceptedTexts,
              );
              return {
                questionId: question.id,
                prompt: question.prompt,
                selectedOptionIds: selected,
                selectedOptionTexts,
                correctOptionTexts,
                textResponse: textResp,
                isCorrect: Boolean(answer.is_correct ?? graded.isCorrect),
                pointsAwarded: Number(
                  answer.points_awarded ?? graded.pointsAwarded,
                ),
                explanation: revealAnswers ? question.explanation : null,
              };
            }),
          }
        : {}),
    };
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
    if (existing.status !== "in_progress") return result(userId, attemptId);
    const assignment = await getAssignment(existing.assignment_id);
    await assertAssignmentAccess(
      assignment,
      userId,
      roles,
      "You need active course access to continue this Quiz.",
    );
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const locked = await repo.findAttemptForUpdate(trx, attemptId);
      if (!locked || locked.user_id !== userId)
        throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
      // Graded or closed by a concurrent request: report that outcome.
      if (locked.status !== "in_progress") return;
      const deadline = attemptDeadline(locked, assignment);
      const timedOut = deadline !== null && isPastDeadline(deadline, now);
      await gradeLockedAttempt(trx, {
        attempt: locked,
        assignment,
        now,
        submittedAt: timedOut ? deadline : now,
        requireComplete: !timedOut,
        findCourse,
      });
    });
    return result(userId, attemptId);
  }

  async function getAttempt(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const { attempt } = await requireOwnedActiveAttempt(
      userId,
      attemptId,
      roles,
    );
    return buildAttempt(attempt);
  }

  async function listMine(userId: string) {
    const attempts = await repo.listAttemptsForUser(database, userId);
    return attempts.map((attempt) => ({
      id: attempt.id,
      assignmentId: attempt.assignment_id,
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
    const pricingByCourseId = new Map(
      (await pricingRepo.listPricingForCourses(database, courseIds)).map(
        (pricing) => [pricing.course_id, pricing] as const,
      ),
    );
    const userAttempts = await repo.listAttemptsForUser(database, userId);
    const attemptsByAssignment = new Map<string, typeof userAttempts>();
    for (const attempt of userAttempts) {
      const current = attemptsByAssignment.get(attempt.assignment_id) ?? [];
      current.push(attempt);
      attemptsByAssignment.set(attempt.assignment_id, current);
    }
    // Only published courses: a quiz in a course that was unpublished or
    // deleted after the student got access is not offered.
    const courseTitles = new Map<string, string>();
    await Promise.all(
      [...new Set(assignments.map((assignment) => assignment.course_id))].map(
        async (courseId) => {
          const course = await courseService.findCourseById(courseId);
          if (course && !course.deleted_at && course.status === "published")
            courseTitles.set(courseId, course.title);
        },
      ),
    );
    // Two batched lookups instead of a query per assignment.
    const [quizRows, lessonRows] = await Promise.all([
      repo.listQuizzesByIds(database, [
        ...new Set(assignments.map((assignment) => assignment.quiz_id)),
      ]),
      repo.listLessonsByIds(database, [
        ...new Set(assignments.map((assignment) => assignment.lesson_id)),
      ]),
    ]);
    const quizzesById = new Map(quizRows.map((quiz) => [quiz.id, quiz]));
    const lessonsById = new Map(
      lessonRows.map((lesson) => [lesson.id, lesson]),
    );
    const items = [];
    for (const assignment of assignments) {
      const quiz = quizzesById.get(assignment.quiz_id);
      const lessonRow = lessonsById.get(assignment.lesson_id);
      // Unpublished lessons are left out, like the lesson itself is.
      const lesson =
        lessonRow &&
        lessonRow.course_id === assignment.course_id &&
        lessonRow.is_published &&
        courseTitles.has(assignment.course_id)
          ? lessonRow
          : undefined;
      const attempts = attemptsByAssignment.get(assignment.id) ?? [];
      // At most one attempt per assignment is in progress (partial unique index).
      const activeAttempt = attempts.find(
        (attempt) => attempt.status === "in_progress",
      );
      const gradedAttempts = attempts.filter(
        (attempt) => attempt.status === "graded",
      );
      const latestAttempt = attempts[0];
      const bestScore = gradedAttempts.length
        ? Math.max(
            ...gradedAttempts.map((attempt) =>
              Number(attempt.score_percentage ?? 0),
            ),
          )
        : null;
      if (quiz && lesson)
        items.push({
          ...assignment,
          quizTitle: quiz.title,
          lessonTitle: lesson.title,
          courseTitle: courseTitles.get(assignment.course_id) ?? "Course",
          activeAttemptId: activeAttempt?.id ?? null,
          attemptCount: attempts.length,
          latestAttemptStatus: latestAttempt?.status ?? null,
          latestScore:
            latestAttempt?.score_percentage === null ||
            latestAttempt?.score_percentage === undefined
              ? null
              : Number(latestAttempt.score_percentage),
          bestScore,
          latestPassed:
            latestAttempt?.is_passed === null ||
            latestAttempt?.is_passed === undefined
              ? null
              : Boolean(latestAttempt.is_passed),
        });
    }
    return {
      assignments: items.map((item) => ({
        id: item.id,
        quizId: item.quiz_id,
        quizVersionId: item.quiz_version_id,
        courseId: item.course_id,
        lessonId: item.lesson_id,
        required: item.required,
        passPercentage: Number(item.pass_percentage),
        maxAttempts: item.max_attempts,
        timeLimitSeconds: item.time_limit_seconds,
        shuffleQuestions: item.shuffle_questions,
        shuffleOptions: item.shuffle_options,
        feedbackMode: item.feedback_mode,
        availableFrom: toIso(item.available_from),
        availableUntil: toIso(item.available_until),
        ...presentPricing(pricingByCourseId.get(item.course_id)),
        quizTitle: item.quizTitle,
        lessonTitle: item.lessonTitle,
        courseTitle: item.courseTitle,
        activeAttemptId: item.activeAttemptId,
        attemptCount: item.attemptCount,
        latestAttemptStatus: item.latestAttemptStatus,
        latestScore: item.latestScore,
        bestScore: item.bestScore,
        latestPassed: item.latestPassed,
      })),
    };
  }

  async function expireAbandonedAttempts(now: Date = new Date()) {
    const { closed } = await closer.closeOverdueAttempts(now);
    return {
      expiredCount: closed.length,
      expiredAttempts: closed,
    };
  }

  return {
    start,
    getAttempt,
    bulkSaveAnswers,
    submit,
    result,
    listMine,
    listAssignments,
    assertCanAttempt,
    expireAbandonedAttempts,
  };
}
export type AttemptService = ReturnType<typeof createAttemptService>;
