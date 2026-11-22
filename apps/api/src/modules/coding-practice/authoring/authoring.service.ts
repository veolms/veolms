import crypto from "node:crypto";
import type {
  CodingExercise,
  CodingExerciseKind,
  CourseCodingExercise,
  CreateCodingExerciseRequest,
  PublishCodingExerciseRequest,
  UpdateCodingExerciseRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as repo from "../shared/coding.repository.ts";
import {
  presentAssignment,
  presentVersion,
  readContent,
  type VersionRow,
} from "../shared/coding.presenters.ts";
import {
  hasTests,
  suiteHash,
  templateFor,
  testsFormatFor,
  type CodingContent,
} from "../shared/coding.suite.ts";
import {
  assertCanManageCourse,
  CodingErrors,
  requireAcademyId,
  type CodingActor,
  type CodingServiceOptions,
} from "../shared/coding.types.ts";

type ExerciseRow = NonNullable<Awaited<ReturnType<typeof repo.findExercise>>>;

const contentKeys = [
  "statement",
  "starterFiles",
  "solutionFiles",
  "entry",
  "tests",
  "hints",
  "settings",
] as const;

/**
 * What stops a version from being published. Drafts may be incomplete while
 * the author works. Tests are optional (practice without them is allowed);
 * when there are tests, they need a solution that passes them.
 */
export function publishProblems(
  kind: CodingExerciseKind,
  content: CodingContent,
): string[] {
  const problems: string[] = [];
  const testsWritten = hasTests(content.tests);
  const visible = content.starterFiles.filter((file) => !file.hidden);
  const paths = new Set(content.starterFiles.map((file) => file.path));
  if (!content.statement.trim()) problems.push("Write the problem statement.");
  if (visible.length === 0)
    problems.push("Add at least one starter file the learner can see.");
  if (!paths.has(content.entry.file))
    problems.push(
      `The entry file ${content.entry.file} is not a starter file.`,
    );
  if (content.tests.format !== testsFormatFor(kind))
    problems.push("The tests do not match this kind of exercise.");
  if (kind === "function" && content.tests.format === "cases" && testsWritten) {
    if (!content.entry.name) problems.push("Name the function the tests call.");
    if (content.tests.cases.every((test) => test.hidden))
      problems.push("Show at least one test case to the learner.");
    const ids = new Set(content.tests.cases.map((test) => test.id));
    if (ids.size !== content.tests.cases.length)
      problems.push("Two test cases share an id.");
  }
  if (kind === "web" && !content.entry.file.endsWith(".html"))
    problems.push("A web exercise starts from an .html file.");
  if (kind === "react" && !/\.(jsx|tsx|js|ts)$/.test(content.entry.file))
    problems.push("A React exercise starts from a .jsx or .tsx file.");
  if (kind === "node" && !/\.(js|cjs|mjs|ts)$/.test(content.entry.file))
    problems.push("A Node.js exercise starts from a .js or .ts file.");
  return problems;
}

export function createAuthoringService(options: CodingServiceOptions) {
  const { database, courseService } = options;

  async function requireCourse(courseId: string) {
    const course = await courseService.findCourseById(courseId);
    if (!course || course.deleted_at)
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    return course;
  }

  /** An exercise, if the actor may work on its course. */
  async function requireExercise(
    actor: CodingActor,
    exerciseId: string,
    permission: "coding.read" | "coding.manage",
  ) {
    const exercise = await repo.findExercise(database, exerciseId);
    if (!exercise) throw CodingErrors.exerciseNotFound();
    const course = await courseService.findCourseById(exercise.course_id);
    if (!course || course.deleted_at) throw CodingErrors.exerciseNotFound();
    await assertCanManageCourse(database, actor, course, permission);
    return exercise;
  }

  const requireReadable = (actor: CodingActor, exerciseId: string) =>
    requireExercise(actor, exerciseId, "coding.read");
  const requireEditable = (actor: CodingActor, exerciseId: string) =>
    requireExercise(actor, exerciseId, "coding.manage");

  async function requireLatest(exerciseId: string) {
    const latest = await repo.findLatestVersion(database, exerciseId);
    if (!latest) throw CodingErrors.exerciseNotFound();
    return latest;
  }

  async function present(exercise: ExerciseRow): Promise<CodingExercise> {
    const [latest, versions, assignments] = await Promise.all([
      requireLatest(exercise.id),
      repo.listVersions(database, exercise.id),
      repo.listLinksByExercise(database, exercise.id),
    ]);
    // Lecture links only; the course-wide entry is implied by the course.
    const lectureLinks = assignments.filter(
      (item): item is typeof item & { lesson_id: string } =>
        item.lesson_id !== null,
    );
    const placed = await Promise.all(
      lectureLinks.map(async (assignment) => {
        const [course, lesson] = await Promise.all([
          courseService.findCourseById(assignment.course_id),
          courseService.findLessonById(
            assignment.course_id,
            assignment.lesson_id,
          ),
        ]);
        return {
          ...presentAssignment(assignment),
          courseTitle: course?.title ?? "Deleted course",
          lessonTitle: lesson?.title ?? "Deleted lesson",
        };
      }),
    );
    return {
      id: exercise.id,
      title: exercise.title,
      kind: exercise.kind,
      difficulty: exercise.difficulty,
      estimatedMinutes: exercise.estimated_minutes,
      status: exercise.status,
      editable: presentVersion(latest),
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        publishedAt: version.published_at?.toISOString() ?? null,
      })),
      assignments: placed,
      updatedAt: exercise.updated_at.toISOString(),
    };
  }

  /** The course's exercises for the Practice panel, with their lectures. */
  async function listCourse(
    actor: CodingActor,
    courseId: string,
  ): Promise<CourseCodingExercise[]> {
    const course = await requireCourse(courseId);
    await assertCanManageCourse(database, actor, course, "coding.read");
    const [rows, links] = await Promise.all([
      repo.listCourseExercises(database, courseId),
      repo.listCourseLinks(database, courseId),
    ]);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimated_minutes,
      status: row.status,
      latestPublishedVersion: row.latest_published,
      hasUnpublishedChanges:
        row.latest_published === null ||
        row.latest_version > row.latest_published,
      lectures: links
        .filter((link) => link.exercise_id === row.id)
        .map((link) => ({
          assignmentId: link.id,
          lessonId: link.lesson_id,
          lessonTitle: link.lesson_title,
        })),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /** A new, blank question on one lecture of a course. */
  async function create(
    actor: CodingActor,
    courseId: string,
    payload: CreateCodingExerciseRequest,
  ): Promise<CodingExercise> {
    await requireManagedLesson(actor, courseId, payload.lessonId);
    const academyId = await requireAcademyId(options);
    const id = crypto.randomUUID();
    const now = new Date();
    const content = templateFor(payload.kind, payload.language ?? "javascript");
    await database.transaction().execute(async (trx) => {
      await repo.insertExercise(trx, {
        id,
        academy_id: academyId,
        course_id: courseId,
        creator_id: actor.id,
        title: payload.title,
        kind: payload.kind,
        difficulty: payload.difficulty ?? "easy",
        estimated_minutes: payload.estimatedMinutes ?? 10,
        status: "draft",
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await repo.insertVersion(
        trx,
        versionValues(crypto.randomUUID(), id, 1, payload.kind, content, now),
      );
      // On its lecture from the start: learners see it there once it is
      // published.
      await repo.insertAssignment(trx, {
        id: crypto.randomUUID(),
        exercise_id: id,
        exercise_version_id: null,
        course_id: courseId,
        lesson_id: payload.lessonId,
        required: false,
        solution_policy: "never",
        solution_after_failed_submits: 3,
        created_at: now,
        updated_at: now,
      });
    });
    return await present((await repo.findExercise(database, id))!);
  }

  function versionValues(
    id: string,
    exerciseId: string,
    versionNumber: number,
    kind: CodingExerciseKind,
    content: CodingContent,
    now: Date,
  ) {
    return {
      id,
      exercise_id: exerciseId,
      version_number: versionNumber,
      statement: content.statement,
      starter_files: repo.toJson(content.starterFiles),
      solution_files: repo.toJson(content.solutionFiles),
      entry: repo.toJson(content.entry),
      tests: repo.toJson(content.tests),
      hints: repo.toJson(content.hints),
      settings: repo.toJson(content.settings),
      suite_hash: suiteHash(kind, content),
      validated_at: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    };
  }

  async function get(actor: CodingActor, exerciseId: string) {
    return await present(await requireReadable(actor, exerciseId));
  }

  /**
   * Saves the author's edits. Exercise details change in place; content
   * goes to the draft version, which is created from the newest version
   * when that one is already published (published versions never change).
   */
  async function update(
    actor: CodingActor,
    exerciseId: string,
    payload: UpdateCodingExerciseRequest,
  ) {
    const exercise = await requireEditable(actor, exerciseId);
    const now = new Date();
    const touchesContent = contentKeys.some(
      (key) => payload[key] !== undefined,
    );
    if (payload.tests && payload.tests.format !== testsFormatFor(exercise.kind))
      throw new AppError(
        400,
        "CODING_TESTS_FORMAT",
        exercise.kind === "function"
          ? "A JavaScript function exercise uses a table of test cases."
          : "This exercise uses a test file.",
      );
    await database.transaction().execute(async (trx) => {
      await repo.updateExercise(trx, exerciseId, {
        title: payload.title,
        difficulty: payload.difficulty,
        estimated_minutes: payload.estimatedMinutes,
        updated_at: now,
      });
      if (!touchesContent) return;
      const latest = await repo.findLatestVersion(trx, exerciseId);
      if (!latest) throw CodingErrors.exerciseNotFound();
      const merged = mergeContent(readContent(latest), payload);
      if (latest.published_at) {
        await repo.insertVersion(
          trx,
          versionValues(
            crypto.randomUUID(),
            exerciseId,
            latest.version_number + 1,
            exercise.kind,
            merged,
            now,
          ),
        );
      } else {
        const values = versionValues(
          latest.id,
          exerciseId,
          latest.version_number,
          exercise.kind,
          merged,
          now,
        );
        await repo.updateVersion(trx, latest.id, {
          statement: values.statement,
          starter_files: values.starter_files,
          solution_files: values.solution_files,
          entry: values.entry,
          tests: values.tests,
          hints: values.hints,
          settings: values.settings,
          suite_hash: values.suite_hash,
          validated_at: null,
          updated_at: now,
        });
      }
    });
    return await present((await repo.findExercise(database, exerciseId))!);
  }

  function mergeContent(
    current: CodingContent,
    payload: UpdateCodingExerciseRequest,
  ): CodingContent {
    const tests = payload.tests ?? current.tests;
    return {
      statement: payload.statement ?? current.statement,
      starterFiles: payload.starterFiles ?? current.starterFiles,
      solutionFiles: payload.solutionFiles ?? current.solutionFiles,
      entry: payload.entry ?? current.entry,
      // A script's found tests are set at publish; an edit clears them.
      tests:
        tests.format === "script" && payload.tests
          ? { ...tests, tests: [] }
          : tests,
      hints: payload.hints ?? current.hints,
      settings: payload.settings ?? current.settings,
    };
  }

  /**
   * Publishes the draft. The author's browser ran the suite against the
   * solution (must pass) and the starter (must fail at least one test); the
   * report names the fingerprint it ran, which must be the draft's.
   */
  async function publish(
    actor: CodingActor,
    exerciseId: string,
    report: PublishCodingExerciseRequest,
  ) {
    const exercise = await requireEditable(actor, exerciseId);
    const latest = await requireLatest(exerciseId);
    if (latest.published_at)
      throw new AppError(
        409,
        "CODING_NOTHING_TO_PUBLISH",
        `Version ${latest.version_number} is already published. Make a change first.`,
      );
    if (report.suiteHash !== latest.suite_hash)
      throw new AppError(
        409,
        "CODING_SUITE_CHANGED",
        "The tests changed after you validated. Validate again, then publish.",
      );
    const testsWritten = hasTests(readContent(latest).tests);
    let content = readContent(latest);
    if (content.tests.format === "script" && testsWritten) {
      const found = report.scriptTests ?? [];
      if (found.length === 0)
        throw new AppError(
          400,
          "CODING_NO_TESTS",
          "Validation found no tests. Add test(...) calls to the test file.",
        );
      if (new Set(found.map((test) => test.id)).size !== found.length)
        throw new AppError(
          400,
          "CODING_DUPLICATE_TESTS",
          "Two tests have the same name. Give each test its own name.",
        );
      if (found.every((test) => test.hidden))
        throw new AppError(
          400,
          "CODING_ALL_HIDDEN",
          "Show at least one test to the learner.",
        );
      content = { ...content, tests: { ...content.tests, tests: found } };
    }
    const problems = publishProblems(exercise.kind, content);
    if (problems.length > 0)
      throw new AppError(400, "CODING_INCOMPLETE", problems.join(" "));
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      await repo.updateVersion(trx, latest.id, {
        tests: repo.toJson(content.tests),
        suite_hash: suiteHash(exercise.kind, content),
        validated_at: now,
        published_at: now,
        updated_at: now,
      });
      await repo.updateExercise(trx, exerciseId, {
        status: "published",
        updated_at: now,
      });
      // Its lecture shows this version from now on.
      await repo.pinAssignments(trx, exerciseId, latest.id, now);
    });
    return await present((await repo.findExercise(database, exerciseId))!);
  }

  /** Deletes an exercise, unless learners have already practised it. */
  async function remove(actor: CodingActor, exerciseId: string) {
    await requireEditable(actor, exerciseId);
    const links = await repo.listLinksByExercise(database, exerciseId);
    for (const link of links) {
      if ((await repo.countSubmissions(database, link.id)) > 0)
        throw new AppError(
          409,
          "CODING_EXERCISE_PRACTISED",
          "Learners have already practised this exercise, so it can't be deleted. Detach it from its lectures instead.",
        );
    }
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      for (const link of links) await repo.deleteAssignment(trx, link.id);
      await repo.updateExercise(trx, exerciseId, {
        deleted_at: now,
        updated_at: now,
      });
    });
    return { success: true as const };
  }

  async function requireManagedLesson(
    actor: CodingActor,
    courseId: string,
    lessonId: string,
  ) {
    const course = await requireCourse(courseId);
    await assertCanManageCourse(database, actor, course, "coding.manage");
    const lesson = await courseService.findLessonById(courseId, lessonId);
    if (!lesson)
      throw new AppError(404, "LESSON_NOT_FOUND", "Lecture not found.");
    return { course, lesson };
  }

  return {
    listCourse,
    create,
    get,
    update,
    publish,
    remove,
  };
}

export type CodingAuthoringService = ReturnType<typeof createAuthoringService>;
export type { VersionRow };
