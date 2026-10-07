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

/** Batch lookup so list endpoints avoid one query per assignment. */
export async function listQuizzesByIds(
  database: DatabaseExecutor,
  quizIds: readonly string[],
) {
  if (quizIds.length === 0) return [];
  return await database
    .selectFrom("quizzes")
    .selectAll()
    .where("id", "in", quizIds)
    .where("deleted_at", "is", null)
    .execute();
}

export async function listLessonsByIds(
  database: DatabaseExecutor,
  lessonIds: readonly string[],
) {
  if (lessonIds.length === 0) return [];
  return await database
    .selectFrom("course_lessons")
    .select(["id", "course_id", "title", "is_published"])
    .where("id", "in", lessonIds)
    .where("deleted_at", "is", null)
    .execute();
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

/**
 * Attempts on these assignments made by learners — everyone except the
 * acting author and the owner of the course the quiz sits in, whose own
 * trial runs should not stand in the way of removing a quiz.
 */
export async function countLearnerAttempts(
  database: DatabaseExecutor,
  input: { assignmentIds: readonly string[]; actorId: string },
): Promise<number> {
  if (input.assignmentIds.length === 0) return 0;
  const row = await database
    .selectFrom("quiz_attempts")
    .innerJoin(
      "quiz_assignments",
      "quiz_assignments.id",
      "quiz_attempts.assignment_id",
    )
    .innerJoin("courses", "courses.id", "quiz_assignments.course_id")
    .select(({ fn }) => fn.countAll<string>().as("count"))
    .where("quiz_attempts.assignment_id", "in", [...input.assignmentIds])
    .where("quiz_attempts.user_id", "<>", input.actorId)
    .whereRef("quiz_attempts.user_id", "<>", "courses.creator_id")
    .executeTakeFirst();
  return Number(row?.count ?? 0);
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

/** Of these lessons, the ones whose quiz the learner has a passed attempt on. */
export async function listPassedLessonIds(
  database: DatabaseExecutor,
  userId: string,
  lessonIds: readonly string[],
): Promise<string[]> {
  if (lessonIds.length === 0) return [];
  const rows = await database
    .selectFrom("quiz_attempts")
    .innerJoin(
      "quiz_assignments",
      "quiz_assignments.id",
      "quiz_attempts.assignment_id",
    )
    .select("quiz_assignments.lesson_id as lessonId")
    .distinct()
    .where("quiz_attempts.user_id", "=", userId)
    .where("quiz_attempts.status", "=", "graded")
    .where("quiz_attempts.is_passed", "=", true)
    .where("quiz_assignments.lesson_id", "in", [...lessonIds])
    .execute();
  return rows.map((row) => row.lessonId);
}

/**
 * In-progress attempts whose time limit, or whose assignment's due date,
 * passed before `cutoff`. Oldest first so a backlog drains in order.
 */
export async function listOverdueAttempts(
  database: DatabaseExecutor,
  cutoff: Date,
  limit: number,
) {
  return await database
    .selectFrom("quiz_attempts")
    .select(["id", "user_id", "assignment_id", "attempt_number"])
    .where("status", "=", "in_progress")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("expires_at", "is not", null),
          eb("expires_at", "<=", cutoff),
        ]),
        eb(
          "assignment_id",
          "in",
          eb
            .selectFrom("quiz_assignments")
            .select("id")
            .where("available_until", "is not", null)
            .where("available_until", "<=", cutoff),
        ),
      ]),
    )
    .orderBy("started_at", "asc")
    .limit(limit)
    .execute();
}
