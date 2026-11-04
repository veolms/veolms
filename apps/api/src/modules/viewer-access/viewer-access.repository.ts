import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

/**
 * The learner's active, unexpired enrolment in a course, with the order that
 * gave it and how it was paid; undefined when they hold none.
 */
export async function findEnrollmentOrder(
  database: Kysely<Database>,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("enrollments as e")
    .leftJoin("orders as o", "o.id", "e.order_id")
    .select([
      "e.access_starts_at",
      "e.source",
      "o.id as order_id",
      "o.order_number",
      "o.total_amount",
      "o.currency",
      "o.paid_at",
      "o.invoice_number",
    ])
    // The captured payment, newest first: an order paid once has one.
    .select((eb) =>
      eb
        .selectFrom("payments as p")
        .select("p.payment_method")
        .whereRef("p.order_id", "=", "o.id")
        .where("p.status", "in", ["captured", "refunded"])
        .orderBy("p.created_at", "desc")
        .limit(1)
        .as("payment_method"),
    )
    .where("e.user_id", "=", userId)
    .where("e.course_id", "=", courseId)
    .where("e.status", "=", "active")
    .where((eb) =>
      eb.or([
        eb("e.access_expires_at", "is", null),
        eb("e.access_expires_at", ">", new Date()),
      ]),
    )
    .executeTakeFirst();
}

/**
 * For a course a link gave the learner, the course that gave it (the
 * longest-held live one, when several do) and the order that paid for that
 * course; undefined when none is live.
 */
export async function findLinkingCourseOrder(
  database: Kysely<Database>,
  userId: string,
  courseId: string,
) {
  return await database
    .selectFrom("access_grants as g")
    .innerJoin("course_links as cl", "cl.course_id", "g.course_id")
    .innerJoin("courses as c", "c.id", "g.course_id")
    .leftJoin("orders as o", "o.id", "g.order_id")
    .select([
      "c.title as course_title",
      "g.valid_from",
      "o.id as order_id",
      "o.order_number",
      "o.total_amount",
      "o.currency",
      "o.paid_at",
      "o.invoice_number",
    ])
    .select((eb) =>
      eb
        .selectFrom("payments as p")
        .select("p.payment_method")
        .whereRef("p.order_id", "=", "o.id")
        .where("p.status", "in", ["captured", "refunded"])
        .orderBy("p.created_at", "desc")
        .limit(1)
        .as("payment_method"),
    )
    .where("g.user_id", "=", userId)
    .where("cl.linked_course_id", "=", courseId)
    .where("g.status", "=", "active")
    .where("g.source", "<>", "linked_course")
    .where((eb) =>
      eb.or([
        eb("g.valid_until", "is", null),
        eb("g.valid_until", ">", new Date()),
      ]),
    )
    .orderBy("g.valid_from", "asc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * The learner's study of a course for their pace: the first day they
 * studied it, and the lessons they completed since `since`.
 */
export async function findCourseActivity(
  database: Kysely<Database>,
  userId: string,
  courseId: string,
  since: Date,
) {
  const row = await database
    .selectFrom("learning_daily_course_activity")
    .select([
      sql<Date | null>`min(activity_date)`.as("first_activity_on"),
      sql<string>`coalesce(sum(completions) filter (where activity_date >= ${since}), 0)`.as(
        "recent_completions",
      ),
    ])
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .where((eb) => eb.or([eb("seconds", ">", 0), eb("completions", ">", 0)]))
    .executeTakeFirst();
  return {
    firstActivityOn: row?.first_activity_on
      ? new Date(row.first_activity_on)
      : null,
    recentCompletions: Number(row?.recent_completions ?? 0),
  };
}
