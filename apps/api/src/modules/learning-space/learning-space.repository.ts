import type { Database, DatabaseExecutor } from "@veolms/database";

export type LearningSpaceSessionExecutor = DatabaseExecutor;

function sessionWithCourseQuery(database: LearningSpaceSessionExecutor) {
  return database
    .selectFrom("learning_space_sessions")
    .innerJoin("courses", "courses.id", "learning_space_sessions.course_id")
    .leftJoin("course_lessons", (join) =>
      join
        .onRef("course_lessons.id", "=", "learning_space_sessions.lesson_id")
        .on("course_lessons.deleted_at", "is", null),
    )
    .select([
      "learning_space_sessions.id",
      "learning_space_sessions.user_id",
      "learning_space_sessions.course_id",
      "learning_space_sessions.lesson_id",
      "learning_space_sessions.lesson_number",
      "learning_space_sessions.origin",
      "learning_space_sessions.return_path",
      "learning_space_sessions.created_at",
      "learning_space_sessions.updated_at",
      "courses.slug as course_slug",
      "courses.title as course_title",
      "course_lessons.title as lesson_title",
    ]);
}

export function listUserSessions(
  database: LearningSpaceSessionExecutor,
  userId: string,
) {
  return sessionWithCourseQuery(database)
    .where("learning_space_sessions.user_id", "=", userId)
    .where("courses.deleted_at", "is", null)
    .orderBy("learning_space_sessions.updated_at", "desc")
    .orderBy("learning_space_sessions.id", "desc")
    .execute();
}

export function findUserSession(
  database: LearningSpaceSessionExecutor,
  userId: string,
  courseId: string,
) {
  return sessionWithCourseQuery(database)
    .where("learning_space_sessions.user_id", "=", userId)
    .where("learning_space_sessions.course_id", "=", courseId)
    .where("courses.deleted_at", "is", null)
    .executeTakeFirst();
}

export async function upsertSession(
  database: LearningSpaceSessionExecutor,
  input: {
    id: string;
    userId: string;
    courseId: string;
    lessonId: string | null;
    lessonNumber: number | null;
    origin: "home" | "courses" | "wishlist";
    returnPath: string;
    now: Date;
  },
) {
  await database
    .insertInto("learning_space_sessions")
    .values({
      id: input.id,
      user_id: input.userId,
      course_id: input.courseId,
      lesson_id: input.lessonId,
      lesson_number: input.lessonNumber,
      origin: input.origin,
      return_path: input.returnPath,
      created_at: input.now,
      updated_at: input.now,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "course_id"]).doUpdateSet({
        lesson_id: input.lessonId,
        lesson_number: input.lessonNumber,
        origin: input.origin,
        return_path: input.returnPath,
        updated_at: input.now,
      }),
    )
    .execute();

  return await findUserSession(database, input.userId, input.courseId);
}

export async function deleteUserSession(
  database: LearningSpaceSessionExecutor,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const result = await database
    .deleteFrom("learning_space_sessions")
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

export function listCourseLessons(
  database: DatabaseExecutor,
  courseId: string,
) {
  return database
    .selectFrom("course_lessons")
    .innerJoin(
      "course_sections",
      "course_sections.id",
      "course_lessons.section_id",
    )
    .select([
      "course_lessons.id",
      "course_lessons.course_id",
      "course_lessons.title",
      "course_lessons.is_published",
      "course_sections.position as section_position",
      "course_lessons.position as lesson_position",
    ])
    .where("course_lessons.course_id", "=", courseId)
    .where("course_lessons.deleted_at", "is", null)
    .where("course_sections.deleted_at", "is", null)
    .orderBy("course_sections.position", "asc")
    .orderBy("course_lessons.position", "asc")
    .orderBy("course_lessons.id", "asc")
    .execute();
}

export type LearningSpaceSessionRow = NonNullable<
  Awaited<ReturnType<typeof findUserSession>>
>;
