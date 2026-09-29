import { sql } from "kysely";
import type { EnrollmentStatus, EnrollmentSource } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export interface EnrollmentAnalyticsFilters {
  courseId?: string | string[];
  from?: Date;
  to?: Date;
}

export async function listAcademyEnrollments(
  database: Executor,
  limit: number,
) {
  return await database
    .selectFrom("enrollments as e")
    .innerJoin("users as u", "u.id", "e.user_id")
    .innerJoin("courses as c", "c.id", "e.course_id")
    .leftJoin("learning_progress as lp", (join) =>
      join
        .onRef("lp.user_id", "=", "e.user_id")
        .onRef("lp.course_id", "=", "e.course_id"),
    )
    .select([
      "e.id as enrollment_id",
      "e.created_at as enrolled_at",
      "u.id as student_id",
      "u.username as student_username",
      "u.display_name as student_display_name",
      "u.avatar_data_url as student_avatar_data_url",
      "c.id as course_id",
      "c.title as course_title",
      sql<number | null>`avg(lp.progress_percent)`.as(
        "average_progress_percent",
      ),
    ])
    .where("u.is_deleted", "=", false)
    .where("c.deleted_at", "is", null)
    .groupBy([
      "e.id",
      "e.created_at",
      "u.id",
      "u.username",
      "u.display_name",
      "u.avatar_data_url",
      "c.id",
      "c.title",
    ])
    .orderBy("e.created_at", "desc")
    .orderBy("e.id", "desc")
    .limit(limit)
    .execute();
}

function toCourseIdList(courseId: string | string[] | undefined): string[] {
  if (!courseId) return [];
  return Array.isArray(courseId) ? courseId : [courseId];
}

export async function findEnrollment(
  database: Executor,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("enrollments")
    .selectAll()
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function listUserEnrollments(
  database: Executor,
  userId: string,
  status?: EnrollmentStatus,
) {
  let query = database
    .selectFrom("enrollments")
    .selectAll()
    .where("user_id", "=", userId);

  if (status) {
    query = query.where("status", "=", status);
  }

  return await query.orderBy("created_at", "desc").execute();
}

export async function listUserEnrolledCourseIds(
  database: Executor,
  userId: string,
) {
  const rows = await database
    .selectFrom("enrollments")
    .select("course_id")
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .where((eb) =>
      eb.or([
        eb("access_expires_at", "is", null),
        eb("access_expires_at", ">", new Date()),
      ]),
    )
    .execute();

  return rows.map((r) => r.course_id);
}

export async function listActiveUserIdsByCourseId(
  database: Executor,
  courseId: string,
) {
  const rows = await database
    .selectFrom("enrollments")
    .select("user_id")
    .where("course_id", "=", courseId)
    .where("status", "=", "active")
    .where((expression) =>
      expression.or([
        expression("access_expires_at", "is", null),
        expression("access_expires_at", ">", new Date()),
      ]),
    )
    .execute();
  return rows.map((row) => row.user_id);
}

export async function getEnrollmentStats(
  database: Executor,
  filters: EnrollmentAnalyticsFilters,
): Promise<{ totalEnrollments: number; activeEnrollments: number }> {
  const courseIds = toCourseIdList(filters.courseId);

  let query = database
    .selectFrom("enrollments")
    .select([
      sql<number>`count(*)::int`.as("total"),
      sql<number>`count(*) filter (where status = 'active')::int`.as("active"),
    ]);

  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }
  if (filters.from) {
    query = query.where("created_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("created_at", "<=", filters.to);
  }

  const row = await query.executeTakeFirst();
  return {
    totalEnrollments: Number(row?.total ?? 0),
    activeEnrollments: Number(row?.active ?? 0),
  };
}

/**
 * Counts enrollment-row creation events in UTC 8-hour buckets. `to` is an
 * exclusive upper bound so the returned buckets compose cleanly into the
 * adjacent current and previous seven-day windows.
 */
export async function getEnrollmentActivityBuckets(
  database: Executor,
  filters: EnrollmentAnalyticsFilters,
): Promise<Array<{ start: Date; value: number }>> {
  const courseIds = toCourseIdList(filters.courseId);
  const bucketStart = sql<string>`date_trunc('day', created_at at time zone 'UTC') + floor(extract(hour from created_at at time zone 'UTC') / 8) * interval '8 hours'`;
  const bucketLabel = sql<string>`to_char(${bucketStart}, 'YYYY-MM-DD"T"HH24:MI:SS.MS')`;

  let query = database
    .selectFrom("enrollments")
    .select([
      bucketLabel.as("bucket_start"),
      sql<number>`count(*)::int`.as("value"),
    ])
    .groupBy(bucketStart)
    .orderBy(bucketStart);

  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }
  if (filters.from) {
    query = query.where("created_at", ">=", filters.from);
  }
  if (filters.to) {
    query = query.where("created_at", "<", filters.to);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    start: new Date(`${row.bucket_start}Z`),
    value: Number(row.value),
  }));
}

export async function listTopCoursesByEnrollment(
  database: Executor,
  options: {
    limit: number;
    from?: Date;
    to?: Date;
    courseId?: string | string[];
  },
): Promise<Array<{ courseId: string; enrollmentCount: number }>> {
  let query = database
    .selectFrom("enrollments")
    .select([
      "course_id",
      sql<number>`count(*)::int`.as("enrollment_count"),
    ])
    .groupBy("course_id")
    .orderBy(sql`count(*)`, "desc")
    .limit(options.limit);

  if (options.from) {
    query = query.where("created_at", ">=", options.from);
  }
  if (options.to) {
    query = query.where("created_at", "<=", options.to);
  }
  const courseIds = toCourseIdList(options.courseId);
  if (courseIds.length > 0) {
    query = query.where("course_id", "in", courseIds);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    courseId: row.course_id,
    enrollmentCount: Number(row.enrollment_count),
  }));
}

export async function listEnrollmentCountsByCourse(
  database: Executor,
  options: { courseId?: string | string[] } = {},
): Promise<Array<{ courseId: string; enrollmentCount: number }>> {
  const courseIds = toCourseIdList(options.courseId);
  if (courseIds.length === 0) return [];

  const rows = await database
    .selectFrom("enrollments")
    .select([
      "course_id",
      sql<number>`count(*)::int`.as("enrollment_count"),
    ])
    .where("course_id", "in", courseIds)
    .groupBy("course_id")
    .execute();

  return rows.map((row) => ({
    courseId: row.course_id,
    enrollmentCount: Number(row.enrollment_count),
  }));
}

export async function insertEnrollment(
  database: Executor,
  values: {
    id: string;
    user_id: string;
    course_id: string;
    order_id?: string | null;
    status: EnrollmentStatus;
    source: EnrollmentSource;
    access_starts_at?: Date;
    access_expires_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("enrollments")
    .values(values)
    .onConflict((oc) =>
      // Reactivates on repurchase — mirrors access.repository.ts's
      // insertAccessGrant upsert. A plain `doNothing()` here (the previous
      // behavior) meant a course bought again after a refund left this row
      // stuck "revoked" forever even though the matching access_grants row
      // correctly flips back to "active": grantAccessForOrder calls this
      // with status "active" on every purchase, and the unique constraint
      // on (user_id, course_id) made that a no-op instead of a reactivation.
      // Refreshes every field a fresh insert would set — order_id included,
      // so this reactivated row correctly points at the *new* purchase
      // (the order that will actually revoke it on refund), not whichever
      // order originally created the row.
      oc.columns(["user_id", "course_id"]).doUpdateSet({
        order_id: values.order_id ?? null,
        status: values.status,
        source: values.source,
        access_starts_at: values.access_starts_at ?? new Date(),
        access_expires_at: values.access_expires_at ?? null,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirst();
}

export async function updateEnrollmentStatus(
  database: Executor,
  userId: string,
  courseId: string,
  status: EnrollmentStatus,
) {
  return await database
    .updateTable("enrollments")
    .set({
      status,
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Revokes every enrollment row belonging to an order — mirrors
 * access.repository.ts's revokeAccessGrantsByOrderId. Scoping by `order_id`
 * (not `(user_id, course_id)` alone, which `updateEnrollmentStatus` above
 * does) matters because a user can own the same course through two
 * different orders — e.g. bought directly under order A, then separately
 * bought a bundle containing it under order C (bundle purchase is only
 * blocked when *every* member course is already owned). Refunding order C
 * must revoke only the enrollment order C is currently responsible for, not
 * every enrollment for that (user, course) pair regardless of which order
 * granted it.
 */
export async function revokeEnrollmentsByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .updateTable("enrollments")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("order_id", "=", orderId)
    .returningAll()
    .execute();
}

export async function revokeEnrollmentsForOrderCourse(
  database: Executor,
  orderId: string,
  courseId: string,
) {
  return await database
    .updateTable("enrollments")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("order_id", "=", orderId)
    .where("course_id", "=", courseId)
    .returningAll()
    .execute();
}
