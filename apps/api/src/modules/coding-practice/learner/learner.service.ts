import crypto from "node:crypto";
import type {
  CodingFile,
  CodingLesson,
  LecturePracticeResponse,
  SaveCodingDraftRequest,
  SubmitCodingRequest,
  SubmitCodingResponse,
} from "@veolms/contracts";
import { CODING_LIMITS } from "@veolms/contracts";
import { createCache } from "@veolms/api-core";
import { withLocalCommit, type DatabaseExecutor } from "@veolms/database";
import { AppError } from "../../../lib/errors.ts";
import { isOpenFreeCourse, scopeOpensSection } from "../../access/index.ts";
import { mayManageCourse } from "../../courses/shared/courses.utils.ts";
import * as repo from "../shared/coding.repository.ts";
import {
  presentState,
  readContent,
  readFiles,
  solutionAllowed,
  type AssignmentRow,
  type VersionRow,
} from "../shared/coding.presenters.ts";
import {
  expectedTests,
  totalBytes,
  type CodingContent,
} from "../shared/coding.suite.ts";
import {
  CodingErrors,
  isAdmin,
  type CodingActor,
  type CodingServiceOptions,
} from "../shared/coding.types.ts";

/**
 * Published versions never change, so a version read once serves every
 * learner of every process until it is evicted. Drafts are never put here:
 * learners only ever get the version their lesson pins.
 */
const publishedVersions = createCache<{
  row: VersionRow;
  content: CodingContent;
}>({
  name: "coding.published-versions",
  ttlMs: 30 * 60_000,
  maxBytes: 16 * 1024 * 1024,
});

const SUBMISSION_HISTORY_LIMIT = 20;

export function createLearnerService(options: CodingServiceOptions) {
  const { database, courseService, accessService } = options;

  async function loadVersion(versionId: string) {
    return await publishedVersions.fetch(versionId, async () => {
      const row = await repo.findVersion(database, versionId);
      if (!row) throw CodingErrors.assignmentNotFound();
      return { row, content: readContent(row) };
    });
  }

  /**
   * Who may practise a lesson: the rule lesson playback applies. Admins,
   * the course's creator and staff who manage it always; anyone on a
   * preview lesson; anyone on a free course that is not restricted; anyone
   * else while they hold the course (and the lesson's section, for part of
   * a course). An unpublished lesson or course answers "not found".
   */
  async function requireLessonAccess(
    actor: CodingActor,
    assignment: Pick<AssignmentRow, "course_id" | "lesson_id">,
  ) {
    const course = await courseService.findCourseById(assignment.course_id);
    if (!course || course.deleted_at) throw CodingErrors.assignmentNotFound();
    const isManager =
      isAdmin(actor) ||
      course.creator_id === actor.id ||
      (await mayManageCourse(
        database,
        course,
        actor.id,
        actor.roles,
        "coding.read",
      ));
    if (isManager) return { course, isManager };
    if (!assignment.lesson_id) return await requireCourseAccess(actor, course);
    const content = await courseService.getCourseContent(course);
    const lesson = content.lessons.find(
      (item) => item.id === assignment.lesson_id,
    );
    if (
      !lesson?.is_published ||
      !(await accessService.isCourseOpenToLearner(database, actor.id, course))
    )
      throw CodingErrors.assignmentNotFound();
    if (lesson.is_preview) return { course, isManager };
    if (
      isOpenFreeCourse({
        pricing_type: content.pricing?.pricing_type,
        access_type: content.accessRule?.access_type,
      })
    )
      return { course, isManager };
    const scope = await accessService.getAccessScope(
      database,
      actor.id,
      course.id,
    );
    if (!scope)
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
        "Get the course to practise this lesson.",
      );
    if (!scopeOpensSection(scope, lesson.section_id))
      throw new AppError(
        403,
        "LESSON_ACCESS_DENIED",
        "This lesson is not part of your access to the course.",
      );
    return { course, isManager };
  }

  /**
   * The course's practice list (not under a lecture): open to whoever holds
   * any part of the course, and to everyone on an open free course.
   */
  async function requireCourseAccess(
    actor: CodingActor,
    course: NonNullable<
      Awaited<ReturnType<typeof courseService.findCourseById>>
    >,
  ) {
    if (
      !(await accessService.isCourseOpenToLearner(database, actor.id, course))
    )
      throw CodingErrors.assignmentNotFound();
    const content = await courseService.getCourseContent(course);
    if (
      isOpenFreeCourse({
        pricing_type: content.pricing?.pricing_type,
        access_type: content.accessRule?.access_type,
      })
    )
      return { course, isManager: false };
    const scope = await accessService.getAccessScope(
      database,
      actor.id,
      course.id,
    );
    if (!scope)
      throw new AppError(
        403,
        "COURSE_ACCESS_REQUIRED",
        "Get the course to practise.",
      );
    return { course, isManager: false };
  }

  /**
   * The lessons of a course whose practice this learner may open, by the
   * rule of requireLessonAccess: every published lesson for staff, on an
   * open free course and for whoever holds the course (their sections);
   * otherwise only the free-preview lessons. Null: every lesson.
   */
  async function practisableLessons(
    actor: CodingActor,
    courseId: string,
  ): Promise<Set<string> | null> {
    const course = await courseService.findCourseById(courseId);
    if (!course || course.deleted_at) throw CodingErrors.assignmentNotFound();
    const isManager =
      isAdmin(actor) ||
      course.creator_id === actor.id ||
      (await mayManageCourse(
        database,
        course,
        actor.id,
        actor.roles,
        "coding.read",
      ));
    if (isManager) return null;
    if (
      !(await accessService.isCourseOpenToLearner(database, actor.id, course))
    )
      throw CodingErrors.assignmentNotFound();
    const content = await courseService.getCourseContent(course);
    const published = content.lessons.filter((lesson) => lesson.is_published);
    if (
      isOpenFreeCourse({
        pricing_type: content.pricing?.pricing_type,
        access_type: content.accessRule?.access_type,
      })
    )
      return new Set(published.map((lesson) => lesson.id));
    const scope = await accessService.getAccessScope(
      database,
      actor.id,
      course.id,
    );
    return new Set(
      published
        .filter(
          (lesson) =>
            lesson.is_preview ||
            (scope ? scopeOpensSection(scope, lesson.section_id) : false),
        )
        .map((lesson) => lesson.id),
    );
  }

  /**
   * The course's practice by lecture, with how far this learner got: the
   * lessons list marks the lectures that have some. Only lectures the
   * learner can open are listed (a free preview's, without the course).
   */
  async function listCoursePractice(
    actor: CodingActor,
    courseId: string,
  ): Promise<LecturePracticeResponse> {
    const open = await practisableLessons(actor, courseId);
    const rows = (
      await repo.listCoursePractice(database, courseId, actor.id)
    ).filter((row) => open === null || open.has(row.lesson_id));
    return {
      items: rows.map((row) => ({
        assignmentId: row.id,
        lessonId: row.lesson_id,
        title: row.title,
        kind: row.kind,
        difficulty: row.difficulty,
        estimatedMinutes: row.estimated_minutes,
        status: row.first_passed_at
          ? "done"
          : (row.attempts_count ?? 0) > 0
            ? "started"
            : "new",
      })),
    };
  }

  async function requireAssignment(assignmentId: string) {
    const assignment = await repo.findAssignment(database, assignmentId);
    if (!assignment) throw CodingErrors.assignmentNotFound();
    return assignment;
  }

  /**
   * A lecture's practice: its published questions, with how far this
   * learner got. Drafts are not listed.
   */
  async function listLecturePractice(
    actor: CodingActor,
    courseId: string,
    lessonId: string,
  ): Promise<LecturePracticeResponse> {
    await requireLessonAccess(actor, {
      course_id: courseId,
      lesson_id: lessonId,
    });
    const rows = await repo.listLecturePractice(database, lessonId, actor.id);
    return {
      items: rows.map((row) => ({
        assignmentId: row.id,
        lessonId: row.lesson_id,
        title: row.title,
        kind: row.kind,
        difficulty: row.difficulty,
        estimatedMinutes: row.estimated_minutes,
        status: row.first_passed_at
          ? "done"
          : (row.attempts_count ?? 0) > 0
            ? "started"
            : "new",
      })),
    };
  }

  /** One practice exercise with the learner's state and newest code. */
  async function getPractice(
    actor: CodingActor,
    assignmentId: string,
  ): Promise<CodingLesson> {
    const assignment = await requireAssignment(assignmentId);
    await requireLessonAccess(actor, assignment);
    const [{ row: version, content }, exercise, state, code] =
      await Promise.all([
        loadVersion(assignment.exercise_version_id),
        repo.findExercise(database, assignment.exercise_id),
        repo.findLearnerState(database, actor.id, assignment.id),
        repo.findLatestCode(database, actor.id, assignment.id),
      ]);
    if (!exercise) throw CodingErrors.assignmentNotFound();
    return {
      assignment: {
        id: assignment.id,
        courseId: assignment.course_id,
        lessonId: assignment.lesson_id,
        required: assignment.required,
        solutionPolicy: assignment.solution_policy,
        solutionAfterFailedSubmits: assignment.solution_after_failed_submits,
      },
      exercise: {
        id: exercise.id,
        versionId: assignment.exercise_version_id,
        title: exercise.title,
        kind: exercise.kind,
        difficulty: exercise.difficulty,
        estimatedMinutes: exercise.estimated_minutes,
        statement: content.statement,
        starterFiles: content.starterFiles.filter((file) => !file.hidden),
        supportFiles: content.starterFiles.filter((file) => file.hidden),
        entry: content.entry,
        tests: content.tests,
        hints: content.hints,
        settings: content.settings,
        suiteHash: version.suite_hash,
      },
      state: presentState(assignment, state),
      draft: code
        ? {
            versionId: code.exercise_version_id,
            files: readFiles(code.files),
            updatedAt: code.updated_at.toISOString(),
          }
        : null,
    };
  }

  /**
   * Only the starter's visible, editable files are the learner's to send;
   * read-only and hidden files always come from the exercise.
   */
  function assertLearnerFiles(content: CodingContent, files: CodingFile[]) {
    const editable = new Set(
      content.starterFiles
        .filter((file) => !file.hidden && !file.readOnly)
        .map((file) => file.path),
    );
    for (const file of files) {
      if (!editable.has(file.path))
        throw new AppError(
          400,
          "CODING_UNKNOWN_FILE",
          `${file.path} is not a file of this exercise.`,
        );
    }
    if (totalBytes(files) > CODING_LIMITS.maxSubmissionBytes)
      throw new AppError(
        400,
        "CODING_TOO_LARGE",
        "Your code is too large to save. Remove what the exercise does not need.",
      );
    return files.map((file) => ({ path: file.path, content: file.content }));
  }

  async function saveDraft(
    actor: CodingActor,
    assignmentId: string,
    payload: SaveCodingDraftRequest,
  ) {
    const assignment = await requireAssignment(assignmentId);
    await requireLessonAccess(actor, assignment);
    const { content } = await loadVersion(assignment.exercise_version_id);
    const files = assertLearnerFiles(content, payload.files);
    const now = new Date();
    // A draft lost in a failover only costs the last edits, which the
    // device still holds: it need not wait for the standby.
    await withLocalCommit(database, (trx) =>
      repo.upsertDraft(trx, {
        userId: actor.id,
        assignmentId,
        versionId: payload.versionId,
        files,
        now,
      }),
    );
    return { savedAt: now.toISOString() };
  }

  /**
   * Records one submit. The browser ran every test of the pinned version;
   * the API checks the report is for that suite and complete, then stores
   * it. A pass completes the lesson (the progress gate asks this module).
   */
  async function submit(
    actor: CodingActor,
    assignmentId: string,
    payload: SubmitCodingRequest,
  ): Promise<SubmitCodingResponse> {
    const assignment = await requireAssignment(assignmentId);
    await requireLessonAccess(actor, assignment);
    if (payload.versionId !== assignment.exercise_version_id)
      throw CodingErrors.versionChanged();
    const { row: version, content } = await loadVersion(
      assignment.exercise_version_id,
    );
    if (payload.suiteHash !== version.suite_hash)
      throw CodingErrors.versionChanged();
    const files = assertLearnerFiles(content, payload.files);

    const expected = expectedTests(content.tests);
    const reported = new Map(
      payload.results.map((result) => [result.id, result]),
    );
    if (
      reported.size !== payload.results.length ||
      reported.size !== expected.length ||
      expected.some((test) => !reported.has(test.id))
    )
      throw new AppError(
        400,
        "CODING_RESULTS_MISMATCH",
        "The results do not match this exercise's tests. Reload the lesson and submit again.",
      );
    const failedTestIds = expected
      .filter((test) => !reported.get(test.id)!.passed)
      .map((test) => test.id);
    // With no tests, a submit is the learner marking their practice done.
    const passed = failedTestIds.length === 0;
    const results = expected.map((test) => {
      const result = reported.get(test.id)!;
      return {
        id: test.id,
        passed: result.passed,
        ms: result.ms,
        message: result.message?.slice(0, 500),
      };
    });

    const submissionId = crypto.randomUUID();
    const now = new Date();
    const work = async (trx: DatabaseExecutor) => {
      const previous = await repo.findLearnerState(trx, actor.id, assignmentId);
      await repo.insertSubmission(trx, {
        id: submissionId,
        userId: actor.id,
        assignmentId,
        versionId: version.id,
        suiteHash: version.suite_hash,
        passed,
        passedCount: expected.length - failedTestIds.length,
        totalCount: expected.length,
        failedTestIds,
        files,
        results,
        durationMs: payload.durationMs ?? null,
        now,
      });
      const state = await repo.recordAttempt(trx, {
        userId: actor.id,
        assignmentId,
        versionId: version.id,
        passed,
        now,
      });
      if (!passed)
        await repo.pruneFailedSubmissions(trx, {
          userId: actor.id,
          assignmentId,
          keep: CODING_LIMITS.keptFailedSubmissions,
        });
      return { state, firstPass: passed && !previous?.first_passed_at };
    };
    // A pass completes the lesson, so it waits for the standby like any
    // other record a learner relies on; a failed attempt does not.
    const { state, firstPass } = passed
      ? await database.transaction().execute(work)
      : await withLocalCommit(database, work);
    return {
      submissionId,
      passed,
      passedCount: expected.length - failedTestIds.length,
      totalCount: expected.length,
      firstPass,
      state: presentState(assignment, state),
    };
  }

  async function listSubmissions(actor: CodingActor, assignmentId: string) {
    const assignment = await requireAssignment(assignmentId);
    await requireLessonAccess(actor, assignment);
    const rows = await repo.listSubmissions(database, {
      userId: actor.id,
      assignmentId,
      limit: SUBMISSION_HISTORY_LIMIT,
    });
    return {
      submissions: rows.map((row) => ({
        id: row.id,
        passed: row.passed,
        passedCount: row.passed_count,
        totalCount: row.total_count,
        failedTestIds: row.failed_test_ids ?? [],
        versionNumber: row.version_number,
        createdAt: row.created_at.toISOString(),
        files: row.files === null ? null : readFiles(row.files),
      })),
    };
  }

  /** The solution, when the lesson's rule allows it; the view is recorded. */
  async function solution(actor: CodingActor, assignmentId: string) {
    const assignment = await requireAssignment(assignmentId);
    const { isManager } = await requireLessonAccess(actor, assignment);
    const current = await repo.findLearnerState(
      database,
      actor.id,
      assignmentId,
    );
    if (!isManager && !solutionAllowed(assignment, current ?? null))
      throw new AppError(
        403,
        "CODING_SOLUTION_LOCKED",
        assignment.solution_policy === "never"
          ? "This exercise's solution is not shared."
          : assignment.solution_policy === "after_pass"
            ? "The solution opens once you pass."
            : `The solution opens after ${assignment.solution_after_failed_submits} attempts, or once you pass.`,
      );
    const { content } = await loadVersion(assignment.exercise_version_id);
    const state = await withLocalCommit(database, (trx) =>
      repo.recordSolutionView(trx, {
        userId: actor.id,
        assignmentId,
        now: new Date(),
      }),
    );
    return {
      files: content.solutionFiles.map((file) => ({
        path: file.path,
        content: file.content,
      })),
      state: presentState(assignment, state),
    };
  }

  return {
    listCoursePractice,
    listLecturePractice,
    getPractice,
    saveDraft,
    submit,
    listSubmissions,
    solution,
  };
}

export type CodingLearnerService = ReturnType<typeof createLearnerService>;
