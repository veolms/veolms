import type { Database } from "@veolms/database";
import type { Kysely, Transaction } from "kysely";

type Executor = Kysely<Database> | Transaction<Database>;

/** An order's items, with the course or workshop each one is for. */
export async function listConfirmationItems(
  database: Executor,
  orderId: string,
) {
  return await database
    .selectFrom("order_items as i")
    .leftJoin("courses as c", (join) =>
      join.onRef("c.id", "=", "i.course_id").on("c.deleted_at", "is", null),
    )
    .leftJoin("course_settings as cs", "cs.course_id", "c.id")
    .leftJoin("workshops as w", (join) =>
      join.onRef("w.id", "=", "i.workshop_id").on("w.deleted_at", "is", null),
    )
    .select([
      "i.id",
      "i.item_type",
      "i.title_snapshot",
      "i.unit_price",
      "c.id as course_id",
      "c.slug as course_slug",
      "c.unlisted as course_unlisted",
      "c.thumbnail_url as course_thumbnail_url",
      "cs.welcome_message as course_welcome_message",
      "cs.welcome_link_label as course_welcome_link_label",
      "cs.welcome_link_url as course_welcome_link_url",
      "w.id as workshop_id",
      "w.slug as workshop_slug",
      "w.cover_url as workshop_cover_url",
      "w.welcome_message as workshop_welcome_message",
      "w.welcome_link_label as workshop_welcome_link_label",
      "w.welcome_link_url as workshop_welcome_link_url",
    ])
    .where("i.order_id", "=", orderId)
    .orderBy("i.created_at", "asc")
    .orderBy("i.id", "asc")
    .execute();
}
export type ConfirmationItemRow = Awaited<
  ReturnType<typeof listConfirmationItems>
>[number];

/**
 * The course an unlisted course opens (its first link), as purchase
 * history names it: an unlisted course has no page of its own.
 */
export async function listOpenedCourses(
  database: Executor,
  unlistedCourseIds: readonly string[],
) {
  if (unlistedCourseIds.length === 0) return [];
  return await database
    .selectFrom("course_links as l")
    .innerJoin("courses as c", "c.id", "l.linked_course_id")
    .leftJoin("course_settings as cs", "cs.course_id", "c.id")
    .distinctOn("l.course_id")
    .select([
      "l.course_id as from_course_id",
      "c.id",
      "c.slug",
      "c.thumbnail_url",
      "cs.welcome_message",
      "cs.welcome_link_label",
      "cs.welcome_link_url",
    ])
    .where("l.course_id", "in", unlistedCourseIds)
    .where("c.deleted_at", "is", null)
    .orderBy("l.course_id")
    .orderBy("l.position", "asc")
    .orderBy("l.created_at", "asc")
    .execute();
}

/** Each workshop's next session still to end (or none). */
export async function listNextSessions(
  database: Executor,
  workshopIds: readonly string[],
  now: Date,
) {
  if (workshopIds.length === 0) return [];
  return await database
    .selectFrom("workshop_sessions")
    .distinctOn("workshop_id")
    .select(["workshop_id", "starts_at", "ends_at", "time_zone"])
    .where("workshop_id", "in", workshopIds)
    .where("ends_at", ">", now)
    .orderBy("workshop_id")
    .orderBy("starts_at", "asc")
    .execute();
}

/** What has been refunded of an order so far. */
export async function sumProcessedRefunds(
  database: Executor,
  orderId: string,
): Promise<number> {
  const row = await database
    .selectFrom("refunds")
    .select((eb) => eb.fn.sum<string | number | null>("amount").as("total"))
    .where("order_id", "=", orderId)
    .where("status", "=", "processed")
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

/** The buyer's name and email, for the greeting and the email hint. */
export async function findBuyer(database: Executor, userId: string) {
  return await database
    .selectFrom("users")
    .select(["display_name", "username", "email"])
    .where("id", "=", userId)
    .executeTakeFirst();
}
