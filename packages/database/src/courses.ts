import type { CourseSummary, PublicCourse } from "@veolms/contracts";
import type { Kysely } from "kysely";

import type { Database } from "./schema.ts";

export async function listPublishedCourses(
  database: Kysely<Database>,
): Promise<CourseSummary[]> {
  const rows = await database
    .selectFrom("courses")
    .select(["id", "slug", "title", "short_description"])
    .where("status", "=", "published")
    .orderBy("created_at", "asc")
    .execute();

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
): Promise<PublicCourse | undefined> {
  const row = await database
    .selectFrom("courses")
    .select(["id", "slug", "title", "short_description", "description"])
    .where("slug", "=", slug)
    .where("status", "=", "published")
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
