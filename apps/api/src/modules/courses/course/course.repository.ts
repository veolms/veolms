import { sql, type Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "@veolms/database";

export async function insertCourse(
  database: Kysely<Database>,
  values: {
    id: string;
    slug: string;
    title: string;
    short_description?: string | null;
    description?: string | null;
    status: "draft";
    creator_id: string;
    category_id?: string | null;
    difficulty?: "beginner" | "intermediate" | "advanced" | null;
    thumbnail_media_id?: string | null;
    trailer_media_id?: string | null;
    instructor_alias?: string | null;
    version: number;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("courses").values(values).execute();
}

export async function findCourseById(
  // Accepts a transaction too (not just Kysely<Database>) so cross-module
  // callers — e.g. commerce's pricing/cart/bundle services, whose own
  // `Executor` type is Kysely<Database> | Transaction<Database> — can call
  // this from inside their own transaction without an `as any` cast.
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("courses")
    .selectAll()
    .where("id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

/**
 * Batched sibling of findCourseById — same filters (no status filter; the
 * caller checks `status` itself), but one `WHERE id IN (...)` query instead
 * of N sequential ones. Used by pricing.service.ts's calculatePricing, which
 * runs on every GET /cart, checkout preview, and order-creation call.
 */
export async function findCoursesByIds(database: DatabaseExecutor, courseIds: string[]) {
  if (courseIds.length === 0) return [];
  return await database
    .selectFrom("courses")
    .selectAll()
    .where("id", "in", courseIds)
    .where("deleted_at", "is", null)
    .execute();
}

export async function findCourseBySlug(
  database: Kysely<Database>,
  slug: string,
) {
  return await database
    .selectFrom("courses")
    .selectAll()
    .where("slug", "=", slug)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

/**
 * Looks up a slug reservation, including courses in the recovery bin. The
 * database keeps slugs globally unique so a course can be restored with its
 * original public URL during the retention window.
 */
export async function findCourseBySlugIncludingDeleted(
  database: Kysely<Database>,
  slug: string,
) {
  return await database
    .selectFrom("courses")
    .select(["id"])
    .where("slug", "=", slug)
    .executeTakeFirst();
}

export async function listPublishedCourses(
  database: Kysely<Database>,
  filters?: { creatorId?: string },
) {
  let query = database
    .selectFrom("courses")
    .leftJoin("categories", (join) =>
      join
        .onRef("categories.id", "=", "courses.category_id")
        .on("categories.deleted_at", "is", null),
    )
    .leftJoin("users", (join) =>
      join
        .onRef("users.id", "=", "courses.creator_id")
        .on("users.is_deleted", "=", false),
    )
    .leftJoin("course_pricing", "course_pricing.course_id", "courses.id")
    .leftJoin("course_settings", "course_settings.course_id", "courses.id")
    .select((eb) => [
      "courses.id",
      "courses.slug",
      "courses.title",
      "courses.short_description",
      "courses.difficulty",
      "courses.instructor_alias",
      "courses.thumbnail_media_id",
      "categories.name as category_name",
      "users.display_name as creator_display_name",
      "course_pricing.pricing_type",
      "course_pricing.price",
      "course_pricing.currency",
      "course_pricing.sale_price",
      "course_settings.certificate_enabled",
      "course_settings.estimated_duration",
      eb
        .selectFrom("course_sections")
        .select((sub) => sub.fn.count("id").as("count"))
        .whereRef("course_sections.course_id", "=", "courses.id")
        .where("course_sections.deleted_at", "is", null)
        .as("total_sections"),
      eb
        .selectFrom("course_lessons")
        .select((sub) => sub.fn.count("id").as("count"))
        .whereRef("course_lessons.course_id", "=", "courses.id")
        .where("course_lessons.is_published", "=", true)
        .where("course_lessons.deleted_at", "is", null)
        .as("total_lessons"),
      eb
        .selectFrom("course_lessons")
        .leftJoin(
          "media_assets as lesson_media",
          "lesson_media.id",
          "course_lessons.content_media_id",
        )
        .select((sub) =>
          sub.fn
            .coalesce(
              sub.fn.sum("lesson_media.duration_seconds"),
              sql<number>`0`,
            )
            .as("sum"),
        )
        .whereRef("course_lessons.course_id", "=", "courses.id")
        .where("course_lessons.is_published", "=", true)
        .where("course_lessons.deleted_at", "is", null)
        .as("lesson_duration_seconds"),
    ])
    .where("courses.status", "=", "published")
    .where("courses.deleted_at", "is", null);

  if (filters?.creatorId) {
    query = query.where("courses.creator_id", "=", filters.creatorId);
  }

  return await query.orderBy("courses.created_at", "asc").execute();
}

export async function findPublishedCourseBySlug(
  database: Kysely<Database>,
  slug: string,
) {
  const row = await database
    .selectFrom("courses")
    .select([
      "id",
      "slug",
      "title",
      "short_description",
      "description",
      "status",
      "creator_id",
    ])
    .where("slug", "=", slug)
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
  };
}

export async function listCoursesByCreator(
  database: Kysely<Database>,
  creatorId: string,
) {
  return await database
    .selectFrom("courses")
    .leftJoin("course_settings", "course_settings.course_id", "courses.id")
    .select((eb) => [
      "courses.id",
      "courses.slug",
      "courses.title",
      "courses.short_description",
      "courses.description",
      "courses.difficulty",
      "courses.status",
      "courses.creator_id",
      "courses.category_id",
      "courses.thumbnail_media_id",
      "courses.trailer_media_id",
      "courses.instructor_alias",
      "courses.version",
      "courses.created_at",
      "courses.updated_at",
      "courses.published_at",
      "course_settings.estimated_duration",
      eb
        .selectFrom("course_sections")
        .select((sub) => sub.fn.count("id").as("count"))
        .whereRef("course_sections.course_id", "=", "courses.id")
        .where("course_sections.deleted_at", "is", null)
        .as("total_sections"),
      eb
        .selectFrom("course_lessons")
        .select((sub) => sub.fn.count("id").as("count"))
        .whereRef("course_lessons.course_id", "=", "courses.id")
        .where("course_lessons.deleted_at", "is", null)
        .as("total_lessons"),
      eb
        .selectFrom("course_lessons")
        .leftJoin(
          "media_assets as lesson_media",
          "lesson_media.id",
          "course_lessons.content_media_id",
        )
        .select((sub) =>
          sub.fn
            .coalesce(
              sub.fn.sum("lesson_media.duration_seconds"),
              sql<number>`0`,
            )
            .as("sum"),
        )
        .whereRef("course_lessons.course_id", "=", "courses.id")
        .where("course_lessons.deleted_at", "is", null)
        .as("lesson_duration_seconds"),
    ])
    .where("courses.creator_id", "=", creatorId)
    .where("courses.deleted_at", "is", null)
    .orderBy("courses.created_at", "desc")
    .execute();
}

export async function listAvailableCoursesByCreator(
  database: Kysely<Database>,
  creatorId: string,
) {
  return await database
    .selectFrom("courses")
    .selectAll()
    .where("creator_id", "=", creatorId)
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .orderBy("created_at", "desc")
    .execute();
}

export async function updateCourse(
  database: Kysely<Database>,
  courseId: string,
  version: number,
  updates: {
    title?: string;
    short_description?: string | null;
    description?: string | null;
    category_id?: string | null;
    difficulty?: "beginner" | "intermediate" | "advanced" | null;
    thumbnail_media_id?: string | null;
    trailer_media_id?: string | null;
    instructor_alias?: string | null;
    status?: "draft" | "published" | "archived";
    published_at?: Date | null;
    version: number;
    updated_at: Date;
  },
) {
  return await database
    .updateTable("courses")
    .set(updates)
    .where("id", "=", courseId)
    .where("version", "=", version)
    .executeTakeFirst();
}

export async function softDeleteCourse(
  database: Kysely<Database>,
  courseId: string,
  now: Date,
) {
  return await database
    .updateTable("courses")
    .set({
      deleted_at: now,
      updated_at: now,
      version: sql<number>`version + 1`,
    })
    .where("id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}
