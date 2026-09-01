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
    .where("deleted_at", "is", null)
    .orderBy("created_at", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description ?? "",
    totalSections: 0,
    totalLessons: 0,
    totalDurationSeconds: 0,
    pricing: { pricingType: "free", price: 0, currency: "USD", salePrice: null },
    certificateEnabled: false,
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
