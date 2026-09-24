import { sql } from "kysely";
import type { EnrollmentStatus, EnrollmentSource } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export interface EnrollmentAnalyticsFilters {
  courseId?: string | string[];
  from?: Date;
  to?: Date;
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
