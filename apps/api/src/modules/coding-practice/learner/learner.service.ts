import crypto from "node:crypto";
import type {
  CodingDifficulty,
  CodingExerciseKind,
  CodingFile,
  CodingLesson,
  CodingPracticeStats,
  LecturePracticeResponse,
  PracticeCoursesResponse,
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
  presentSubmission,
  readContent,
  readFiles,
  readSettings,
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
/** Coding seconds the first save of a question may count. */
const FIRST_ACTIVITY_ALLOWANCE_SECONDS = 120;

/** Today's date (YYYY-MM-DD) in a time zone. */
function localDate(now: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * Days in a row with a submit. The current run counts if it reaches today
 * or yesterday (today's practice may not have happened yet).
 */
export function streakOf(days: readonly string[], today: string) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    const number = dayNumber(day);
    run = previous !== null && number - previous === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = number;
  }
  const last = previous;
  const current =
    last !== null && dayNumber(today) - last <= 1 && dayNumber(today) >= last
      ? run
      : 0;
  return { current, best };
}

export function createLearnerService(options: CodingServiceOptions) {
  const { database, courseService, accessService, activityCredit } = options;

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
    return { items: await presentPracticeItems(courseId, rows) };
  }

  /**
   * List rows with what the practice list shows: the lecture and section,
   * topics, and whether it is a timed round; in curriculum order.
   */
  async function presentPracticeItems(
    courseId: string,
    rows: Array<{
      id: string;
      lesson_id: string | null;
      title: string;
      kind: CodingExerciseKind;
      difficulty: CodingDifficulty;
      estimated_minutes: number;
      attempts_count: number | null;
      first_passed_at: Date | null;
    }>,
  ): Promise<LecturePracticeResponse["items"]> {
    const course = await courseService.findCourseById(courseId);
    const [content, details] = await Promise.all([
      course ? courseService.getCourseContent(course) : null,
      repo.listPracticeDetails(
        database,
        rows.map((row) => row.id),
      ),
    ]);
    const lessons = new Map(
      (content?.lessons ?? []).map((lesson) => [lesson.id, lesson]),
    );
    const sections = new Map(
      (content?.sections ?? []).map((section) => [section.id, section]),
    );
    const extra = new Map(details.map((row) => [row.id, row]));
    const place = (lessonId: string | null) => {
      const lesson = lessonId ? lessons.get(lessonId) : undefined;
      const section = lesson ? sections.get(lesson.section_id) : undefined;
      return [section?.position ?? 1e9, lesson?.position ?? 1e9] as const;
    };
    const ordered = rows
      .map((row, index) => ({ row, index, at: place(row.lesson_id) }))
      .sort(
        (left, right) =>
          left.at[0] - right.at[0] ||
          left.at[1] - right.at[1] ||
          left.index - right.index,
      );
    return ordered.map(({ row }) => {
      const lesson = row.lesson_id ? lessons.get(row.lesson_id) : undefined;
      const section = lesson ? sections.get(lesson.section_id) : undefined;
      const more = extra.get(row.id);
      const settings = more
        ? readSettings(more.settings)
        : { mode: "practice" as const, timeLimitMinutes: null };
      return {
        assignmentId: row.id,
        lessonId: row.lesson_id,
        title: row.title,
        kind: row.kind,
        difficulty: row.difficulty,
        estimatedMinutes: row.estimated_minutes,
        status: row.first_passed_at
          ? ("done" as const)
          : (row.attempts_count ?? 0) > 0
            ? ("started" as const)
            : ("new" as const),
        lessonTitle: lesson?.title ?? null,
        sectionTitle: section?.title ?? null,
        topics: more?.topics ?? [],
        mode: settings.mode,
        timeLimitMinutes: settings.timeLimitMinutes,
      };
    });
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
    return { items: await presentPracticeItems(courseId, rows) };
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
    const lesson = assignment.lesson_id
      ? await courseService.findLessonById(
          assignment.course_id,
          assignment.lesson_id,
        )
      : null;
    return {
      assignment: {
        id: assignment.id,
        courseId: assignment.course_id,
        lessonId: assignment.lesson_id,
        lessonTitle: lesson?.title ?? null,
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
        topics: exercise.topics ?? [],
        hasEditorial:
          content.editorial.trim().length > 0 ||
          content.solutionFiles.length > 0,
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
    await withLocalCommit(database, async (trx) => {
      await repo.upsertDraft(trx, {
        userId: actor.id,
        assignmentId,
        versionId: payload.versionId,
        files,
        now,
      });
      await creditActivity(trx, actor.id, assignment.course_id, {
        assignmentId,
        activeSeconds: payload.activeSeconds ?? 0,
        completions: 0,
        now,
      });
    });
    return { savedAt: now.toISOString() };
  }

  /**
   * Counts coding time (capped by the time since the last credit) and a
   * first solve into the learner's day: streak, goal, calendar.
   */
  async function creditActivity(
    trx: DatabaseExecutor,
    userId: string,
    courseId: string,
    input: {
      assignmentId: string;
      activeSeconds: number;
      completions: number;
      now: Date;
    },
  ) {
    const seconds =
      input.activeSeconds > 0
        ? await repo.addActiveSeconds(trx, {
            userId,
            assignmentId: input.assignmentId,
            claimed: input.activeSeconds,
            firstAllowance: FIRST_ACTIVITY_ALLOWANCE_SECONDS,
            maxGap: CODING_LIMITS.maxActiveSecondsPerSave,
            now: input.now,
          })
        : 0;
    if (seconds > 0 || input.completions > 0)
      await activityCredit.credit(trx, {
        userId,
        courseId,
        seconds,
        completions: input.completions,
      });
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
        solveSeconds: payload.solveSeconds ?? null,
        now,
      });
      let state = await repo.recordAttempt(trx, {
        userId: actor.id,
        assignmentId,
        versionId: version.id,
        passed,
        solveSeconds: payload.solveSeconds ?? null,
        now,
      });
      const firstPass = passed && !previous?.first_passed_at;
      await creditActivity(trx, actor.id, assignment.course_id, {
        assignmentId,
        activeSeconds: payload.activeSeconds ?? 0,
        completions: firstPass ? 1 : 0,
        now,
      });
      if (payload.activeSeconds)
        state =
          (await repo.findLearnerState(trx, actor.id, assignmentId)) ?? state;
      if (!passed)
        await repo.pruneFailedSubmissions(trx, {
          userId: actor.id,
          assignmentId,
          keep: CODING_LIMITS.keptFailedSubmissions,
        });
      return { state, firstPass };
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
      submissions: rows.map(presentSubmission),
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
      editorial: content.editorial,
      state: presentState(assignment, state),
    };
  }

  /** Every course with practice that this learner can open, and its lessons. */
  async function openPracticeCourses(actor: CodingActor) {
    const courseIds = await repo.listCoursesWithPractice(database);
    const opened = await Promise.all(
      courseIds.map(async (courseId) => {
        try {
          return { courseId, open: await practisableLessons(actor, courseId) };
        } catch {
          return null; // not open to this learner (unpublished, no access)
        }
      }),
    );
    return opened.filter(
      (entry): entry is { courseId: string; open: Set<string> | null } =>
        entry !== null && (entry.open === null || entry.open.size > 0),
    );
  }

  /**
   * The learner's practice at a glance: solved by difficulty against what
   * they can open, streak and calendar (their time zone), recent submits.
   * For one course, or for all of them.
   */
  async function stats(
    actor: CodingActor,
    courseId: string | null,
  ): Promise<CodingPracticeStats> {
    const courses = courseId
      ? [{ courseId, open: await practisableLessons(actor, courseId) }]
      : await openPracticeCourses(actor);
    const ids = courses.map((entry) => entry.courseId);
    const openByCourse = new Map(
      courses.map((entry) => [entry.courseId, entry.open]),
    );
    const [assignments, states, timeZone] = await Promise.all([
      repo.listPublishedAssignments(database, ids),
      repo.listMyStates(database, actor.id),
      activityCredit.timeZone(database, actor.id),
    ]);
    const visible = assignments.filter((row) => {
      const open = openByCourse.get(row.course_id);
      return open === null || Boolean(open?.has(row.lesson_id));
    });
    const byId = new Map(visible.map((row) => [row.id, row]));
    const counts = () => ({ easy: 0, medium: 0, hard: 0 });
    const available = counts();
    const solved = counts();
    for (const row of visible) available[row.difficulty] += 1;
    let attempted = 0;
    let activeSeconds = 0;
    for (const state of states) {
      if (courseId && state.course_id !== courseId) continue;
      activeSeconds += state.active_seconds ?? 0;
      const row = byId.get(state.assignment_id);
      if (!row) continue;
      if (state.first_passed_at) solved[row.difficulty] += 1;
      else if ((state.attempts_count ?? 0) > 0) attempted += 1;
    }
    const [calendar, recent] = await Promise.all([
      repo.listSubmissionDays(database, {
        userId: actor.id,
        timeZone,
        courseId,
      }),
      repo.listRecentSubmissions(database, {
        userId: actor.id,
        courseId,
        limit: 10,
      }),
    ]);
    return {
      solved,
      available,
      attempted,
      submissions: calendar.reduce((sum, day) => sum + day.submissions, 0),
      activeMinutes: Math.round(activeSeconds / 60),
      streak: streakOf(
        calendar.map((day) => day.date),
        localDate(new Date(), timeZone),
      ),
      calendar,
      recent: recent.map((row) => ({
        assignmentId: row.assignment_id,
        courseId: row.course_id,
        title: row.title,
        difficulty: row.difficulty,
        passed: row.passed,
        createdAt: row.created_at.toISOString(),
      })),
      timeZone,
    };
  }

  /** The learner's courses with practice, for the Coding Lab home. */
  async function practiceCourses(
    actor: CodingActor,
  ): Promise<PracticeCoursesResponse> {
    const courses = await openPracticeCourses(actor);
    const ids = courses.map((entry) => entry.courseId);
    const [assignments, states] = await Promise.all([
      repo.listPublishedAssignments(database, ids),
      repo.listMyStates(database, actor.id),
    ]);
    const stateById = new Map(states.map((row) => [row.assignment_id, row]));
    const rows = await Promise.all(
      courses.map(async ({ courseId, open }) => {
        const course = await courseService.findCourseById(courseId);
        if (!course) return null;
        const mine = assignments.filter(
          (row) =>
            row.course_id === courseId &&
            (open === null || open.has(row.lesson_id)),
        );
        let solvedCount = 0;
        let attemptedCount = 0;
        let last: Date | null = null;
        for (const row of mine) {
          const state = stateById.get(row.id);
          if (!state) continue;
          if (state.first_passed_at) solvedCount += 1;
          else if ((state.attempts_count ?? 0) > 0) attemptedCount += 1;
          const at = state.last_activity_at ?? state.last_submitted_at;
          if (at && (!last || at > last)) last = at;
        }
        return {
          courseId,
          slug: course.slug,
          title: course.title,
          thumbnailUrl: null,
          total: mine.length,
          solved: solvedCount,
          attempted: attemptedCount,
          lastActivityAt: last ? (last as Date).toISOString() : null,
        };
      }),
    );
    return {
      courses: rows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .filter((row) => row.total > 0)
        .sort(
          (left, right) =>
            (right.lastActivityAt ?? "").localeCompare(
              left.lastActivityAt ?? "",
            ) || left.title.localeCompare(right.title),
        ),
    };
  }

  return {
    stats,
    practiceCourses,
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
