import type { BundleStatus } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findBundleById(database: Executor, bundleId: string) {
  return await database
    .selectFrom("course_bundles")
    .selectAll()
    .where("id", "=", bundleId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findBundleBySlug(database: Executor, slug: string) {
  return await database
    .selectFrom("course_bundles")
    .selectAll()
    .where("slug", "=", slug)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function findPublishedBundleById(
  database: Executor,
  bundleId: string,
) {
  return await database
    .selectFrom("course_bundles")
    .selectAll()
    .where("id", "=", bundleId)
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function listPublishedBundles(database: Executor) {
  return await database
    .selectFrom("course_bundles")
    .selectAll()
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .orderBy("created_at", "asc")
    .execute();
}

export async function listBundleItems(database: Executor, bundleId: string) {
  return await database
    .selectFrom("course_bundle_items")
    .selectAll()
    .where("bundle_id", "=", bundleId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function listBundleCourses(database: Executor, bundleId: string) {
  return await database
    .selectFrom("course_bundle_items")
    .innerJoin("courses", "courses.id", "course_bundle_items.course_id")
    .select([
      "course_bundle_items.id as item_id",
      "course_bundle_items.bundle_id",
      "courses.id as course_id",
      "courses.title as course_title",
      "courses.slug as course_slug",
      "courses.thumbnail_media_id as course_thumbnail_media_id",
      "courses.status as course_status",
      "course_bundle_items.created_at",
    ])
    .where("course_bundle_items.bundle_id", "=", bundleId)
    .where("courses.deleted_at", "is", null)
    .orderBy("course_bundle_items.created_at", "asc")
    .execute();
}

export async function insertBundle(
  database: Executor,
  values: {
    id: string;
    slug: string;
    title: string;
    description?: string | null;
    thumbnail_media_id?: string | null;
    status: BundleStatus;
    price: number;
    currency: string;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("course_bundles")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertBundleItem(
  database: Executor,
  values: {
    id: string;
    bundle_id: string;
    course_id: string;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("course_bundle_items")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}
