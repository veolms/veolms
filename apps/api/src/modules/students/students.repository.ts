import { sql } from "kysely";
import type { DatabaseExecutor } from "@veolms/database";

export type StudentsExecutor = DatabaseExecutor;

export interface ListStudentsOptions {
  cursor?: string;
  limit: number;
  search?: string;
  courseId?: string;
  status?: "all" | "active" | "completed" | "inactive";
  sortBy?: "recent" | "name" | "courses" | "progress";
}

/**
 * Lists student records with cursor-based pagination and search/filters.
 * Fetches limit + 1 rows to allow the service to determine whether a next page exists.
 */
export async function listStudentsPaginated(
  database: StudentsExecutor,
  options: ListStudentsOptions,
) {
  let query = database
    .selectFrom("users as u")
    .select([
      "u.id",
      "u.username",
      "u.display_name",
      "u.email",
      "u.avatar_data_url",
      "u.bio",
      "u.created_at",
      "u.updated_at",
    ])
    .where("u.is_deleted", "=", false)
    // Filter to users that are students (either have student role, or have an enrollment)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("user_roles as ur")
            .innerJoin("roles as r", "r.id", "ur.role_id")
            .select("r.id")
            .whereRef("ur.user_id", "=", "u.id")
            .where("r.name", "=", "student"),
        ),
        eb.exists(
          eb
            .selectFrom("enrollments as e")
            .select("e.id")
            .whereRef("e.user_id", "=", "u.id"),
        ),
      ]),
    );

  if (options.search) {
    const term = `%${options.search}%`;
    query = query.where((eb) =>
      eb.or([
        eb("u.display_name", "ilike", term),
        eb("u.username", "ilike", term),
        eb("u.email", "ilike", term),
      ]),
    );
  }

  if (options.courseId) {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.course_id", "=", options.courseId!),
      ),
    );
  }

  if (options.status === "active") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.status", "=", "active"),
      ),
    );
  } else if (options.status === "completed") {
    // Has at least one completed lesson or 100% progress
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("learning_progress as lp")
          .select("lp.id")
          .whereRef("lp.user_id", "=", "u.id")
          .where("lp.progress_percent", ">=", 100),
      ),
    );
  } else if (options.status === "inactive") {
    // No active enrollments
    query = query.where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("enrollments as e")
            .select("e.id")
            .whereRef("e.user_id", "=", "u.id")
            .where("e.status", "=", "active"),
        ),
      ),
    );
  }

  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      query = query.where("u.created_at", "<", cursorDate);
    }
  }

  if (options.sortBy === "name") {
    query = query.orderBy("u.display_name", "asc").orderBy("u.id", "asc");
  } else {
    query = query.orderBy("u.created_at", "desc").orderBy("u.id", "desc");
  }

  return await query.limit(options.limit + 1).execute();
}

/**
 * Counts total matching students.
 */
export async function countTotalStudents(
  database: StudentsExecutor,
  options: Omit<ListStudentsOptions, "cursor" | "limit">,
): Promise<number> {
  let query = database
    .selectFrom("users as u")
    .select((eb) => eb.fn.count<number>("u.id").as("total"))
    .where("u.is_deleted", "=", false)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("user_roles as ur")
            .innerJoin("roles as r", "r.id", "ur.role_id")
            .select("r.id")
            .whereRef("ur.user_id", "=", "u.id")
            .where("r.name", "=", "student"),
        ),
        eb.exists(
          eb
            .selectFrom("enrollments as e")
            .select("e.id")
            .whereRef("e.user_id", "=", "u.id"),
        ),
      ]),
    );

  if (options.search) {
    const term = `%${options.search}%`;
    query = query.where((eb) =>
      eb.or([
        eb("u.display_name", "ilike", term),
        eb("u.username", "ilike", term),
        eb("u.email", "ilike", term),
      ]),
    );
  }

  if (options.courseId) {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.course_id", "=", options.courseId!),
      ),
    );
  }

  if (options.status === "active") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.status", "=", "active"),
      ),
    );
  } else if (options.status === "completed") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("learning_progress as lp")
          .select("lp.id")
          .whereRef("lp.user_id", "=", "u.id")
          .where("lp.progress_percent", ">=", 100),
      ),
    );
  } else if (options.status === "inactive") {
    query = query.where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("enrollments as e")
            .select("e.id")
            .whereRef("e.user_id", "=", "u.id")
            .where("e.status", "=", "active"),
        ),
      ),
    );
  }

  const result = await query.executeTakeFirst();
  return Number(result?.total ?? 0);
}

/**
 * Batch loads enrollments for a list of student user IDs.
 */
export async function listEnrollmentsForUserIds(
  database: StudentsExecutor,
  userIds: string[],
) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .select([
      "e.user_id",
      "e.id as enrollment_id",
      "e.course_id",
      "e.status as enrollment_status",
      "e.source as enrollment_source",
      "e.created_at as enrolled_at",
      "e.access_expires_at",
      "c.slug as course_slug",
      "c.title as course_title",
      "c.short_description as course_description",
      "c.thumbnail_url as course_thumbnail_url",
      "c.difficulty",
    ])
    .where("e.user_id", "in", userIds)
    .where("c.deleted_at", "is", null)
    .orderBy("e.created_at", "desc")
    .execute();
}

/**
 * Batch loads learning progress records for a list of student user IDs.
 */
export async function listProgressForUserIds(
  database: StudentsExecutor,
  userIds: string[],
) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("learning_progress as lp")
    .select([
      "lp.user_id",
      "lp.course_id",
      "lp.lesson_id",
      "lp.progress_percent",
      "lp.updated_at",
    ])
    .where("lp.user_id", "in", userIds)
    .execute();
}

/**
 * Batch loads total published lesson counts for courses.
 */
export async function listCourseLessonCounts(
  database: StudentsExecutor,
  courseIds: string[],
) {
  if (courseIds.length === 0) return new Map<string, number>();
  const rows = await database
    .selectFrom("course_lessons as cl")
    .select(["cl.course_id", (eb) => eb.fn.count<number>("cl.id").as("cnt")])
    .where("cl.course_id", "in", courseIds)
    .where("cl.is_published", "=", true)
    .where("cl.deleted_at", "is", null)
    .groupBy("cl.course_id")
    .execute();

  const countMap = new Map<string, number>();
  for (const row of rows) {
    countMap.set(row.course_id, Number(row.cnt));
  }
  return countMap;
}

/**
 * Finds a student user by username (case-insensitive).
 */
export async function findStudentByUsername(
  database: StudentsExecutor,
  username: string,
) {
  return await database
    .selectFrom("users as u")
    .selectAll("u")
    .where((eb) =>
      eb.or([
        eb("u.username", "=", username),
        eb(sql`LOWER(u.username)`, "=", username.toLowerCase()),
      ]),
    )
    .where("u.is_deleted", "=", false)
    .executeTakeFirst();
}

/**
 * Gets all enrolled courses and aggregated metrics for a specific student.
 */
export async function getStudentEnrolledCourses(
  database: StudentsExecutor,
  userId: string,
) {
  return await database
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .select([
      "e.id as enrollment_id",
      "e.course_id",
      "e.status as enrollment_status",
      "e.source as enrollment_source",
      "e.created_at as enrolled_at",
      "e.access_expires_at",
      "c.slug as course_slug",
      "c.title as course_title",
      "c.short_description as course_description",
      "c.thumbnail_url as course_thumbnail_url",
      "c.difficulty",
    ])
    .where("e.user_id", "=", userId)
    .where("c.deleted_at", "is", null)
    .orderBy("e.created_at", "desc")
    .execute();
}
