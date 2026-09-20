import type { Database, DatabaseExecutor } from "@veolms/database";
import { sql, type Insertable, type Updateable } from "kysely";

export async function findQuiz(database: DatabaseExecutor, quizId: string) {
  return await database
    .selectFrom("quizzes")
    .selectAll()
    .where("id", "=", quizId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function listQuizzesByCreator(
  database: DatabaseExecutor,
  creatorId: string,
) {
  return await database
    .selectFrom("quizzes")
    .selectAll()
    .where("creator_id", "=", creatorId)
    .where("deleted_at", "is", null)
    .orderBy("updated_at", "desc")
    .execute();
}

export async function listQuizzesByAcademy(
  database: DatabaseExecutor,
  academyId: string,
) {
  return await database
    .selectFrom("quizzes")
    .selectAll()
    .where("academy_id", "=", academyId)
    .where("deleted_at", "is", null)
    .orderBy("updated_at", "desc")
    .execute();
}

export async function findVersion(
  database: DatabaseExecutor,
  versionId: string,
) {
  return await database
    .selectFrom("quiz_versions")
    .selectAll()
    .where("id", "=", versionId)
    .executeTakeFirst();
}

export async function listVersions(database: DatabaseExecutor, quizId: string) {
  return await database
    .selectFrom("quiz_versions")
    .selectAll()
    .where("quiz_id", "=", quizId)
    .orderBy("version_number", "asc")
    .execute();
}

export async function findLatestVersion(
  database: DatabaseExecutor,
  quizId: string,
  published: boolean,
) {
  let query = database
    .selectFrom("quiz_versions")
    .selectAll()
    .where("quiz_id", "=", quizId);
  query = published
    ? query.where("published_at", "is not", null)
    : query.where("published_at", "is", null);
  return await query.orderBy("version_number", "desc").executeTakeFirst();
}

export async function insertVersion(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_versions"]>,
) {
  return await database
    .insertInto("quiz_versions")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertQuiz(
  database: DatabaseExecutor,
  values: Insertable<Database["quizzes"]>,
) {
  return await database
    .insertInto("quizzes")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateQuiz(
  database: DatabaseExecutor,
  quizId: string,
  values: Updateable<Database["quizzes"]>,
) {
  return await database
    .updateTable("quizzes")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", quizId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function softDeleteQuiz(
  database: DatabaseExecutor,
  quizId: string,
) {
  return await database
    .updateTable("quizzes")
    .set({
      status: "archived",
      deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", quizId)
    .execute();
}

export async function updateVersion(
  database: DatabaseExecutor,
  versionId: string,
  values: Updateable<Database["quiz_versions"]>,
) {
  return await database
    .updateTable("quiz_versions")
    .set(values)
    .where("id", "=", versionId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listQuestions(
  database: DatabaseExecutor,
  versionId: string,
) {
  return await database
    .selectFrom("quiz_questions")
    .selectAll()
    .where("quiz_version_id", "=", versionId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

export async function listQuestionsByIds(
  database: DatabaseExecutor,
  versionId: string,
  ids: readonly string[],
) {
  if (ids.length === 0) return [];
  return await database
    .selectFrom("quiz_questions")
    .selectAll()
    .where("quiz_version_id", "=", versionId)
    .where("id", "in", ids)
    .where("deleted_at", "is", null)
    .execute();
}

export async function listOptions(
  database: DatabaseExecutor,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return [];
  return await database
    .selectFrom("quiz_question_options")
    .selectAll()
    .where("question_id", "in", questionIds)
    .orderBy("position", "asc")
    .execute();
}

export async function insertQuestion(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_questions"]>,
) {
  return await database
    .insertInto("quiz_questions")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertQuestions(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_questions"]>[],
) {
  if (values.length === 0) return [];
  return await database
    .insertInto("quiz_questions")
    .values(values)
    .returningAll()
    .execute();
}

export async function updateQuestion(
  database: DatabaseExecutor,
  questionId: string,
  values: Updateable<Database["quiz_questions"]>,
) {
  return await database
    .updateTable("quiz_questions")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", questionId)
    .where("deleted_at", "is", null)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function softDeleteQuestion(
  database: DatabaseExecutor,
  questionId: string,
) {
  await database
    .updateTable("quiz_questions")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("id", "=", questionId)
    .execute();
}

export async function insertOptions(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_question_options"]>[],
) {
  if (values.length === 0) return [];
  return await database
    .insertInto("quiz_question_options")
    .values(values)
    .returningAll()
    .execute();
}

export async function deleteOptions(
  database: DatabaseExecutor,
  questionId: string,
) {
  await database
    .deleteFrom("quiz_question_options")
    .where("question_id", "=", questionId)
    .execute();
}

export async function findAssignment(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  return await database
    .selectFrom("quiz_assignments")
    .selectAll()
    .where("id", "=", assignmentId)
    .executeTakeFirst();
}

export async function findAssignmentForLesson(
  database: DatabaseExecutor,
  lessonId: string,
) {
  return await database
    .selectFrom("quiz_assignments")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .executeTakeFirst();
}

export async function listAssignmentsForCourse(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("quiz_assignments")
    .selectAll()
    .where("course_id", "=", courseId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function listAssignmentsForCourses(
  database: DatabaseExecutor,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("quiz_assignments")
    .selectAll()
    .where("course_id", "in", courseIds)
    .orderBy("created_at", "asc")
    .execute();
}

export async function isPublishedFreeCourse(
  database: DatabaseExecutor,
  courseId: string,
) {
  const row = await database
    .selectFrom("courses")
    .innerJoin("course_pricing", "course_pricing.course_id", "courses.id")
    .select(["courses.status", "course_pricing.pricing_type"])
    .where("courses.id", "=", courseId)
    .where("courses.deleted_at", "is", null)
    .executeTakeFirst();
  return row?.status === "published" && row.pricing_type === "free";
}

export async function listPublishedFreeCourseIds(database: DatabaseExecutor) {
  const rows = await database
    .selectFrom("courses")
    .innerJoin("course_pricing", "course_pricing.course_id", "courses.id")
    .select("courses.id")
    .where("courses.status", "=", "published")
    .where("courses.deleted_at", "is", null)
    .where("course_pricing.pricing_type", "=", "free")
    .execute();
  return rows.map((row) => row.id);
}

export async function listAssignmentsForQuizzes(
  database: DatabaseExecutor,
  quizIds: readonly string[],
) {
  if (quizIds.length === 0) return [];
  return await database
    .selectFrom("quiz_assignments")
    .selectAll()
    .where("quiz_id", "in", quizIds)
    .orderBy("created_at", "asc")
    .execute();
}

export async function insertAssignment(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_assignments"]>,
) {
  return await database
    .insertInto("quiz_assignments")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAssignment(
  database: DatabaseExecutor,
  assignmentId: string,
  values: Updateable<Database["quiz_assignments"]>,
) {
  return await database
    .updateTable("quiz_assignments")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", assignmentId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteAssignment(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  return await database
    .deleteFrom("quiz_assignments")
    .where("id", "=", assignmentId)
    .executeTakeFirst();
}

export async function deleteAssignmentsByQuizId(
  database: DatabaseExecutor,
  quizId: string,
) {
  return await database
    .deleteFrom("quiz_assignments")
    .where("quiz_id", "=", quizId)
    .execute();
}

export async function listAttemptsForUser(
  database: DatabaseExecutor,
  userId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function findAttempt(
  database: DatabaseExecutor,
  attemptId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .selectAll()
    .where("id", "=", attemptId)
    .executeTakeFirst();
}

export async function findAttemptForUpdate(
  database: DatabaseExecutor,
  attemptId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .selectAll()
    .where("id", "=", attemptId)
    .forUpdate()
    .executeTakeFirst();
}

export async function findActiveAttempt(
  database: DatabaseExecutor,
  assignmentId: string,
  userId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .selectAll()
    .where("assignment_id", "=", assignmentId)
    .where("user_id", "=", userId)
    .where("status", "=", "in_progress")
    .executeTakeFirst();
}

export async function maxAttemptNumber(
  database: DatabaseExecutor,
  assignmentId: string,
  userId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .select(({ fn }) => fn.max("attempt_number").as("max"))
    .where("assignment_id", "=", assignmentId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export async function insertAttempt(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_attempts"]>,
) {
  return await database
    .insertInto("quiz_attempts")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAttempt(
  database: DatabaseExecutor,
  attemptId: string,
  values: Updateable<Database["quiz_attempts"]>,
) {
  return await database
    .updateTable("quiz_attempts")
    .set({ ...values, updated_at: new Date() })
    .where("id", "=", attemptId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listAnswers(
  database: DatabaseExecutor,
  attemptId: string,
) {
  return await database
    .selectFrom("quiz_attempt_answers")
    .selectAll()
    .where("attempt_id", "=", attemptId)
    .execute();
}

export async function upsertAnswers(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_attempt_answers"]>[],
) {
  if (values.length === 0) return [];
  return await database
    .insertInto("quiz_attempt_answers")
    .values(values)
    .onConflict((oc) =>
      oc.columns(["attempt_id", "question_id"]).doUpdateSet({
        response_value: sql`excluded.response_value`,
        time_spent_seconds: sql`excluded.time_spent_seconds`,
        is_correct: sql`excluded.is_correct`,
        points_awarded: sql`excluded.points_awarded`,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .execute();
}

export async function listAnalyticsAttempts(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  return await database
    .selectFrom("quiz_attempts")
    .select([
      "user_id as studentId",
      "status",
      "score_percentage as scorePercentage",
      "created_at as createdAt",
      "submitted_at as submittedAt",
    ])
    .where("assignment_id", "=", assignmentId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function expireAbandonedAttempts(
  database: DatabaseExecutor,
  now: Date = new Date(),
) {
  return await database
    .updateTable("quiz_attempts")
    .set({
      status: "expired",
      updated_at: now,
    })
    .where("status", "=", "in_progress")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("expires_at", "is not", null),
          eb("expires_at", "<=", now),
        ]),
        eb(
          "assignment_id",
          "in",
          eb
            .selectFrom("quiz_assignments")
            .select("id")
            .where("available_until", "is not", null)
            .where("available_until", "<=", now),
        ),
      ]),
    )
    .returning(["id", "user_id", "assignment_id", "attempt_number"])
    .execute();
}
