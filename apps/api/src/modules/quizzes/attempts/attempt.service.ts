import crypto from "node:crypto";
import type {
  BulkQuizAnswersRequest,
  QuizResponseValue,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import * as repo from "../shared/quiz.repository.ts";
import { isAdmin, type QuizServiceOptions } from "../shared/quiz.types.ts";
import { gradeQuizQuestion, hasQuizAnswer } from "../shared/quiz.grading.ts";

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
  const outbox = createOutboxService();

  async function hasCourseAccess(
    userId: string,
    courseId: string,
    roles: readonly string[] = [],
  ) {
    if (isAdmin({ id: userId, roles })) return true;
    const course = await courseService.findCourseById(courseId);
    if (course?.creator_id === userId) return true;
    return accessService.hasActiveAccess(database, userId, courseId);
  }

  async function getAssignment(assignmentId: string) {
    return assignmentDto(await repo.findAssignment(database, assignmentId));
  }

  async function assertCanAttempt(
    assignmentId: string,
    userId: string,
    roles: readonly string[] = [],
  ) {
    const assignment = await getAssignment(assignmentId);
    if (!(await hasCourseAccess(userId, assignment.course_id, roles)))
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
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
      expiresAt: toIso(attempt.expires_at),
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
                    options.filter((option) => option.question_id === question.id),
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
      if (existing.expires_at && existing.expires_at <= new Date()) {
        await repo.updateAttempt(database, existing.id, { status: "expired" });
      } else return buildAttempt(existing);
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

  async function requireOwnedActiveAttempt(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const attempt = await repo.findAttempt(database, attemptId);
    if (!attempt || attempt.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    const assignment = await getAssignment(attempt.assignment_id);
    if (!(await hasCourseAccess(userId, assignment.course_id, roles)))
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
        "You need active course access to continue this Quiz.",
      );
    if (attempt.status !== "in_progress")
      throw new AppError(
        409,
        "ATTEMPT_NOT_ACTIVE",
        "This Quiz attempt is no longer active.",
      );
    if (attempt.expires_at && attempt.expires_at <= new Date()) {
      await repo.updateAttempt(database, attemptId, { status: "expired" });
      throw new AppError(
        409,
        "ATTEMPT_EXPIRED",
        "This Quiz attempt has expired.",
      );
    }
    return attempt;
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
    checkRateLimit(
      answerSaveTimestamps,
      attemptId,
      60,
      60_000,
      "Saving answers too rapidly. Please slow down.",
    );
    const attempt = await requireOwnedActiveAttempt(userId, attemptId, roles);
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
      if (locked.expires_at && locked.expires_at <= now) {
        await repo.updateAttempt(trx, attemptId, { status: "expired" });
        throw new AppError(
          409,
          "ATTEMPT_EXPIRED",
          "This Quiz attempt has expired.",
        );
      }
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

  async function submit(
    userId: string,
    attemptId: string,
    roles: readonly string[] = [],
  ) {
    const existing = await repo.findAttempt(database, attemptId);
    if (!existing || existing.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    if (existing.status === "graded" || existing.status === "submitted")
      return result(userId, attemptId);
    await requireOwnedActiveAttempt(userId, attemptId, roles);
    const attempt = existing;
    const assignment = await getAssignment(attempt.assignment_id);
    const now = new Date();
    const gradedResult = await database.transaction().execute(async (trx) => {
      const locked = await repo.findAttemptForUpdate(trx, attemptId);
      if (!locked || locked.user_id !== userId)
        throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
      if (locked.status === "graded" || locked.status === "submitted")
        return null;
      if (locked.status !== "in_progress")
        throw new AppError(
          409,
          "ATTEMPT_NOT_ACTIVE",
          "This Quiz attempt is no longer active.",
        );
      if (locked.expires_at && locked.expires_at <= now) {
        await repo.updateAttempt(trx, attemptId, { status: "expired" });
        throw new AppError(
          409,
          "ATTEMPT_EXPIRED",
          "This Quiz attempt has expired.",
        );
      }
      const questions = await repo.listQuestions(trx, locked.quiz_version_id);
      const options = await repo.listOptions(
        trx,
        questions.map((question) => question.id),
      );
      const answers = await repo.listAnswers(trx, attemptId);
      const graded = questions.map((question) => {
        const answer = answers.find((item) => item.question_id === question.id);
        const responseVal = answer
          ? (answer.response_value as QuizResponseValue)
          : null;
        const selected = responseVal?.selectedOptionIds ?? [];
        const textResp = responseVal?.textResponse ?? null;
        const correct = options
          .filter(
            (option) => option.question_id === question.id && option.is_correct,
          )
          .map((option) => option.id);
        const acceptedTexts = options
          .filter(
            (option) => option.question_id === question.id && option.is_correct,
          )
          .map((option) => option.option_text);
        const score = grade(
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
          question,
          answer,
          selected,
          textResp,
          acceptedTexts,
          ...score,
        };
      });
      if (
        graded.some(
          (item) =>
            !hasQuizAnswer(
              item.answer
                ? (item.answer.response_value as QuizResponseValue)
                : null,
            ),
        )
      )
        throw new AppError(
          400,
          "ALL_QUESTIONS_REQUIRED",
          "Answer every Quiz question before submitting.",
        );
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
            attempt_id: attemptId,
            question_id: item.question.id,
            response_value: item.answer!.response_value,
            is_correct: item.isCorrect,
            points_awarded: item.pointsAwarded,
            time_spent_seconds: item.answer!.time_spent_seconds,
            created_at: item.answer!.created_at,
            updated_at: now,
          })),
      );
      await repo.updateAttempt(trx, attemptId, {
        status: "graded",
        submitted_at: now,
        score_obtained: score,
        max_score: maxScore,
        score_percentage: percentage,
        is_passed: passed,
      });
      const updated = await repo.findAttempt(trx, attemptId);
      if (!updated)
        throw new AppError(
          500,
          "ATTEMPT_NOT_FOUND",
          "Quiz attempt disappeared during grading.",
        );
      const course = await courseService.findCourseById(assignment.course_id);
      const quiz = await repo.findQuiz(trx, assignment.quiz_id);
      if (course && quiz) {
        if (passed) {
          await outbox.publish(trx, {
            type: "quiz.attempt.passed",
            version: 1,
            dedupeKey: `quiz:passed:${attemptId}`,
            occurredAt: now,
            payload: {
              recipientUserId: userId,
              courseId: course.id,
              courseTitle: course.title,
              courseSlug: course.slug,
              quizId: quiz.id,
              quizTitle: quiz.title,
              score,
              maxScore,
              scorePercentage: percentage,
              deepLink: `/learn/${course.slug}?lessonId=${assignment.lesson_id}&view=quiz`,
            },
          });
        } else if (updated.attempt_number >= assignment.max_attempts) {
          await outbox.publish(trx, {
            type: "quiz.attempt.failed_final",
            version: 1,
            dedupeKey: `quiz:failed_final:${attemptId}`,
            occurredAt: now,
            payload: {
              recipientUserId: userId,
              courseId: course.id,
              courseTitle: course.title,
              courseSlug: course.slug,
              quizId: quiz.id,
              quizTitle: quiz.title,
              maxAttempts: assignment.max_attempts,
              scorePercentage: percentage,
              deepLink: `/learn/${course.slug}?lessonId=${assignment.lesson_id}&view=quiz`,
            },
          });
        }
      }
      const revealAnswers = shouldRevealAnswers(
        assignment.feedback_mode,
        updated.attempt_number,
        assignment.max_attempts,
        assignment.available_until,
        now,
      );
      const resultAnswers = graded.map((item) => ({
        questionId: item.question.id,
        prompt: item.question.prompt,
        selectedOptionIds: item.selected,
        selectedOptionTexts: options
          .filter(
            (option) =>
              option.question_id === item.question.id &&
              item.selected.includes(option.id),
          )
          .map((option) => option.option_text),
        correctOptionTexts: revealAnswers ? item.acceptedTexts : [],
        textResponse: item.textResp,
        isCorrect: item.isCorrect,
        pointsAwarded: item.pointsAwarded,
        explanation: revealAnswers ? item.question.explanation : null,
      }));
      return {
        attemptId: updated.id,
        assignmentId: updated.assignment_id,
        quizVersionId: updated.quiz_version_id,
        attemptNumber: updated.attempt_number,
        score,
        maxScore,
        percentage,
        passed,
        status: updated.status,
        submittedAt: now.toISOString(),
        feedbackMode: assignment.feedback_mode,
        ...(assignment.feedback_mode === "never"
          ? {}
          : { answers: resultAnswers }),
      };
    });
    return gradedResult ?? result(userId, attemptId);
  }

  async function getAttempt(userId: string, attemptId: string) {
    const attempt = await repo.findAttempt(database, attemptId);
    if (!attempt || attempt.user_id !== userId)
      throw new AppError(404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found.");
    if (
      attempt.status === "in_progress" &&
      attempt.expires_at &&
      attempt.expires_at <= new Date()
    ) {
      const updated = await repo.updateAttempt(database, attemptId, {
        status: "expired",
      });
      return buildAttempt(updated);
    }
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
    const courseIds = grants
      .filter(
        (grant) =>
          grant.status === "active" &&
          (!grant.validUntil || grant.validUntil > new Date()),
      )
      .map((grant) => grant.courseId);
    const assignments = await repo.listAssignmentsForCourses(
      database,
      courseIds,
    );
    const userAttempts = await repo.listAttemptsForUser(database, userId);
    const attemptsByAssignment = new Map<string, typeof userAttempts>();
    for (const attempt of userAttempts) {
      const current = attemptsByAssignment.get(attempt.assignment_id) ?? [];
      current.push(attempt);
      attemptsByAssignment.set(attempt.assignment_id, current);
    }
    const courseTitles = new Map<string, string>();
    await Promise.all(
      [...new Set(assignments.map((assignment) => assignment.course_id))].map(
        async (courseId) => {
          const course = await courseService.findCourseById(courseId);
          if (course) courseTitles.set(courseId, course.title);
        },
      ),
    );
    const items = [];
    for (const assignment of assignments) {
      const quiz = await repo.findQuiz(database, assignment.quiz_id);
      const lesson = await courseService.findLessonById(
        assignment.course_id,
        assignment.lesson_id,
      );
      const activeAttempt = await repo.findActiveAttempt(
        database,
        assignment.id,
        userId,
      );
      const attempts = attemptsByAssignment.get(assignment.id) ?? [];
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
    const expired = await repo.expireAbandonedAttempts(database, now);
    return {
      expiredCount: expired.length,
      expiredAttempts: expired,
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
