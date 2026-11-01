import crypto from "node:crypto";
import type {
  AssignQuizRequest,
  SetQuizCoursePricingRequest,
  UpdateQuizAssignmentRequest,
} from "@veolms/contracts";
import { cacheTags, invalidateCache } from "@veolms/api-core";
import { AppError } from "../../../lib/errors.ts";
import { createOutboxService } from "../../../events/outbox.service.ts";
import * as repo from "../shared/quiz.repository.ts";
import * as pricingRepo from "../shared/quiz-pricing.repository.ts";
import { presentAssignment } from "../shared/quiz.presenters.ts";
import {
  assertCanManageCourse,
  assertNoLearnerAttempts,
  reachesEveryQuiz,
  type QuizActor,
  type QuizServiceOptions,
} from "../shared/quiz.types.ts";
import { mayManageCourse } from "../../courses/shared/courses.utils.ts";

type PricingRow = Awaited<ReturnType<typeof pricingRepo.findPricing>>;

/** The course's quiz pass price; no row means its quizzes are free. */
function presentCoursePricing(row: PricingRow) {
  return {
    pricingType: row?.pricing_type ?? ("free" as const),
    price: Number(row?.price ?? 0),
    salePrice:
      row?.sale_price !== null && row?.sale_price !== undefined
        ? Number(row.sale_price)
        : null,
  };
}

export function createAssignmentService(options: QuizServiceOptions) {
  const { database, courseService, getAcademyId } = options;
  const outbox = createOutboxService();

  async function requireCourse(courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    return course;
  }

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
    await assertCanManageCourse(
      database,
      actor,
      await requireCourse(assignment.course_id),
      "quiz.settings.update",
    );
    if (!(await reachesEveryQuiz(database, actor, "quiz.settings.update"))) {
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
    const course = await requireCourse(courseId);
    await assertCanManageCourse(
      database,
      actor,
      course,
      "quiz.settings.update",
    );
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
    if (
      !quiz ||
      (quiz.creator_id !== actor.id &&
        !(await reachesEveryQuiz(database, actor, "quiz.settings.update")))
    )
      throw new AppError(403, "FORBIDDEN", "You do not own this Quiz.");
    const currentAcademyId = await getAcademyId();
    if (currentAcademyId && quiz.academy_id !== currentAcademyId)
      throw new AppError(
        403,
        "ACADEMY_MISMATCH",
        "Quiz must belong to the active Academy.",
      );
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
    if (await repo.lessonHasAssignment(database, lessonId))
      throw new AppError(
        409,
        "LESSON_ALREADY_ASSIGNED",
        "This lesson already has a Quiz assignment.",
      );
    const row = await database.transaction().execute(async (trx) => {
      const inserted = await repo.insertAssignment(trx, {
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

      await outbox.publish(trx, {
        type: "quiz.assigned",
        version: 1,
        dedupeKey: `quiz:assigned:${inserted.id}`,
        occurredAt: new Date(),
        payload: {
          courseId: course.id,
          courseTitle: course.title,
          courseSlug: course.slug,
          quizId: quiz.id,
          quizTitle: quiz.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          deepLink: `/learn/${course.slug}?lessonId=${lesson.id}&view=quiz`,
        },
      });

      return inserted;
    });
    return presentAssignment(row);
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
    const movesToAnotherVersion =
      quizVersionId !== undefined && quizVersionId !== current.quiz_version_id;
    const now = new Date();
    const row = await database.transaction().execute(async (trx) => {
      const updated = await repo.updateAssignment(trx, assignmentId, {
        ...(quizVersionId !== undefined
          ? { quiz_version_id: quizVersionId }
          : {}),
        ...(payload.required !== undefined
          ? { required: payload.required }
          : {}),
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
      // The learners still working on the version being replaced restart on
      // the new one (see the repository function). A quiz whose window has
      // already closed has no one left to restart.
      if (
        movesToAnotherVersion &&
        !(updated.available_until && updated.available_until < now)
      ) {
        await repo.deleteOpenAttemptsOnOtherVersions(
          trx,
          assignmentId,
          updated.quiz_version_id,
          now,
        );
      }
      return updated;
    });
    return presentAssignment(row);
  }

  /**
   * The quizzes attached to a course. Whoever manages the course sees all of
   * them. A learner sees only what has been released: nothing while the
   * course is a draft, nothing of an archived course they do not hold, and
   * never a quiz on an unpublished lesson — the same rule that decides
   * whether an attempt can be started.
   */
  async function listForCourse(actor: QuizActor, courseId: string) {
    const course = await requireCourse(courseId);
    // Managing a course's assignments is admin or course-creator only; the
    // instructor role alone used to list other instructors' draft courses.
    const canManageCourse = await mayManageCourse(
      database,
      course,
      actor.id,
      actor.roles,
      "quiz.read",
    );
    if (
      !canManageCourse &&
      !(await repo.isPublishedFreeCourse(database, courseId)) &&
      !(await options.accessService.hasActiveAccess(
        database,
        actor.id,
        courseId,
      ))
    )
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
        "You need active course access to view this Quiz assignment.",
      );
    if (
      !canManageCourse &&
      !(await options.accessService.isCourseOpenToLearner(
        database,
        actor.id,
        course,
      ))
    )
      return [];
    let rows = await repo.listAssignmentsForCourse(database, courseId);
    if (!canManageCourse) {
      const releasedLessonIds = new Set(
        (
          await repo.listLessonsByIds(database, [
            ...new Set(rows.map((row) => row.lesson_id)),
          ])
        )
          .filter(
            (lesson) => lesson.course_id === courseId && lesson.is_published,
          )
          .map((lesson) => lesson.id),
      );
      rows = rows.filter((row) => releasedLessonIds.has(row.lesson_id));
    }
    const quizTitles = new Map(
      (
        await repo.listQuizzesByIds(database, [
          ...new Set(rows.map((row) => row.quiz_id)),
        ])
      ).map((quiz) => [quiz.id, quiz.title] as const),
    );
    return rows.map((row) => ({
      ...presentAssignment(row),
      quizTitle: quizTitles.get(row.quiz_id) ?? "Quiz",
    }));
  }

  async function assertCanManageCoursePricing(
    actor: QuizActor,
    courseId: string,
  ) {
    await assertCanManageCourse(
      database,
      actor,
      await requireCourse(courseId),
      "quiz.settings.update",
    );
  }

  async function getPricing(actor: QuizActor, courseId: string) {
    await assertCanManageCoursePricing(actor, courseId);
    return presentCoursePricing(
      await pricingRepo.findPricing(database, courseId),
    );
  }

  /**
   * Sets the quiz price for a whole course. It applies to every quiz attached
   * to the course (including ones attached later), and one purchase unlocks
   * all of them.
   */
  async function setPricing(
    actor: QuizActor,
    courseId: string,
    payload: SetQuizCoursePricingRequest,
  ) {
    await assertCanManageCoursePricing(actor, courseId);
    // Prices are always in the course's currency, so a quiz pass can be
    // bought alongside the course and never trips the gateway with a currency
    // it does not support.
    const courseCurrency = await pricingRepo.findCourseCurrency(
      database,
      courseId,
    );
    if (
      payload.currency !== undefined &&
      payload.currency.toUpperCase() !== courseCurrency
    ) {
      throw new AppError(
        400,
        "QUIZ_CURRENCY_MISMATCH",
        `Quiz pricing must use the course currency (${courseCurrency}).`,
      );
    }
    const isPaid = payload.pricingType === "paid";
    const row = await pricingRepo.upsertPricing(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: payload.pricingType,
      price: isPaid ? payload.price : 0,
      currency: courseCurrency,
      sale_price: isPaid ? (payload.salePrice ?? null) : null,
    });
    return presentCoursePricing(row);
  }

  async function deleteAssignment(actor: QuizActor, assignmentId: string) {
    const assignment = await assertAuthorAssignment(actor, assignmentId);
    await database.transaction().execute(async (trx) => {
      assertNoLearnerAttempts(
        await repo.countLearnerAttempts(trx, {
          assignmentIds: [assignmentId],
          actorId: actor.id,
        }),
      );
      if (assignment.lesson_id) {
        // As when the quiz itself is deleted (`deleteQuiz`): the lesson
        // stays published as a video lesson with no media, which the
        // learner's lesson page shows as a lesson with no video.
        await repo.revertQuizLessonToVideo(trx, assignment.lesson_id);
      }
      await repo.deleteAssignment(trx, assignmentId);
    });
    // The lesson's type changed: the course's cached content is cleared.
    if (assignment.lesson_id) {
      invalidateCache([cacheTags.course(assignment.course_id)]);
    }
    return { success: true as const };
  }

  return {
    assign,
    update,
    getPricing,
    setPricing,
    deleteAssignment,
    listForCourse,
  };
}
export type AssignmentService = ReturnType<typeof createAssignmentService>;
