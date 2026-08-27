import { type Kysely } from "kysely";
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

export async function listPublishedCourses(
  database: Kysely<Database>,
  filters?: { creatorId?: string },
) {
  let query = database
    .selectFrom("courses")
    .select([
      "id",
      "slug",
      "title",
      "short_description",
      "creator_id",
      "status",
      "created_at",
    ])
    .where("status", "=", "published")
    .where("deleted_at", "is", null);

  if (filters?.creatorId) {
    query = query.where("creator_id", "=", filters.creatorId);
  }

  const rows = await query.orderBy("created_at", "asc").execute();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description ?? "",
  }));
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
    .selectAll()
    .where("creator_id", "=", creatorId)
    .where("deleted_at", "is", null)
    .orderBy("created_at", "desc")
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
    .set({ deleted_at: now, updated_at: now })
    .where("id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}


