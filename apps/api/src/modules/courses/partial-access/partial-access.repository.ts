import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

/**
 * The unlisted courses that open part (or all) of a course, oldest first,
 * with their link's sections, their price and how many learners and orders
 * they have.
 */
export async function listPartialAccessCourses(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.course_id")
    .leftJoin("course_pricing as p", "p.course_id", "c.id")
    .select([
      "c.id",
      "c.title",
      "c.slug",
      "c.status",
      "cl.section_ids",
      "p.price",
      "p.sale_price",
      "p.currency",
    ])
    .select((eb) => [
      eb
        .selectFrom("access_grants as g")
        .select(sql<string>`count(*)`.as("count"))
        .whereRef("g.course_id", "=", "c.id")
        .where("g.status", "=", "active")
        .where((inner) =>
          inner.or([
            inner("g.valid_until", "is", null),
            inner("g.valid_until", ">", new Date()),
          ]),
        )
        .as("learner_count"),
      eb
        .selectFrom("order_items as oi")
        .select(sql<string>`count(distinct oi.order_id)`.as("count"))
        .whereRef("oi.course_id", "=", "c.id")
        .as("order_count"),
    ])
    .where("cl.linked_course_id", "=", courseId)
    .where("c.unlisted", "=", true)
    .where("c.deleted_at", "is", null)
    .orderBy("cl.created_at", "asc")
    .orderBy("c.id", "asc")
    .execute();
}

/** The course's live sections, in course order. */
export async function listSections(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_sections")
    .select(["id", "title"])
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .orderBy("id", "asc")
    .execute();
}

/** The course's live section ids, in course order. */
export async function listSectionIds(
  database: DatabaseExecutor,
  courseId: string,
): Promise<string[]> {
  const rows = await listSections(database, courseId);
  return rows.map((row) => row.id);
}

/** What a course sells for now (its selling price), with its currency. */
export async function findSellingPrice(
  database: DatabaseExecutor,
  courseId: string,
) {
  const row = await database
    .selectFrom("course_pricing")
    .select(["price", "sale_price", "currency"])
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  return {
    amount: Number(row?.sale_price ?? row?.price ?? 0),
    currency: row?.currency ?? "INR",
  };
}

/**
 * Every partial access with the course it opens part of, for a coupon to
 * name; only those of `creatorId`'s courses when one is given.
 */
export async function listAllPartialAccess(
  database: DatabaseExecutor,
  creatorId?: string,
) {
  let query = database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.course_id")
    .innerJoin("courses as whole", "whole.id", "cl.linked_course_id")
    .select(["c.id", "c.title", "whole.title as course_title"])
    .where("c.unlisted", "=", true)
    .where("c.deleted_at", "is", null)
    .where("whole.deleted_at", "is", null);
  if (creatorId) query = query.where("c.creator_id", "=", creatorId);
  return await query
    .orderBy("whole.title", "asc")
    .orderBy("c.title", "asc")
    .execute();
}

/** A published course, by id or slug. */
export async function findPublishedCourseByIdOrSlug(
  database: DatabaseExecutor,
  idOrSlug: string,
) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrSlug,
    );
  return await database
    .selectFrom("courses")
    .select(["id", "slug", "title"])
    .where(isUuid ? "id" : "slug", "=", idOrSlug)
    .where("status", "=", "published")
    .where("unlisted", "=", false)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

/** The unlisted course with this slug that opens part of `courseId`. */
export async function findOfferBySlug(
  database: DatabaseExecutor,
  courseId: string,
  offerSlug: string,
) {
  return await database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.course_id")
    .leftJoin("course_pricing as p", "p.course_id", "c.id")
    .select([
      "c.id",
      "c.slug",
      "c.title",
      "c.status",
      "cl.section_ids",
      "p.price",
      "p.sale_price",
      "p.currency",
    ])
    .where("cl.linked_course_id", "=", courseId)
    .where("c.slug", "=", offerSlug)
    .where("c.unlisted", "=", true)
    .where("c.deleted_at", "is", null)
    .executeTakeFirst();
}

/**
 * Puts an unlisted course on sale (published: checkout sells it) or takes
 * it off (a draft). It is never listed either way.
 */
export async function setOnSale(
  database: DatabaseExecutor,
  courseId: string,
  onSale: boolean,
) {
  await database
    .updateTable("courses")
    .set({
      status: onSale ? "published" : "draft",
      published_at: onSale
        ? sql<Date>`coalesce(published_at, now())`
        : undefined,
      updated_at: new Date(),
    })
    .where("id", "=", courseId)
    .where("unlisted", "=", true)
    .execute();
}

/** The unlisted course `partialCourseId`, when it opens part of `courseId`. */
export async function findPartialAccessLink(
  database: DatabaseExecutor,
  courseId: string,
  partialCourseId: string,
) {
  return await database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.course_id")
    .select(["c.id", "c.title", "cl.section_ids"])
    .where("cl.course_id", "=", partialCourseId)
    .where("cl.linked_course_id", "=", courseId)
    .where("c.unlisted", "=", true)
    .where("c.deleted_at", "is", null)
    .executeTakeFirst();
}

export async function insertUnlistedCourse(
  database: DatabaseExecutor,
  values: {
    id: string;
    slug: string;
    title: string;
    creator_id: string | null;
    created_at: Date;
  },
) {
  await database
    .insertInto("courses")
    .values({
      ...values,
      status: "draft",
      unlisted: true,
      version: 1,
      updated_at: values.created_at,
    })
    .execute();
}

export async function updateCourseTitle(
  database: DatabaseExecutor,
  courseId: string,
  title: string,
) {
  await database
    .updateTable("courses")
    .set({ title, updated_at: new Date() })
    .where("id", "=", courseId)
    .execute();
}

export async function insertPartialAccessLink(
  database: DatabaseExecutor,
  partialCourseId: string,
  courseId: string,
  sectionIds: string[],
) {
  await database
    .insertInto("course_links")
    .values({
      course_id: partialCourseId,
      linked_course_id: courseId,
      position: 0,
      section_ids: sectionIds,
    })
    .execute();
}

export async function updatePartialAccessSections(
  database: DatabaseExecutor,
  partialCourseId: string,
  courseId: string,
  sectionIds: string[],
) {
  await database
    .updateTable("course_links")
    .set({ section_ids: sectionIds })
    .where("course_id", "=", partialCourseId)
    .where("linked_course_id", "=", courseId)
    .execute();
}

/** Whether anyone holds, or ever held, the course, or an order names it. */
export async function hasLearnersOrOrders(
  database: DatabaseExecutor,
  courseId: string,
): Promise<boolean> {
  const row = await database
    .selectNoFrom((eb) => [
      eb
        .exists(
          eb
            .selectFrom("access_grants")
            .select("id")
            .where("course_id", "=", courseId),
        )
        .as("granted"),
      eb
        .exists(
          eb
            .selectFrom("enrollments")
            .select("id")
            .where("course_id", "=", courseId),
        )
        .as("enrolled"),
      eb
        .exists(
          eb
            .selectFrom("order_items")
            .select("id")
            .where("course_id", "=", courseId),
        )
        .as("ordered"),
    ])
    .executeTakeFirstOrThrow();
  return Boolean(row.granted || row.enrolled || row.ordered);
}

/** Erases an unlisted course nobody holds; its pricing and link go with it. */
export async function deleteUnlistedCourse(
  database: DatabaseExecutor,
  courseId: string,
) {
  await database
    .deleteFrom("courses")
    .where("id", "=", courseId)
    .where("unlisted", "=", true)
    .execute();
}
