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

export type StudentListSort = NonNullable<ListStudentsOptions["sortBy"]>;

export type StudentListCursor =
  | { sortBy: "recent"; createdAt: string; id: string }
  | { sortBy: "name"; name: string; id: string }
  | { sortBy: "courses"; courses: number; id: string }
  | { sortBy: "progress"; progress: number; id: string };

const studentListSorts: readonly StudentListSort[] = [
  "recent",
  "name",
  "courses",
  "progress",
];

/**
 * Cursors are opaque to clients but include the complete sort position so
 * every supported ordering can seek without skipping or duplicating rows.
 */
export function encodeStudentListCursor(cursor: StudentListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeStudentListCursor(
  value: string | undefined,
): StudentListCursor | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;

    const cursor = parsed as Record<string, unknown>;
    if (
      typeof cursor.sortBy !== "string" ||
      !studentListSorts.includes(cursor.sortBy as StudentListSort) ||
      typeof cursor.id !== "string" ||
      cursor.id.length === 0
    )
      return null;

    if (cursor.sortBy === "recent") {
      return typeof cursor.createdAt === "string" &&
        !Number.isNaN(new Date(cursor.createdAt).getTime())
        ? { sortBy: "recent", createdAt: cursor.createdAt, id: cursor.id }
        : null;
    }

    if (cursor.sortBy === "name") {
      return typeof cursor.name === "string"
        ? { sortBy: "name", name: cursor.name, id: cursor.id }
        : null;
    }

    if (cursor.sortBy === "courses") {
      return typeof cursor.courses === "number" &&
        Number.isFinite(cursor.courses)
        ? { sortBy: "courses", courses: cursor.courses, id: cursor.id }
        : null;
    }

    return typeof cursor.progress === "number" &&
      Number.isFinite(cursor.progress)
      ? { sortBy: "progress", progress: cursor.progress, id: cursor.id }
      : null;
  } catch {
    return null;
  }
}

/**
 * Lists student records with cursor-based pagination and search/filters.
 * Fetches limit + 1 rows to allow the service to determine whether a next page exists.
 */
export async function listStudentsPaginated(
  database: StudentsExecutor,
  options: ListStudentsOptions,
) {
  const sortBy = options.sortBy ?? "recent";
  const enrolledCoursesSort = sql<number>`(
    select count(*)::int
    from enrollments as e_sort
    inner join courses as c_sort on c_sort.id = e_sort.course_id
    where e_sort.user_id = u.id
      and c_sort.deleted_at is null
  )`;
  const progressSort = sql<number>`(
    select coalesce(avg(lp_sort.progress_percent), 0)::float
    from learning_progress as lp_sort
    where lp_sort.user_id = u.id
  )`;

  let query = database
    .selectFrom("users as u")
    .select([
      "u.id",
      "u.username",
      "u.display_name",
      "u.email",
      "u.avatar_data_url",
      "u.created_at",
      "u.updated_at",
    ])
    .where("u.is_deleted", "=", false)
    // Filter to users that are students (either have student role in user_roles/role_assignments, or have an enrollment)
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
            .selectFrom("role_assignments as ra")
            .innerJoin("roles as r", "r.id", "ra.role_id")
            .select("r.id")
            .whereRef("ra.user_id", "=", "u.id")
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
    const cleanSearch = options.search.replace(/^@+/, "").trim();
    if (cleanSearch) {
      const term = `%${cleanSearch}%`;
      query = query.where((eb) =>
        eb.or([
          eb("u.display_name", "ilike", term),
          eb("u.username", "ilike", term),
          eb("u.email", "ilike", term),
        ]),
      );
    }
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

  const cursor = decodeStudentListCursor(options.cursor);
  if (cursor?.sortBy === sortBy) {
    if (cursor.sortBy === "recent") {
      const cursorDate = new Date(cursor.createdAt);
      query = query.where((eb) =>
        eb.or([
          eb("u.created_at", "<", cursorDate),
          eb.and([
            eb("u.created_at", "=", cursorDate),
            eb("u.id", "<", cursor.id),
          ]),
        ]),
      );
    } else if (cursor.sortBy === "name") {
      query = query.where((eb) =>
        eb.or([
          eb("u.display_name", ">", cursor.name),
          eb.and([
            eb("u.display_name", "=", cursor.name),
            eb("u.id", ">", cursor.id),
          ]),
        ]),
      );
    } else if (cursor.sortBy === "courses") {
      query = query.where(
        sql<boolean>`(
          ${enrolledCoursesSort} < ${cursor.courses}
          or (${enrolledCoursesSort} = ${cursor.courses} and u.id < ${cursor.id})
        )`,
      );
    } else {
      query = query.where(
        sql<boolean>`(
          ${progressSort} < ${cursor.progress}
          or (${progressSort} = ${cursor.progress} and u.id < ${cursor.id})
        )`,
      );
    }
  }

  if (sortBy === "name") {
    query = query.orderBy("u.display_name", "asc").orderBy("u.id", "asc");
  } else if (sortBy === "courses") {
    query = query.orderBy(enrolledCoursesSort, "desc").orderBy("u.id", "desc");
  } else if (sortBy === "progress") {
    query = query.orderBy(progressSort, "desc").orderBy("u.id", "desc");
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
    // Filter to users that are students (either have student role in user_roles/role_assignments, or have an enrollment)
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
            .selectFrom("role_assignments as ra")
            .innerJoin("roles as r", "r.id", "ra.role_id")
            .select("r.id")
            .whereRef("ra.user_id", "=", "u.id")
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
    const cleanSearch = options.search.replace(/^@+/, "").trim();
    if (cleanSearch) {
      const term = `%${cleanSearch}%`;
      query = query.where((eb) =>
        eb.or([
          eb("u.display_name", "ilike", term),
          eb("u.username", "ilike", term),
          eb("u.email", "ilike", term),
        ]),
      );
    }
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

function toIdList(courseId: string | string[] | undefined): string[] {
  if (!courseId) return [];
  return Array.isArray(courseId) ? courseId : [courseId];
}

/** Distinct users with learning-progress activity in the range. */
export async function getActiveLearnerCount(
  database: StudentsExecutor,
  options: { courseId?: string | string[]; from?: Date; to?: Date },
): Promise<number> {
  let query = database
    .selectFrom("learning_progress")
    .select(sql<number>`count(distinct user_id)::int`.as("count"));

  const courseIds = toIdList(options.courseId);
  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }
  if (options.from) {
    query = query.where("updated_at", ">=", options.from);
  }
  if (options.to) {
    query = query.where("updated_at", "<=", options.to);
  }

  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
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
    .select(["e.user_id", "e.course_id", "e.created_at as enrolled_at"])
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
 * Batch loads avatars for a list of student user IDs.
 */
export async function listAvatarsForUserIds(
  database: StudentsExecutor,
  userIds: string[],
) {
  if (userIds.length === 0) return [];
  return await database
    .selectFrom("user_avatars")
    .select([
      "id",
      "user_id",
      "source",
      "avatar_data_url",
      "created_at",
      "last_used_at",
    ])
    .where("user_id", "in", userIds)
    .orderBy("created_at", "desc")
    .execute();
}

/**
 * Finds a student user by username (case-insensitive, strips any leading @).
 */
export async function findStudentByUsername(
  database: StudentsExecutor,
  username: string,
) {
  const cleanUsername = username.replace(/^@+/, "").trim();
  return await database
    .selectFrom("users as u")
    .selectAll("u")
    .where((eb) =>
      eb.or([
        eb("u.username", "=", cleanUsername),
        eb(sql`LOWER(u.username)`, "=", cleanUsername.toLowerCase()),
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
