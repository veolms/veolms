// Re-exports the single canonical definition from @veolms/database — see
// commerce/shared/repository.types.ts for the full history of this type
// having been separately (and, in auth's case, incorrectly) redefined in 4
// places.
import { sql } from "kysely";
import type {
  DatabaseExecutor as Executor,
  AccessGrantTable,
  EnrollmentTable,
} from "@veolms/database";
export type { Executor };

export async function findAccessGrantById(database: Executor, grantId: string) {
  return await database
    .selectFrom("access_grants")
    .selectAll()
    .where("id", "=", grantId)
    .executeTakeFirst();
}

/**
 * Writes the enrolment that mirrors a manual grant: inserted, or brought in
 * line with `enrollment` when the learner already has one for the course.
 * An existing enrolment keeps its own source unless `updateSource` is set.
 */
export async function upsertEnrollmentForGrant(
  database: Executor,
  input: {
    id: string;
    userId: string;
    courseId: string;
    enrollment: {
      order_id: string | null;
      status: "active";
      source: EnrollmentTable["source"];
      access_starts_at: Date;
      access_expires_at: Date | null;
      updated_at: Date;
    };
    updateSource: boolean;
    createdAt: Date;
  },
) {
  const { enrollment } = input;
  await database
    .insertInto("enrollments")
    .values({
      id: input.id,
      user_id: input.userId,
      course_id: input.courseId,
      ...enrollment,
      created_at: input.createdAt,
    })
    .onConflict((oc) => {
      const { source, ...withoutSource } = enrollment;
      return oc
        .columns(["user_id", "course_id"])
        .doUpdateSet(
          input.updateSource ? { ...withoutSource, source } : withoutSource,
        );
    })
    .executeTakeFirst();
}

/** Marks the learner's enrolment in the course revoked. */
export async function revokeEnrollment(
  database: Executor,
  userId: string,
  courseId: string,
) {
  await database
    .updateTable("enrollments")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .execute();
}

/** The learner's enrolment in the course, whatever its status. */
export async function findEnrollmentForCourse(
  database: Executor,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("enrollments")
    .select(["id", "status"])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

/**
 * Makes a revoked grant and its enrolment active again, exactly as they
 * were: order, source and access period are not touched, so a later refund
 * of the order that paid for them still finds them. Rows in any other
 * status are left alone.
 */
export async function restoreRevokedCourseAccess(
  database: Executor,
  userId: string,
  courseId: string,
) {
  const now = new Date();
  await database
    .updateTable("access_grants")
    .set({ status: "active", updated_at: now })
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .where("status", "=", "revoked")
    .execute();
  await database
    .updateTable("enrollments")
    .set({ status: "active", updated_at: now })
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .where("status", "=", "revoked")
    .execute();
}

export async function findAccessGrant(
  database: Executor,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("access_grants")
    .selectAll()
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function listUserAccessGrants(database: Executor, userId: string) {
  return await database
    .selectFrom("access_grants")
    .selectAll()
    .where("user_id", "=", userId)
    .execute();
}

export async function insertAccessGrant(
  database: Executor,
  values: {
    id: string;
    user_id: string;
    course_id: string;
    order_id?: string | null;
    status: "active" | "suspended" | "revoked" | "expired";
    source: AccessGrantTable["source"];
    valid_from?: Date;
    valid_until?: Date | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  // True for an existing row that is live, was paid for by an order, and is
  // being granted again without one.
  const keepsPayingOrder = sql<boolean>`(
    excluded.order_id is null
    and access_grants.order_id is not null
    and access_grants.status = 'active'
    and (access_grants.valid_until is null
         or access_grants.valid_until > now())
  )`;

  return await database
    .insertInto("access_grants")
    .values(values)
    .onConflict((oc) =>
      // Reactivates on repurchase. Previously only refreshed `status` and
      // `valid_until`, leaving `order_id` pointed at whichever order
      // originally created the row: buy course X under order A, get
      // refunded, buy X again under order C — this upsert flipped `status`
      // back to `active` but left `order_id = A`. Refunding order C later
      // then revokes zero rows (`revokeAccessGrantsByOrderId` filters
      // `WHERE order_id = 'C'`), leaving access granted despite the
      // purchase that's actually being refunded. Now refreshes every field
      // a fresh insert would set, same as enrollment.repository.ts's
      // insertEnrollment upsert (#24) — order_id included, so a reactivated
      // grant correctly points at the new purchase.
      //
      // One exception to "refresh everything": a grant that is still live
      // never has its validity SHORTENED by a later grant. Without this, a
      // lifetime purchase became time-limited when the same course was
      // bought again (alone or inside a bundle) under a fixed-duration
      // access rule. A lapsed row (revoked, or past its end date) simply
      // takes the new validity.
      //
      // A second exception: a grant made without an order (a manual grant)
      // never takes a live grant away from the order that paid for it. It
      // used to null `order_id` and relabel the row `admin_grant`, so a
      // later refund of that order revoked nothing. A live row that belongs
      // to an order keeps its order, source and start date; only its end
      // date can move, and only later.
      oc.columns(["user_id", "course_id"]).doUpdateSet({
        order_id: sql<string | null>`case
          when ${keepsPayingOrder} then access_grants.order_id
          else excluded.order_id
        end`,
        status: values.status,
        source: sql<
          typeof values.source
        >`case when ${keepsPayingOrder} then access_grants.source else excluded.source end`,
        valid_from: sql<Date>`case
          when ${keepsPayingOrder} then access_grants.valid_from
          else ${values.valid_from ?? new Date()}
        end`,
        valid_until: sql<Date | null>`case
          when access_grants.status <> 'active'
            or (access_grants.valid_until is not null
                and access_grants.valid_until <= now())
            then excluded.valid_until
          when access_grants.valid_until is null
            or excluded.valid_until is null
            then null
          else greatest(access_grants.valid_until, excluded.valid_until)
        end`,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAccessGrantStatus(
  database: Executor,
  grantId: string,
  status: "active" | "suspended" | "revoked" | "expired",
) {
  return await database
    .updateTable("access_grants")
    .set({
      status,
      updated_at: new Date(),
    })
    .where("id", "=", grantId)
    .returningAll()
    .executeTakeFirst();
}

export async function revokeAccessGrantsByOrderId(
  database: Executor,
  orderId: string,
) {
  return await database
    .updateTable("access_grants")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("order_id", "=", orderId)
    .returningAll()
    .execute();
}

export async function revokeAccessGrantsForOrderCourse(
  database: Executor,
  orderId: string,
  courseId: string,
) {
  return await database
    .updateTable("access_grants")
    .set({
      status: "revoked",
      updated_at: new Date(),
    })
    .where("order_id", "=", orderId)
    .where("course_id", "=", courseId)
    .returningAll()
    .execute();
}

/** Courses whose live grant currently belongs to an order. */
export async function listActiveGrantCourseIdsByOrderId(
  database: Executor,
  orderId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("access_grants")
    .select("course_id")
    .where("order_id", "=", orderId)
    .where("status", "=", "active")
    .execute();
  return rows.map((row) => row.course_id);
}

/**
 * Hands a course grant from one order to another without interrupting
 * access. Used when the order that owns the row is refunded but the buyer
 * still holds the course through a different paid order.
 */
export async function reassignAccessGrantOrder(
  database: Executor,
  input: {
    fromOrderId: string;
    courseId: string;
    toOrderId: string;
    source: "purchase" | "bundle_purchase";
  },
) {
  return await database
    .updateTable("access_grants")
    .set({
      order_id: input.toOrderId,
      source: input.source,
      updated_at: new Date(),
    })
    .where("order_id", "=", input.fromOrderId)
    .where("course_id", "=", input.courseId)
    .returningAll()
    .execute();
}

export async function listActiveUserIdsForCourse(
  database: Executor,
  courseId: string,
): Promise<string[]> {
  const now = new Date();
  const rows = await database
    .selectFrom("access_grants")
    .select("user_id")
    .where("course_id", "=", courseId)
    .where("status", "=", "active")
    .where((eb) =>
      eb.or([eb("valid_until", "is", null), eb("valid_until", ">", now)]),
    )
    .execute();
  return rows.map((row) => row.user_id);
}

/** The learner and course a manual grant names, as far as the grant cares. */
export async function findManualGrantTargets(
  database: Executor,
  userId: string,
  courseId: string,
) {
  const [user, course] = await Promise.all([
    database
      .selectFrom("users")
      .select(["id", "is_deleted"])
      .where("id", "=", userId)
      .executeTakeFirst(),
    database
      .selectFrom("courses")
      .select(["id", "status", "deleted_at"])
      .where("id", "=", courseId)
      .executeTakeFirst(),
  ]);
  return { user, course };
}
