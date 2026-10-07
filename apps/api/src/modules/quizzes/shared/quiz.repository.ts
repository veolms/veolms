import type { Database, DatabaseExecutor } from "@veolms/database";
import { sql, type Insertable, type Updateable } from "kysely";

const QUIZ_COLUMNS = [
  "id",
  "academy_id",
  "creator_id",
  "title",
  "description",
] as const;

/** Every column of an assignment that a presenter or a rule reads. */
const ASSIGNMENT_COLUMNS = [
  "id",
  "quiz_id",
  "quiz_version_id",
  "course_id",
  "lesson_id",
  "required",
  "pass_percentage",
  "max_attempts",
  "time_limit_seconds",
  "shuffle_questions",
  "shuffle_options",
  "feedback_mode",
  "available_from",
  "available_until",
] as const;

export async function findQuiz(database: DatabaseExecutor, quizId: string) {
  return await database
    .selectFrom("quizzes")
    .select(QUIZ_COLUMNS)
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
    .select(["id", "title", "creator_id"])
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

/** Titles of the published courses among these, in one query. */
export async function listPublishedCourseTitles(
  database: DatabaseExecutor,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("courses")
    .select(["id", "title"])
    .where("id", "in", courseIds)
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .execute();
}

/** Which quizzes an author sees: their own, or the whole academy's. */
export type QuizOwnerScope = { creatorId: string } | { academyId: string };

/** Ids and titles only, for reports that just need to name each quiz. */
export async function listQuizTitles(
  database: DatabaseExecutor,
  scope: QuizOwnerScope,
) {
  let query = database
    .selectFrom("quizzes")
    .select(["id", "title"])
    .where("deleted_at", "is", null);
  query =
    "creatorId" in scope
      ? query.where("creator_id", "=", scope.creatorId)
      : query.where("academy_id", "=", scope.academyId);
  return await query.orderBy("updated_at", "desc").execute();
}

/**
 * The quiz library: one row per quiz with the question count of its newest
 * version and how many versions are published. Counted in the database so
 * the list never loads question or option rows.
 */
export async function listQuizSummaries(
  database: DatabaseExecutor,
  scope: QuizOwnerScope,
) {
  let query = database
    .selectFrom("quizzes as q")
    .select((eb) => [
      "q.id",
      "q.title",
      "q.status",
      "q.updated_at",
      eb
        .selectFrom("quiz_versions as v")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .whereRef("v.quiz_id", "=", "q.id")
        .where("v.published_at", "is not", null)
        .as("published_version_count"),
      eb
        .selectFrom("quiz_questions as qq")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .where("qq.deleted_at", "is", null)
        .where((inner) =>
          inner(
            "qq.quiz_version_id",
            "=",
            inner
              .selectFrom("quiz_versions as latest")
              .select("latest.id")
              .whereRef("latest.quiz_id", "=", "q.id")
              .orderBy("latest.version_number", "desc")
              .limit(1),
          ),
        )
        .as("question_count"),
    ])
    .where("q.deleted_at", "is", null);
  query =
    "creatorId" in scope
      ? query.where("q.creator_id", "=", scope.creatorId)
      : query.where("q.academy_id", "=", scope.academyId);
  return await query.orderBy("q.updated_at", "desc").execute();
}

export async function findVersion(
  database: DatabaseExecutor,
  versionId: string,
) {
  return await database
    .selectFrom("quiz_versions")
    .select(["id", "quiz_id", "published_at"])
    .where("id", "=", versionId)
    .executeTakeFirst();
}

export async function listVersions(database: DatabaseExecutor, quizId: string) {
  return await database
    .selectFrom("quiz_versions")
    .select(["id", "version_number", "instructions", "published_at"])
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
    .select("id")
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
    .returning("id")
    .executeTakeFirstOrThrow();
}

export async function insertQuiz(
  database: DatabaseExecutor,
  values: Insertable<Database["quizzes"]>,
) {
  await database.insertInto("quizzes").values(values).execute();
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
    .returning("id")
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
    .returning("id")
    .executeTakeFirstOrThrow();
}

/** A version's questions as the author works on them, answer key included. */
export async function listQuestions(
  database: DatabaseExecutor,
  versionId: string,
) {
  return await database
    .selectFrom("quiz_questions")
    .select([
      "id",
      "question_type",
      "prompt",
      "points",
      "position",
      "configuration",
      "explanation",
    ])
    .where("quiz_version_id", "=", versionId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

export async function countQuestions(
  database: DatabaseExecutor,
  versionId: string,
): Promise<number> {
  const row = await database
    .selectFrom("quiz_questions")
    .select(({ fn }) => fn.countAll<string>().as("count"))
    .where("quiz_version_id", "=", versionId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function listQuestionsByIds(
  database: DatabaseExecutor,
  versionId: string,
  ids: readonly string[],
) {
  if (ids.length === 0) return [];
  return await database
    .selectFrom("quiz_questions")
    .select([
      "id",
      "question_type",
      "prompt",
      "points",
      "position",
      "explanation",
    ])
    .where("quiz_version_id", "=", versionId)
    .where("id", "in", ids)
    .where("deleted_at", "is", null)
    .execute();
}

/**
 * Questions as a learner sees them during an attempt, in authored order.
 * No explanation and no configuration: neither belongs on an open attempt.
 */
export async function listAttemptQuestions(
  database: DatabaseExecutor,
  versionId: string,
) {
  return await database
    .selectFrom("quiz_questions")
    .select(["id", "question_type", "prompt", "points"])
    .where("quiz_version_id", "=", versionId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

/** Just enough of the answered questions to check an answer's shape. */
export async function listQuestionTypesByIds(
  database: DatabaseExecutor,
  versionId: string,
  ids: readonly string[],
) {
  if (ids.length === 0) return [];
  return await database
    .selectFrom("quiz_questions")
    .select(["id", "question_type"])
    .where("quiz_version_id", "=", versionId)
    .where("id", "in", ids)
    .where("deleted_at", "is", null)
    .execute();
}

/**
 * Questions for grading an attempt and showing its result. The prompt is
 * read only when the result lists answers, the explanation only when the
 * answers are revealed.
 */
export async function listGradingQuestions(
  database: DatabaseExecutor,
  versionId: string,
  include: { prompt: boolean; explanation: boolean },
) {
  return await database
    .selectFrom("quiz_questions")
    .select(["id", "question_type", "points"])
    .$if(include.prompt, (qb) => qb.select("prompt"))
    .$if(include.explanation, (qb) => qb.select("explanation"))
    .where("quiz_version_id", "=", versionId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

/** Options as the author works on them, answer key included. */
export async function listOptions(
  database: DatabaseExecutor,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return [];
  return await database
    .selectFrom("quiz_question_options")
    .select([
      "id",
      "question_id",
      "option_text",
      "is_correct",
      "weight",
      "position",
    ])
    .where("question_id", "in", questionIds)
    .orderBy("position", "asc")
    .execute();
}

/** Options as a learner sees them during an attempt: never the answer key. */
export async function listAttemptOptions(
  database: DatabaseExecutor,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return [];
  return await database
    .selectFrom("quiz_question_options")
    .select(["id", "question_id", "option_text"])
    .where("question_id", "in", questionIds)
    .orderBy("position", "asc")
    .execute();
}

/** Which option belongs to which question, to validate a saved answer. */
export async function listOptionRefs(
  database: DatabaseExecutor,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return [];
  return await database
    .selectFrom("quiz_question_options")
    .select(["id", "question_id"])
    .where("question_id", "in", questionIds)
    .execute();
}

/** Options with the answer key, for grading and for a closed attempt's result. */
export async function listKeyOptions(
  database: DatabaseExecutor,
  questionIds: readonly string[],
) {
  if (questionIds.length === 0) return [];
  return await database
    .selectFrom("quiz_question_options")
    .select(["id", "question_id", "option_text", "is_correct"])
    .where("question_id", "in", questionIds)
    .orderBy("position", "asc")
    .execute();
}

export async function insertQuestion(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_questions"]>,
) {
  await database.insertInto("quiz_questions").values(values).execute();
}

export async function insertQuestions(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_questions"]>[],
) {
  if (values.length === 0) return;
  await database.insertInto("quiz_questions").values(values).execute();
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
    .returning("id")
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
  if (values.length === 0) return;
  await database.insertInto("quiz_question_options").values(values).execute();
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
    .select(ASSIGNMENT_COLUMNS)
    .where("id", "=", assignmentId)
    .executeTakeFirst();
}

export async function lessonHasAssignment(
  database: DatabaseExecutor,
  lessonId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("quiz_assignments")
    .select("id")
    .where("lesson_id", "=", lessonId)
    .executeTakeFirst();
  return Boolean(row);
}

export async function listAssignmentsForCourse(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("quiz_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .where("course_id", "=", courseId)
    .orderBy("created_at", "asc")
    .execute();
}

/** What the learner's quiz list shows of each assignment. */
export async function listAssignmentsForCourses(
  database: DatabaseExecutor,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("quiz_assignments")
    .select([
      "id",
      "quiz_id",
      "course_id",
      "lesson_id",
      "max_attempts",
      "available_from",
      "available_until",
    ])
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
    .select(ASSIGNMENT_COLUMNS)
    .where("quiz_id", "in", quizIds)
    .orderBy("created_at", "asc")
    .execute();
}

/** Where each of these quizzes is attached, without the delivery rules. */
export async function listAssignmentRefsForQuizzes(
  database: DatabaseExecutor,
  quizIds: readonly string[],
) {
  if (quizIds.length === 0) return [];
  return await database
    .selectFrom("quiz_assignments")
    .select(["id", "quiz_id", "lesson_id"])
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
    .returning(ASSIGNMENT_COLUMNS)
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
    .returning(ASSIGNMENT_COLUMNS)
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

/** The learner's most recent attempts, newest first, for their history. */
export async function listAttemptHistory(
  database: DatabaseExecutor,
  userId: string,
  limit: number,
) {
  return await database
    .selectFrom("quiz_attempts")
    .select([
      "id",
      "attempt_number",
      "status",
      "score_percentage",
      "is_passed",
      "submitted_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
}

/** One user's attempts on these assignments, newest first. */
export async function listAttemptsForAssignments(
  database: DatabaseExecutor,
  userId: string,
  assignmentIds: readonly string[],
) {
  if (assignmentIds.length === 0) return [];
  return await database
    .selectFrom("quiz_attempts")
    .select(["id", "assignment_id", "status", "score_percentage", "is_passed"])
    .where("user_id", "=", userId)
    .where("assignment_id", "in", [...assignmentIds])
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

/** Saved answers with their grading, for grading and for a result. */
export async function listAnswers(
  database: DatabaseExecutor,
  attemptId: string,
) {
  return await database
    .selectFrom("quiz_attempt_answers")
    .select([
      "id",
      "question_id",
      "response_value",
      "is_correct",
      "points_awarded",
      "time_spent_seconds",
      "created_at",
    ])
    .where("attempt_id", "=", attemptId)
    .execute();
}

/** What the learner has answered so far, to resume an open attempt. */
export async function listAnswerResponses(
  database: DatabaseExecutor,
  attemptId: string,
) {
  return await database
    .selectFrom("quiz_attempt_answers")
    .select(["question_id", "response_value"])
    .where("attempt_id", "=", attemptId)
    .execute();
}

export async function upsertAnswers(
  database: DatabaseExecutor,
  values: Insertable<Database["quiz_attempt_answers"]>[],
) {
  if (values.length === 0) return;
  await database
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
