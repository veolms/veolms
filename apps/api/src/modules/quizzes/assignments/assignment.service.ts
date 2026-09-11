import crypto from "node:crypto";
import type {
  AssignQuizRequest,
  UpdateQuizAssignmentRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/quiz.repository.ts";
import type { QuizActor, QuizServiceOptions } from "../shared/quiz.types.ts";
import { isAdmin } from "../shared/quiz.types.ts";

function present(row: Awaited<ReturnType<typeof repo.findAssignment>>) {
  if (!row)
    throw new AppError(
      404,
      "ASSIGNMENT_NOT_FOUND",
      "Quiz assignment not found.",
    );
  return {
    id: row.id,
    quizId: row.quiz_id,
    quizVersionId: row.quiz_version_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    required: row.required,
    passPercentage: Number(row.pass_percentage),
    maxAttempts: row.max_attempts,
    timeLimitSeconds: row.time_limit_seconds,
    shuffleQuestions: row.shuffle_questions,
    shuffleOptions: row.shuffle_options,
    feedbackMode: row.feedback_mode,
    availableFrom: row.available_from?.toISOString() ?? null,
    availableUntil: row.available_until?.toISOString() ?? null,
  };
}

export function createAssignmentService(options: QuizServiceOptions) {
  const { database, courseService } = options;

  async function assertAuthorAssignment(
    actor: QuizActor,
    assignmentId: string,
  ) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment)
      throw new AppError(
        404,
        "ASSIGNMENT_NOT_FOUND",
        "Quiz assignment not found.",
      );
    const course = await courseService.findCourseById(assignment.course_id);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(
        assignment.course_id,
        actor.id,
      );
    if (!isAdmin(actor)) {
      const quiz = await repo.findQuiz(database, assignment.quiz_id);
      if (!quiz || quiz.creator_id !== actor.id)
        throw new AppError(
          403,
          "FORBIDDEN",
          "You do not own this Quiz assignment.",
        );
    }
    return assignment;
  }

  async function assign(
    actor: QuizActor,
    courseId: string,
    lessonId: string,
    payload: AssignQuizRequest,
  ) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(courseId, actor.id);
    const lesson = await courseService.findLessonById(courseId, lessonId);
    if (!lesson)
      throw new AppError(404, "LESSON_NOT_FOUND", "Course lesson not found.");
    const version = await repo.findVersion(database, payload.quizVersionId);
    if (!version)
      throw new AppError(
        404,
        "QUIZ_VERSION_NOT_FOUND",
        "Quiz version not found.",
      );
    if (!version.published_at)
      throw new AppError(
        400,
        "QUIZ_VERSION_NOT_PUBLISHED",
        "Only published Quiz versions can be assigned.",
      );
    const quiz = await repo.findQuiz(database, version.quiz_id);
    if (!quiz || (quiz.creator_id !== actor.id && !isAdmin(actor)))
      throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
    if (version.quiz_id !== quiz.id)
      throw new AppError(
        400,
        "QUIZ_VERSION_MISMATCH",
        "The selected Quiz version does not belong to the Quiz.",
      );
    if (
      payload.availableFrom &&
      payload.availableUntil &&
      payload.availableUntil < payload.availableFrom
    )
      throw new AppError(
        400,
        "INVALID_AVAILABILITY_WINDOW",
        "Quiz availability must end after it starts.",
      );
    const existing = await repo.findAssignmentForLesson(database, lessonId);
    if (existing)
      throw new AppError(
        409,
        "LESSON_ALREADY_ASSIGNED",
        "This lesson already has a Quiz assignment.",
      );
    const row = await repo.insertAssignment(database, {
      id: crypto.randomUUID(),
      quiz_id: quiz.id,
      quiz_version_id: version.id,
      course_id: courseId,
      lesson_id: lessonId,
      required: payload.required ?? true,
      pass_percentage: payload.passPercentage ?? 70,
      max_attempts: payload.maxAttempts ?? 1,
      time_limit_seconds: payload.timeLimitSeconds ?? null,
      shuffle_questions: payload.shuffleQuestions ?? false,
      shuffle_options: payload.shuffleOptions ?? false,
      feedback_mode: payload.feedbackMode ?? "after_submit",
      available_from: payload.availableFrom ?? null,
      available_until: payload.availableUntil ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return present(row);
  }

  async function update(
    actor: QuizActor,
    assignmentId: string,
    payload: UpdateQuizAssignmentRequest,
  ) {
    const current = await assertAuthorAssignment(actor, assignmentId);
    const availableFrom =
      payload.availableFrom !== undefined
        ? payload.availableFrom
        : current.available_from;
    const availableUntil =
      payload.availableUntil !== undefined
        ? payload.availableUntil
        : current.available_until;
    let quizVersionId: string | undefined;
    if (payload.quizVersionId !== undefined) {
      const version = await repo.findVersion(database, payload.quizVersionId);
      if (!version || version.quiz_id !== current.quiz_id)
        throw new AppError(
          400,
          "QUIZ_VERSION_MISMATCH",
          "The selected Quiz version does not belong to this assignment.",
        );
      if (!version.published_at)
        throw new AppError(
          400,
          "QUIZ_VERSION_NOT_PUBLISHED",
          "Only published Quiz versions can be assigned.",
        );
      quizVersionId = version.id;
    }
    if (availableFrom && availableUntil && availableUntil < availableFrom)
      throw new AppError(
        400,
        "INVALID_AVAILABILITY_WINDOW",
        "Quiz availability must end after it starts.",
      );
    const row = await repo.updateAssignment(database, assignmentId, {
      ...(quizVersionId !== undefined
        ? { quiz_version_id: quizVersionId }
        : {}),
      ...(payload.required !== undefined ? { required: payload.required } : {}),
      ...(payload.passPercentage !== undefined
        ? { pass_percentage: payload.passPercentage }
        : {}),
      ...(payload.maxAttempts !== undefined
        ? { max_attempts: payload.maxAttempts }
        : {}),
      ...(payload.timeLimitSeconds !== undefined
        ? { time_limit_seconds: payload.timeLimitSeconds }
        : {}),
      ...(payload.shuffleQuestions !== undefined
        ? { shuffle_questions: payload.shuffleQuestions }
        : {}),
      ...(payload.shuffleOptions !== undefined
        ? { shuffle_options: payload.shuffleOptions }
        : {}),
      ...(payload.feedbackMode !== undefined
        ? { feedback_mode: payload.feedbackMode }
        : {}),
      ...(payload.availableFrom !== undefined
        ? { available_from: payload.availableFrom }
        : {}),
      ...(payload.availableUntil !== undefined
        ? { available_until: payload.availableUntil }
        : {}),
    });
    return present(row ?? current);
  }

  async function listForCourse(actor: QuizActor, courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    if (!isAdmin(actor))
      await courseService.getCourseAndVerifyOwner(courseId, actor.id);
    const rows = await repo.listAssignmentsForCourse(database, courseId);
    return Promise.all(
      rows.map(async (row) => ({
        ...present(row),
        quizTitle:
          (await repo.findQuiz(database, row.quiz_id))?.title ?? "Quiz",
      })),
    );
  }

  async function get(assignmentId: string) {
    return present(await repo.findAssignment(database, assignmentId));
  }

  return { assign, update, listForCourse, get, assertAuthorAssignment };
}
export type AssignmentService = ReturnType<typeof createAssignmentService>;
