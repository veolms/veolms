import type {
  CodingAssignmentTable,
  CodingExerciseTable,
  CodingExerciseVersionTable,
  DatabaseExecutor,
} from "@veolms/database";
import { sql, type Insertable, type Updateable } from "kysely";

/** jsonb columns are written as JSON text: arrays would become SQL arrays. */
export const toJson = (value: unknown) => JSON.stringify(value ?? null);

/* ---------------------------------------------------------------- exercises */

export async function insertExercise(
  database: DatabaseExecutor,
  values: Insertable<CodingExerciseTable>,
) {
  await database.insertInto("coding_exercises").values(values).execute();
}

export function findExercise(database: DatabaseExecutor, id: string) {
  return database
    .selectFrom("coding_exercises")
    .selectAll()
    .where("id", "=", id)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function updateExercise(
  database: DatabaseExecutor,
  id: string,
  values: Updateable<CodingExerciseTable>,
) {
  await database
    .updateTable("coding_exercises")
    .set(values)
    .where("id", "=", id)
    .execute();
}

/**
 * A course's exercises with what each card shows: the newest published
 * version and whether a draft newer than it exists.
 */
export function listCourseExercises(
  database: DatabaseExecutor,
  courseId: string,
) {
  return database
    .selectFrom("coding_exercises as e")
    .select([
      "e.id",
      "e.title",
      "e.kind",
      "e.difficulty",
      "e.estimated_minutes",
      "e.status",
      "e.updated_at",
      sql<number | null>`(
        select max(v.version_number) from coding_exercise_versions v
        where v.exercise_id = e.id and v.published_at is not null
      )`.as("latest_published"),
      sql<number>`(
        select max(v.version_number) from coding_exercise_versions v
        where v.exercise_id = e.id
      )`.as("latest_version"),
    ])
    .where("e.course_id", "=", courseId)
    .where("e.deleted_at", "is", null)
    .orderBy("e.created_at", "asc")
    .limit(500)
    .execute();
}

/* ----------------------------------------------------------------- versions */

export async function insertVersion(
  database: DatabaseExecutor,
  values: Insertable<CodingExerciseVersionTable>,
) {
  await database
    .insertInto("coding_exercise_versions")
    .values(values)
    .execute();
}

export function findVersion(database: DatabaseExecutor, id: string) {
  return database
    .selectFrom("coding_exercise_versions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export function findLatestVersion(
  database: DatabaseExecutor,
  exerciseId: string,
) {
  return database
    .selectFrom("coding_exercise_versions")
    .selectAll()
    .where("exercise_id", "=", exerciseId)
    .orderBy("version_number", "desc")
    .limit(1)
    .executeTakeFirst();
}

export function findLatestPublishedVersion(
  database: DatabaseExecutor,
  exerciseId: string,
) {
  return database
    .selectFrom("coding_exercise_versions")
    .selectAll()
    .where("exercise_id", "=", exerciseId)
    .where("published_at", "is not", null)
    .orderBy("version_number", "desc")
    .limit(1)
    .executeTakeFirst();
}

export function listVersions(database: DatabaseExecutor, exerciseId: string) {
  return database
    .selectFrom("coding_exercise_versions")
    .select(["id", "version_number", "published_at"])
    .where("exercise_id", "=", exerciseId)
    .orderBy("version_number", "desc")
    .execute();
}

export async function updateVersion(
  database: DatabaseExecutor,
  id: string,
  values: Updateable<CodingExerciseVersionTable>,
) {
  await database
    .updateTable("coding_exercise_versions")
    .set(values)
    .where("id", "=", id)
    .where("published_at", "is", null)
    .execute();
}

/* -------------------------------------------------------------- assignments */

const assignmentColumns = [
  "a.id",
  "a.exercise_id",
  "a.exercise_version_id",
  "a.course_id",
  "a.lesson_id",
  "a.required",
  "a.solution_policy",
  "a.solution_after_failed_submits",
  "v.version_number",
] as const;

/** A live assignment (published version), as learners and results see it. */
export function findAssignment(database: DatabaseExecutor, id: string) {
  return database
    .selectFrom("coding_assignments as a")
    .innerJoin("coding_exercise_versions as v", "v.id", "a.exercise_version_id")
    .select(assignmentColumns)
    .where("a.id", "=", id)
    .$narrowType<{ exercise_version_id: string }>()
    .executeTakeFirst();
}

/**
 * Publishing moves every lecture the question is on to the new version:
 * learners get the edited question (their code is kept).
 */
export async function pinAssignments(
  database: DatabaseExecutor,
  exerciseId: string,
  versionId: string,
  now: Date,
) {
  await database
    .updateTable("coding_assignments")
    .set({ exercise_version_id: versionId, updated_at: now })
    .where("exercise_id", "=", exerciseId)
    .execute();
}

/** Every lecture link of a course's exercises, with the lecture's title. */
export function listCourseLinks(database: DatabaseExecutor, courseId: string) {
  return database
    .selectFrom("coding_assignments as a")
    .leftJoin("coding_exercise_versions as v", "v.id", "a.exercise_version_id")
    .innerJoin("course_lessons as l", "l.id", "a.lesson_id")
    .select([...assignmentColumns, "l.title as lesson_title"])
    .where("a.course_id", "=", courseId)
    .where("a.lesson_id", "is not", null)
    .orderBy("a.created_at")
    .$narrowType<{ lesson_id: string }>()
    .execute();
}

export function listLinksByExercise(
  database: DatabaseExecutor,
  exerciseId: string,
) {
  return database
    .selectFrom("coding_assignments as a")
    .leftJoin("coding_exercise_versions as v", "v.id", "a.exercise_version_id")
    .select(assignmentColumns)
    .where("a.exercise_id", "=", exerciseId)
    .execute();
}

/**
 * The course's practice for one learner: every published question on its
 * lectures, with the lecture and how far they got. The lessons playlist
 * marks the lectures that have practice with it.
 */
export function listCoursePractice(
  database: DatabaseExecutor,
  courseId: string,
  userId: string,
) {
  return database
    .selectFrom("coding_assignments as a")
    .innerJoin("coding_exercises as e", "e.id", "a.exercise_id")
    .leftJoin("coding_learner_states as s", (join) =>
      join.onRef("s.assignment_id", "=", "a.id").on("s.user_id", "=", userId),
    )
    .select([
      "a.id",
      "a.lesson_id",
      "a.exercise_version_id",
      "e.title",
      "e.kind",
      "e.difficulty",
      "e.estimated_minutes",
      "s.attempts_count",
      "s.first_passed_at",
    ])
    .where("a.course_id", "=", courseId)
    .where("a.lesson_id", "is not", null)
    .where("a.exercise_version_id", "is not", null)
    .where("e.deleted_at", "is", null)
    .orderBy("a.created_at")
    .$narrowType<{ exercise_version_id: string; lesson_id: string }>()
    .execute();
}

/**
 * A lecture's live practice for one learner: published exercises in the
 * order they were attached, with how far the learner got.
 */
export function listLecturePractice(
  database: DatabaseExecutor,
  lessonId: string,
  userId: string,
) {
  return database
    .selectFrom("coding_assignments as a")
    .innerJoin("coding_exercises as e", "e.id", "a.exercise_id")
    .leftJoin("coding_learner_states as s", (join) =>
      join.onRef("s.assignment_id", "=", "a.id").on("s.user_id", "=", userId),
    )
    .select([
      "a.id",
      "a.lesson_id",
      "a.exercise_version_id",
      "e.title",
      "e.kind",
      "e.difficulty",
      "e.estimated_minutes",
      "s.attempts_count",
      "s.first_passed_at",
    ])
    .where("a.lesson_id", "=", lessonId)
    .where("a.exercise_version_id", "is not", null)
    .where("e.deleted_at", "is", null)
    .orderBy("a.created_at")
    .$narrowType<{ exercise_version_id: string }>()
    .execute();
}

export async function insertAssignment(
  database: DatabaseExecutor,
  values: Insertable<CodingAssignmentTable>,
) {
  await database.insertInto("coding_assignments").values(values).execute();
}

export async function deleteAssignment(database: DatabaseExecutor, id: string) {
  await database
    .deleteFrom("coding_assignments")
    .where("id", "=", id)
    .execute();
}

export async function countSubmissions(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  const row = await database
    .selectFrom("coding_submissions")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("assignment_id", "=", assignmentId)
    .executeTakeFirst();
  return row?.count ?? 0;
}

/* ------------------------------------------------------------------ learner */

export function findLearnerState(
  database: DatabaseExecutor,
  userId: string,
  assignmentId: string,
) {
  return database
    .selectFrom("coding_learner_states")
    .selectAll()
    .where("user_id", "=", userId)
    .where("assignment_id", "=", assignmentId)
    .executeTakeFirst();
}

/**
 * The learner's newest code for the lesson: their draft or their latest
 * submission that kept its code, whichever is newer. One read.
 */
export async function findLatestCode(
  database: DatabaseExecutor,
  userId: string,
  assignmentId: string,
) {
  const [draft, submission] = await Promise.all([
    database
      .selectFrom("coding_drafts")
      .select(["exercise_version_id", "files", "updated_at"])
      .where("user_id", "=", userId)
      .where("assignment_id", "=", assignmentId)
      .executeTakeFirst(),
    database
      .selectFrom("coding_submissions")
      .select(["exercise_version_id", "files", "created_at as updated_at"])
      .where("user_id", "=", userId)
      .where("assignment_id", "=", assignmentId)
      .where("files", "is not", null)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst(),
  ]);
  if (!draft) return submission ?? null;
  if (!submission) return draft;
  return submission.updated_at > draft.updated_at ? submission : draft;
}

export async function upsertDraft(
  database: DatabaseExecutor,
  input: {
    userId: string;
    assignmentId: string;
    versionId: string;
    files: unknown;
    now: Date;
  },
) {
  await database
    .insertInto("coding_drafts")
    .values({
      user_id: input.userId,
      assignment_id: input.assignmentId,
      exercise_version_id: input.versionId,
      files: toJson(input.files),
      updated_at: input.now,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "assignment_id"]).doUpdateSet({
        exercise_version_id: input.versionId,
        files: toJson(input.files),
        updated_at: input.now,
      }),
    )
    .execute();
}

export async function insertSubmission(
  database: DatabaseExecutor,
  values: {
    id: string;
    userId: string;
    assignmentId: string;
    versionId: string;
    suiteHash: string;
    passed: boolean;
    passedCount: number;
    totalCount: number;
    failedTestIds: string[];
    files: unknown;
    results: unknown;
    durationMs: number | null;
    now: Date;
  },
) {
  await database
    .insertInto("coding_submissions")
    .values({
      id: values.id,
      user_id: values.userId,
      assignment_id: values.assignmentId,
      exercise_version_id: values.versionId,
      suite_hash: values.suiteHash,
      passed: values.passed,
      passed_count: values.passedCount,
      total_count: values.totalCount,
      failed_test_ids: values.failedTestIds,
      files: toJson(values.files),
      results: toJson(values.results),
      duration_ms: values.durationMs,
      created_at: values.now,
    })
    .execute();
}

/** Counts the attempt; the first pass is kept, never moved. */
export function recordAttempt(
  database: DatabaseExecutor,
  input: {
    userId: string;
    assignmentId: string;
    versionId: string;
    passed: boolean;
    now: Date;
  },
) {
  const failed = input.passed ? 0 : 1;
  const passedAt = input.passed ? input.now : null;
  const passedVersion = input.passed ? input.versionId : null;
  return database
    .insertInto("coding_learner_states")
    .values({
      user_id: input.userId,
      assignment_id: input.assignmentId,
      attempts_count: 1,
      failed_attempts_count: failed,
      first_opened_at: input.now,
      first_passed_at: passedAt,
      passed_version_id: passedVersion,
      last_submitted_at: input.now,
      updated_at: input.now,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "assignment_id"]).doUpdateSet({
        attempts_count: sql`coding_learner_states.attempts_count + 1`,
        failed_attempts_count: sql`coding_learner_states.failed_attempts_count + ${failed}`,
        first_passed_at: sql`coalesce(coding_learner_states.first_passed_at, ${passedAt}::timestamptz)`,
        passed_version_id: sql`coalesce(coding_learner_states.passed_version_id, ${passedVersion}::uuid)`,
        last_submitted_at: input.now,
        updated_at: input.now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Failed attempts keep their code only for the newest `keep`; older ones
 * keep their counts and failed test ids, which analytics read.
 */
export async function pruneFailedSubmissions(
  database: DatabaseExecutor,
  input: { userId: string; assignmentId: string; keep: number },
) {
  await sql`
    update coding_submissions
    set files = null, results = null
    where user_id = ${input.userId}::uuid
      and assignment_id = ${input.assignmentId}::uuid
      and passed = false
      and files is not null
      and id not in (
        select id from coding_submissions
        where user_id = ${input.userId}::uuid
          and assignment_id = ${input.assignmentId}::uuid
          and passed = false
        order by created_at desc
        limit ${input.keep}
      )
  `.execute(database);
}

export function recordSolutionView(
  database: DatabaseExecutor,
  input: { userId: string; assignmentId: string; now: Date },
) {
  return database
    .insertInto("coding_learner_states")
    .values({
      user_id: input.userId,
      assignment_id: input.assignmentId,
      first_opened_at: input.now,
      solution_viewed_at: input.now,
      solution_viewed_before_pass: true,
      updated_at: input.now,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "assignment_id"]).doUpdateSet({
        solution_viewed_at: sql`coalesce(coding_learner_states.solution_viewed_at, ${input.now}::timestamptz)`,
        solution_viewed_before_pass: sql`coding_learner_states.solution_viewed_before_pass or (coding_learner_states.solution_viewed_at is null and coding_learner_states.first_passed_at is null)`,
        updated_at: input.now,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function listSubmissions(
  database: DatabaseExecutor,
  input: { userId: string; assignmentId: string; limit: number },
) {
  return database
    .selectFrom("coding_submissions as s")
    .innerJoin("coding_exercise_versions as v", "v.id", "s.exercise_version_id")
    .select([
      "s.id",
      "s.passed",
      "s.passed_count",
      "s.total_count",
      "s.failed_test_ids",
      "s.files",
      "s.results",
      "s.created_at",
      "v.version_number",
    ])
    .where("s.user_id", "=", input.userId)
    .where("s.assignment_id", "=", input.assignmentId)
    .orderBy("s.created_at", "desc")
    .limit(input.limit)
    .execute();
}

/* ---------------------------------------------------------------- analytics */

export function listLearnerStates(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  return database
    .selectFrom("coding_learner_states")
    .selectAll()
    .where("assignment_id", "=", assignmentId)
    .orderBy("updated_at", "desc")
    .limit(5_000)
    .execute();
}

export async function countDraftOnlyLearners(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  const row = await database
    .selectFrom("coding_drafts as d")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("d.assignment_id", "=", assignmentId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("coding_learner_states as s")
            .select("s.user_id")
            .whereRef("s.user_id", "=", "d.user_id")
            .whereRef("s.assignment_id", "=", "d.assignment_id"),
        ),
      ),
    )
    .executeTakeFirst();
  return row?.count ?? 0;
}

/** Per learner: attempts up to and including their first pass. */
export async function listAttemptsToPass(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  const result = await sql<{ attempts: number }>`
    select count(*)::int as attempts
    from coding_submissions sub
    join coding_learner_states st
      on st.user_id = sub.user_id and st.assignment_id = sub.assignment_id
    where sub.assignment_id = ${assignmentId}::uuid
      and st.first_passed_at is not null
      and sub.created_at <= st.first_passed_at
    group by sub.user_id
  `.execute(database);
  return result.rows.map((row) => row.attempts);
}

/** How many learners' latest attempt failed each test. */
export async function countLatestFailuresByTest(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  const result = await sql<{ test_id: string; failed_by: number }>`
    select test_id, count(*)::int as failed_by
    from (
      select distinct on (user_id) failed_test_ids
      from coding_submissions
      where assignment_id = ${assignmentId}::uuid
      order by user_id, created_at desc
    ) latest, unnest(latest.failed_test_ids) as test_id
    group by test_id
  `.execute(database);
  return new Map(result.rows.map((row) => [row.test_id, row.failed_by]));
}
