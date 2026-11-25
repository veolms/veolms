import { sql, type Insertable, type Kysely, type Updateable } from "kysely";
import type {
  Database,
  DatabaseExecutor,
  QuestionGenerationItemTable,
  QuestionGenerationJobTable,
} from "@veolms/database";

export type JobRow = Awaited<ReturnType<typeof findJob>> & {};
export type ItemRow = Awaited<ReturnType<typeof listItems>>[number];

export async function insertJob(
  database: DatabaseExecutor,
  values: Insertable<QuestionGenerationJobTable>,
) {
  return await database
    .insertInto("question_generation_jobs")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertItems(
  database: DatabaseExecutor,
  rows: Insertable<QuestionGenerationItemTable>[],
) {
  if (!rows.length) return;
  await database.insertInto("question_generation_items").values(rows).execute();
}

export function findJob(database: DatabaseExecutor, id: string) {
  return database
    .selectFrom("question_generation_jobs")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export function findActiveJob(database: DatabaseExecutor, courseId: string) {
  return database
    .selectFrom("question_generation_jobs")
    .selectAll()
    .where("course_id", "=", courseId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
}

export function findLatestJob(database: DatabaseExecutor, courseId: string) {
  return database
    .selectFrom("question_generation_jobs")
    .selectAll()
    .where("course_id", "=", courseId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
}

/** A run's lectures in course order, with their titles. */
export function listItems(database: DatabaseExecutor, jobId: string) {
  return database
    .selectFrom("question_generation_items as i")
    .innerJoin("course_lessons as l", "l.id", "i.lesson_id")
    .leftJoin("course_sections as s", "s.id", "l.section_id")
    .select([
      "i.id",
      "i.lesson_id",
      "i.position",
      "i.status",
      "i.quiz_id",
      "i.coding_exercise_id",
      "i.message",
      "i.attempts",
      "l.title as lesson_title",
      "s.title as section_title",
    ])
    .where("i.job_id", "=", jobId)
    .orderBy("i.position")
    .execute();
}

/** Title, status and how many questions the newest version has. */
export async function describeQuizzes(
  database: DatabaseExecutor,
  quizIds: string[],
) {
  if (!quizIds.length) return [];
  return await database
    .selectFrom("quizzes as q")
    .select([
      "q.id",
      "q.title",
      "q.status",
      (eb) =>
        eb
          .selectFrom("quiz_questions as qq")
          .innerJoin("quiz_versions as v", "v.id", "qq.quiz_version_id")
          .select(sql<number>`count(*)::int`.as("n"))
          .whereRef("v.quiz_id", "=", "q.id")
          .where("qq.deleted_at", "is", null)
          .where(
            "v.version_number",
            "=",
            eb
              .selectFrom("quiz_versions as latest")
              .select(sql<number>`max(latest.version_number)`.as("m"))
              .whereRef("latest.quiz_id", "=", "q.id"),
          )
          .as("question_count"),
    ])
    .where("q.id", "in", quizIds)
    .where("q.deleted_at", "is", null)
    .execute();
}

export async function describeExercises(
  database: DatabaseExecutor,
  exerciseIds: string[],
) {
  if (!exerciseIds.length) return [];
  return await database
    .selectFrom("coding_exercises as e")
    .leftJoin("coding_assignments as a", "a.exercise_id", "e.id")
    .select(["e.id", "e.title", "e.status", "a.id as assignment_id"])
    .where("e.id", "in", exerciseIds)
    .where("e.deleted_at", "is", null)
    .execute();
}

/** What a run's AI calls cost so far: its calls carry its id. */
export async function spentFor(database: DatabaseExecutor, jobId: string) {
  const row = await database
    .selectFrom("ai_usage")
    .select(sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"))
    .where("subject_id", "=", jobId)
    .executeTakeFirst();
  return Number(row?.cost ?? 0);
}

/** The section a lecture is in (its plan may differ). */
export async function lessonSection(
  database: DatabaseExecutor,
  lessonId: string,
) {
  const row = await database
    .selectFrom("course_lessons")
    .select("section_id")
    .where("id", "=", lessonId)
    .executeTakeFirst();
  return row?.section_id ?? null;
}

/** Lessons that already have a quiz, or a coding question. */
export async function lessonsWithQuestions(
  database: DatabaseExecutor,
  courseId: string,
) {
  const [quizzes, coding] = await Promise.all([
    database
      .selectFrom("quiz_assignments")
      .select("lesson_id")
      .where("course_id", "=", courseId)
      .execute(),
    database
      .selectFrom("coding_assignments as a")
      .innerJoin("coding_exercises as e", "e.id", "a.exercise_id")
      .select("a.lesson_id")
      .where("a.course_id", "=", courseId)
      .where("a.lesson_id", "is not", null)
      .where("e.deleted_at", "is", null)
      .execute(),
  ]);
  return {
    quiz: new Set(quizzes.map((row) => row.lesson_id)),
    coding: new Set(
      coding.map((row) => row.lesson_id).filter((id): id is string => !!id),
    ),
  };
}

/**
 * Takes the oldest run nobody is working on (queued, or running with its
 * lease run out after a restart) and holds it until `until`. One server at
 * a time: the row is locked and skipped by the others.
 */
export async function claimJob(database: Kysely<Database>, until: Date) {
  const result = await sql<{ id: string }>`
    update question_generation_jobs
    set status = 'running',
        lease_until = ${until},
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where id = (
      select id from question_generation_jobs
      where status in ('queued', 'running')
        and (lease_until is null or lease_until < now())
      order by created_at
      limit 1
      for update skip locked
    )
    returning id
  `.execute(database);
  return result.rows[0]?.id ?? null;
}

export async function updateJob(
  database: DatabaseExecutor,
  id: string,
  values: Updateable<QuestionGenerationJobTable>,
) {
  await database
    .updateTable("question_generation_jobs")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", id)
    .execute();
}

/** Adds to a run's counters. */
export async function countOn(
  database: DatabaseExecutor,
  id: string,
  add: {
    done?: number;
    quizzes?: number;
    coding?: number;
    skipped?: number;
    failed?: number;
  },
) {
  await database
    .updateTable("question_generation_jobs")
    .set({
      done_items: sql`done_items + ${add.done ?? 0}`,
      quizzes_created: sql`quizzes_created + ${add.quizzes ?? 0}`,
      coding_created: sql`coding_created + ${add.coding ?? 0}`,
      skipped_items: sql`skipped_items + ${add.skipped ?? 0}`,
      failed_items: sql`failed_items + ${add.failed ?? 0}`,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
}

/** The next lecture to work on: pending, or one left half-done by a restart. */
export function nextItem(database: DatabaseExecutor, jobId: string) {
  return database
    .selectFrom("question_generation_items")
    .selectAll()
    .where("job_id", "=", jobId)
    .where("status", "in", ["pending", "running"])
    .orderBy("position")
    .limit(1)
    .executeTakeFirst();
}

export async function updateItem(
  database: DatabaseExecutor,
  id: string,
  values: Updateable<QuestionGenerationItemTable>,
) {
  await database
    .updateTable("question_generation_items")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", id)
    .execute();
}
