import { sql } from "kysely";
import type { ExpressionBuilder } from "kysely";
import type { Database, DatabaseExecutor } from "@veolms/database";
import { exactCursorTimestamp, isCursorUuid } from "../../lib/keyset.ts";

export type StudentsExecutor = DatabaseExecutor;

/**
 * Subquery of user ids that count as "students": holders of the student
 * role in either role system, or anyone with an enrollment. Used as a
 * semi-join (`u.id IN (...)`) so Postgres computes the union once and
 * hash-joins it, instead of probing three EXISTS subqueries per user row.
 */
function isStudentUserIds(
  eb: ExpressionBuilder<Database & { u: Database["users"] }, "u">,
) {
  return eb
    .selectFrom("user_roles as ur")
    .innerJoin("roles as r", "r.id", "ur.role_id")
    .select("ur.user_id")
    .where("r.name", "=", "student")
    .union(
      eb
        .selectFrom("role_assignments as ra")
        .innerJoin("roles as r2", "r2.id", "ra.role_id")
        .select("ra.user_id")
        .where("r2.name", "=", "student"),
    )
    .union(
      eb.selectFrom("enrollments as e_students").select("e_students.user_id"),
    );
}

type UserExpressionBuilder = ExpressionBuilder<
  Database & { u: Database["users"] },
  "u"
>;

/**
 * Ids of the non-deleted courses a creator owns. Every query below takes an
 * optional `creatorId`: when set (a non-admin caller) the student
 * population, the filters, the sort keys and the per-student aggregates all
 * look only at that creator's courses, so an instructor never sees learners
 * — or enrollments and progress — that belong to someone else's course.
 */
function ownedCourseIds(creatorId: string) {
  return sql<string>`(
    select c_owned.id
    from courses as c_owned
    where c_owned.creator_id = ${creatorId}
      and c_owned.deleted_at is null
  )`;
}

/** Enrollments of the outer user row, optionally narrowed. */
function userEnrollments(
  eb: UserExpressionBuilder,
  filter: {
    courseIds?: readonly string[];
    activeOnly?: boolean;
    creatorId?: string;
  },
) {
  let query = eb
    .selectFrom("enrollments as e")
    .select("e.id")
    .whereRef("e.user_id", "=", "u.id");

  if (filter.courseIds && filter.courseIds.length > 0) {
    query = query.where("e.course_id", "in", filter.courseIds);
  }
  if (filter.activeOnly) {
    query = query.where("e.status", "=", "active");
  }
  if (filter.creatorId) {
    query = query.where("e.course_id", "in", ownedCourseIds(filter.creatorId));
  }
  return query;
}

/** Fully completed lessons of the outer user row (the "completed" filter). */
function completedProgress(eb: UserExpressionBuilder, creatorId?: string) {
  let query = eb
    .selectFrom("learning_progress as lp")
    .select("lp.id")
    .whereRef("lp.user_id", "=", "u.id")
    .where("lp.progress_percent", ">=", 100);

  if (creatorId) {
    query = query.where("lp.course_id", "in", ownedCourseIds(creatorId));
  }
  return query;
}

export interface ListStudentsOptions {
  cursor?: string;
  limit: number;
  search?: string;
  courseId?: string;
  status?: "all" | "active" | "completed" | "inactive";
  sortBy?: "recent" | "name" | "courses" | "progress";
  /** Restrict to learners of this creator's courses (non-admin callers). */
  creatorId?: string;
}

export interface StudentCountOptions {
  courseId?: string | string[];
  search?: string;
  status?: "all" | "active" | "completed" | "inactive";
  /** Restrict to learners of this creator's courses (non-admin callers). */
  creatorId?: string;
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
      // The id is compared as a uuid; anything else used to reach the
      // database and come back as a 500.
      !isCursorUuid(cursor.id)
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
  const creatorId = options.creatorId;
  // The sort keys must count exactly what the service aggregates for the
  // row (it rebuilds the cursor from those aggregates), so they take the
  // same creator scope as the per-student queries further down.
  const enrolledCoursesSort = sql<number>`(
    select count(*)::int
    from enrollments as e_sort
    inner join courses as c_sort on c_sort.id = e_sort.course_id
    where e_sort.user_id = u.id
      and c_sort.deleted_at is null
      ${creatorId ? sql`and c_sort.creator_id = ${creatorId}` : sql``}
  )`;
  const progressSort = sql<number>`(
    select coalesce(avg(lp_sort.progress_percent), 0)::float
    from learning_progress as lp_sort
    where lp_sort.user_id = u.id
      ${creatorId ? sql`and lp_sort.course_id in ${ownedCourseIds(creatorId)}` : sql``}
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
    ])
    .where("u.is_deleted", "=", false)
    // Filter to users that are students (either have student role in
    // user_roles/role_assignments, or have an enrollment). Expressed as a
    // semi-join against a UNION rather than OR-of-three-EXISTS: the OR form
    // probes all three subqueries PER CANDIDATE ROW, which dominated the
    // measured latency of this endpoint at 10k users; the union is computed
    // once and hash-joined.
    .where("u.id", "in", isStudentUserIds);

  if (creatorId) {
    query = query.where((eb) => eb.exists(userEnrollments(eb, { creatorId })));
  }

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
    const courseIds = [options.courseId];
    query = query.where((eb) =>
      eb.exists(userEnrollments(eb, { courseIds, creatorId })),
    );
  }

  if (options.status === "active") {
    query = query.where((eb) =>
      eb.exists(userEnrollments(eb, { activeOnly: true, creatorId })),
    );
  } else if (options.status === "completed") {
    // Has at least one completed lesson or 100% progress
    query = query.where((eb) => eb.exists(completedProgress(eb, creatorId)));
  } else if (options.status === "inactive") {
    // No active enrollments
    query = query.where((eb) =>
      eb.not(eb.exists(userEnrollments(eb, { activeOnly: true, creatorId }))),
    );
  }

  const cursor = decodeStudentListCursor(options.cursor);
  if (cursor?.sortBy === sortBy) {
    if (cursor.sortBy === "recent") {
      const createdAt = exactCursorTimestamp(
        ["users"],
        "created_at",
        cursor.id,
        new Date(cursor.createdAt),
      );
      query = query.where((eb) =>
        eb.or([
          eb("u.created_at", "<", createdAt),
          eb.and([
            eb("u.created_at", "=", createdAt),
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
  options: StudentCountOptions,
): Promise<number> {
  let query = database
    .selectFrom("users as u")
    .select((eb) => eb.fn.count<number>("u.id").as("total"))
    .where("u.is_deleted", "=", false)
    // Same student membership semi-join as listStudentsPaginated — this
    // count runs on EVERY page request alongside the list.
    .where("u.id", "in", isStudentUserIds);

  const creatorId = options.creatorId;
  if (creatorId) {
    query = query.where((eb) => eb.exists(userEnrollments(eb, { creatorId })));
  }

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

  const courseIds = toIdList(options.courseId);
  if (courseIds.length > 0) {
    query = query.where((eb) =>
      eb.exists(userEnrollments(eb, { courseIds, creatorId })),
    );
  }

  if (options.status === "active") {
    query = query.where((eb) =>
      eb.exists(userEnrollments(eb, { activeOnly: true, creatorId })),
    );
  } else if (options.status === "completed") {
    query = query.where((eb) => eb.exists(completedProgress(eb, creatorId)));
  } else if (options.status === "inactive") {
    query = query.where((eb) =>
      eb.not(eb.exists(userEnrollments(eb, { activeOnly: true, creatorId }))),
    );
  }

  const result = await query.executeTakeFirst();
  return Number(result?.total ?? 0);
}

/** Counts unique student accounts created in a date range. */
export async function countStudentsCreatedBetween(
  database: StudentsExecutor,
  options: {
    courseId?: string | string[];
    from: Date;
    to: Date;
  },
): Promise<number> {
  let query = database
    .selectFrom("users as u")
    .select((eb) => eb.fn.count<number>("u.id").as("total"))
    .where("u.is_deleted", "=", false)
    .where("u.created_at", ">=", options.from)
    .where("u.created_at", "<=", options.to)
    // Keep this population definition aligned with countTotalStudents:
    // student-role users or users with at least one enrollment.
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

  const courseIds = toIdList(options.courseId);
  if (courseIds.length === 1) {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.course_id", "=", courseIds[0]!),
      ),
    );
  } else if (courseIds.length > 1) {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("enrollments as e")
          .select("e.id")
          .whereRef("e.user_id", "=", "u.id")
          .where("e.course_id", "in", courseIds),
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
  creatorId?: string,
) {
  if (userIds.length === 0) return [];
  let query = database
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .select(["e.user_id", "e.course_id"])
    .where("e.user_id", "in", userIds)
    .where("c.deleted_at", "is", null);

  if (creatorId) {
    query = query.where("c.creator_id", "=", creatorId);
  }
  return await query.execute();
}

/**
 * Per-(user, course) progress aggregates, used by both the student list and
 * the student detail page.
 *
 * Both used to fetch every learning_progress row for their users and
 * aggregate in JS — ~100+ rows per active user, so a 50-student page moved
 * thousands of rows per request and page throughput was bound by Node
 * parsing them, not by the queries. This returns at most users x courses
 * rows with the same quantities the service was deriving. A lesson counts
 * as completed from 90% progress.
 */
export async function listProgressSummariesForUserIds(
  database: StudentsExecutor,
  userIds: string[],
  creatorId?: string,
) {
  if (userIds.length === 0) return [];
  let query = database
    .selectFrom("learning_progress as lp")
    .select([
      "lp.user_id",
      "lp.course_id",
      sql<number>`count(*)::int`.as("progress_rows"),
      sql<number>`(count(*) filter (where lp.progress_percent >= 90))::int`.as(
        "completed_lessons",
      ),
      sql<number>`avg(lp.progress_percent)::float`.as("avg_progress"),
      sql<Date>`max(lp.updated_at)`.as("last_activity_at"),
    ])
    .where("lp.user_id", "in", userIds);

  if (creatorId) {
    query = query.where("lp.course_id", "in", ownedCourseIds(creatorId));
  }
  return await query.groupBy(["lp.user_id", "lp.course_id"]).execute();
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
 *
 * Only resolves accounts that are students (same population as the list) —
 * this lookup used to return ANY non-deleted user, so the student detail
 * endpoint doubled as a profile reader for admins and other instructors.
 * With `creatorId` it additionally requires an enrollment in one of that
 * creator's courses.
 */
export async function findStudentByUsername(
  database: StudentsExecutor,
  username: string,
  creatorId?: string,
) {
  const cleanUsername = username.replace(/^@+/, "").trim();
  let query = database
    .selectFrom("users as u")
    .select([
      "u.id",
      "u.username",
      "u.display_name",
      "u.email",
      "u.phone_no",
      "u.avatar_data_url",
      "u.bio",
      "u.created_at",
      "u.github_url",
      "u.github_public",
      "u.linkedin_url",
      "u.linkedin_public",
      "u.website_url",
      "u.website_public",
    ])
    .where((eb) =>
      eb.or([
        eb("u.username", "=", cleanUsername),
        eb(sql`LOWER(u.username)`, "=", cleanUsername.toLowerCase()),
      ]),
    )
    .where("u.is_deleted", "=", false)
    .where("u.id", "in", isStudentUserIds);

  if (creatorId) {
    query = query.where((eb) => eb.exists(userEnrollments(eb, { creatorId })));
  }
  return await query.executeTakeFirst();
}

/**
 * Gets all enrolled courses and aggregated metrics for a specific student.
 */
export async function getStudentEnrolledCourses(
  database: StudentsExecutor,
  userId: string,
  creatorId?: string,
) {
  let query = database
    .selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .select([
      "e.course_id",
      "e.source as enrollment_source",
      "e.created_at as enrolled_at",
      "c.slug as course_slug",
      "c.title as course_title",
      "c.short_description as course_description",
      "c.thumbnail_url as course_thumbnail_url",
      "c.difficulty",
    ])
    .where("e.user_id", "=", userId)
    .where("c.deleted_at", "is", null);

  if (creatorId) {
    query = query.where("c.creator_id", "=", creatorId);
  }
  return await query.orderBy("e.created_at", "desc").execute();
}
