import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Insertable } from "kysely";
import type { QuizPricingRow } from "../../commerce/pricing/quiz-pricing.amount.ts";

/**
 * Quiz pricing is stored once per course and applies to every quiz attached to
 * it. No row means the course's quizzes are free.
 */
export async function findPricing(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_quiz_pricing")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

/** The course's configured currency; quiz pricing always follows it. */
export async function findCourseCurrency(
  database: DatabaseExecutor,
  courseId: string,
) {
  const row = await database
    .selectFrom("course_pricing")
    .select("currency")
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  return (row?.currency ?? "INR").toUpperCase();
}

export async function findPricingById(database: DatabaseExecutor, id: string) {
  return await database
    .selectFrom("course_quiz_pricing")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function listPricingForCourses(
  database: DatabaseExecutor,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("course_quiz_pricing")
    .selectAll()
    .where("course_id", "in", courseIds)
    .execute();
}

export async function upsertPricing(
  database: DatabaseExecutor,
  values: Insertable<Database["course_quiz_pricing"]>,
) {
  return await database
    .insertInto("course_quiz_pricing")
    .values(values)
    .onConflict((oc) =>
      oc.column("course_id").doUpdateSet({
        pricing_type: values.pricing_type,
        price: values.price,
        currency: values.currency,
        sale_price: values.sale_price ?? null,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Assignment joined with its quiz, course and (nullable) course pricing row. */
export async function findOfferingByAssignmentId(
  database: DatabaseExecutor,
  assignmentId: string,
) {
  return await database
    .selectFrom("quiz_assignments as qa")
    .innerJoin("quizzes as q", "q.id", "qa.quiz_id")
    .innerJoin("courses as c", "c.id", "qa.course_id")
    .leftJoin("course_lessons as l", "l.id", "qa.lesson_id")
    .leftJoin("course_quiz_pricing as p", "p.course_id", "qa.course_id")
    .select([
      "qa.id as assignment_id",
      "l.is_preview as lesson_is_preview",
      "qa.quiz_id",
      "qa.course_id",
      "qa.lesson_id",
      "q.title as quiz_title",
      "c.title as course_title",
      "c.status as course_status",
      "c.creator_id as course_creator_id",
      "p.id as pricing_id",
      "p.pricing_type",
      "p.price",
      "p.currency",
      "p.sale_price",
    ])
    .where("qa.id", "=", assignmentId)
    .where("q.deleted_at", "is", null)
    .executeTakeFirst();
}

/** Course pricing rows joined with their course, for checkout. */
export async function listOfferingsByPricingIds(
  database: DatabaseExecutor,
  ids: readonly string[],
) {
  if (ids.length === 0) return [];
  return await database
    .selectFrom("course_quiz_pricing as p")
    .innerJoin("courses as c", "c.id", "p.course_id")
    .select([
      "p.id as pricing_id",
      "p.course_id",
      "p.pricing_type",
      "p.price",
      "p.currency",
      "p.sale_price",
      "c.title as course_title",
      "c.status as course_status",
    ])
    .where("p.id", "in", ids)
    .where("c.deleted_at", "is", null)
    .execute();
}

/** Adapts a (left-joined, possibly null) offering row to the pure price helper. */
export function toPricingRow(offering: {
  pricing_type: "free" | "paid" | null;
  price: number | null;
  sale_price: number | null;
}): QuizPricingRow | null {
  if (!offering.pricing_type) return null;
  return {
    pricing_type: offering.pricing_type,
    price: Number(offering.price ?? 0),
    sale_price:
      offering.sale_price === null ? null : Number(offering.sale_price),
  };
}

/** The user's active quiz pass for a course, if any. It covers every quiz in the course. */
export async function findActiveGrant(
  database: DatabaseExecutor,
  input: { userId: string; courseId: string; now: Date },
) {
  return await database
    .selectFrom("course_quiz_access_grants")
    .selectAll()
    .where("user_id", "=", input.userId)
    .where("course_id", "=", input.courseId)
    .where("status", "=", "active")
    .where((eb) =>
      eb.or([eb("valid_until", "is", null), eb("valid_until", ">", input.now)]),
    )
    .executeTakeFirst();
}

export async function upsertGrant(
  database: DatabaseExecutor,
  values: Insertable<Database["course_quiz_access_grants"]>,
) {
  return await database
    .insertInto("course_quiz_access_grants")
    .values(values)
    .onConflict((oc) =>
      oc.columns(["user_id", "course_id"]).doUpdateSet({
        status: "active",
        order_id: values.order_id ?? null,
        source: values.source ?? "purchase",
        valid_until: values.valid_until ?? null,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function revokeGrantsByOrderId(
  database: DatabaseExecutor,
  orderId: string,
) {
  await database
    .updateTable("course_quiz_access_grants")
    .set({ status: "revoked", updated_at: new Date() })
    .where("order_id", "=", orderId)
    .execute();
}

export async function revokeGrantForOrderCourse(
  database: DatabaseExecutor,
  input: { orderId: string; courseId: string },
) {
  await database
    .updateTable("course_quiz_access_grants")
    .set({ status: "revoked", updated_at: new Date() })
    .where("order_id", "=", input.orderId)
    .where("course_id", "=", input.courseId)
    .execute();
}
