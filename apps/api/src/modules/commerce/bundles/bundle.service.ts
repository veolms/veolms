import crypto from "node:crypto";
import type {
  CourseBundle,
  BundleItem,
  CreateBundleRequest,
  UpdateBundleRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as bundleRepo from "./bundle.repository.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";

export interface BundleService {
  listPublishedBundles(): Promise<CourseBundle[]>;
  getBundleBySlug(slug: string): Promise<CourseBundle>;
  listAllBundles(): Promise<CourseBundle[]>;
  getBundleById(id: string): Promise<CourseBundle>;
  createBundle(request: CreateBundleRequest): Promise<CourseBundle>;
  updateBundle(id: string, request: UpdateBundleRequest): Promise<CourseBundle>;
  deleteBundle(id: string): Promise<void>;
}

export function createBundleService({
  database,
}: {
  database: Kysely<Database>;
}): BundleService {
  async function hydrateBundle(
    bundle: any,
  ): Promise<CourseBundle> {
    const courseItems = await bundleRepo.listBundleCourses(database, bundle.id);
    const items: BundleItem[] = courseItems.map((c) => ({
      id: c.item_id,
      bundleId: c.bundle_id,
      courseId: c.course_id,
      courseTitle: c.course_title,
      courseSlug: c.course_slug,
      courseThumbnailMediaId: c.course_thumbnail_media_id,
      createdAt: c.created_at,
    }));

    return {
      id: bundle.id,
      slug: bundle.slug,
      title: bundle.title,
      description: bundle.description,
      thumbnailMediaId: bundle.thumbnail_media_id,
      status: bundle.status,
      price: bundle.price,
      currency: bundle.currency,
      items,
      createdAt: bundle.created_at,
      updatedAt: bundle.updated_at,
    };
  }

  async function listPublishedBundles(): Promise<CourseBundle[]> {
    const bundles = await bundleRepo.listPublishedBundles(database);
    return await Promise.all(bundles.map(hydrateBundle));
  }

  async function getBundleBySlug(slug: string): Promise<CourseBundle> {
    const bundle = await bundleRepo.findBundleBySlug(database, slug);
    if (!bundle || bundle.status !== "published") {
      throw CommerceErrors.BUNDLE_NOT_FOUND(slug);
    }
    return await hydrateBundle(bundle);
  }

  async function listAllBundles(): Promise<CourseBundle[]> {
    const bundles = await bundleRepo.listAllBundles(database);
    return await Promise.all(bundles.map(hydrateBundle));
  }

  async function getBundleById(id: string): Promise<CourseBundle> {
    const bundle = await bundleRepo.findBundleById(database, id);
    if (!bundle) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }
    return await hydrateBundle(bundle);
  }

  async function createBundle(request: CreateBundleRequest): Promise<CourseBundle> {
    const existing = await bundleRepo.findBundleBySlug(database, request.slug);
    if (existing) {
      throw new AppError(409, "BUNDLE_SLUG_EXISTS", `A bundle with slug "${request.slug}" already exists.`);
    }

    // Verify all courses exist
    for (const courseId of request.courseIds) {
      const course = await courseRepo.findCourseById(database as any, courseId);
      if (!course) {
        throw CommerceErrors.COURSE_NOT_FOUND(courseId);
      }
    }

    const bundleId = crypto.randomUUID();
    const now = new Date();

    const created = await database.transaction().execute(async (trx) => {
      const bundle = await bundleRepo.insertBundle(trx, {
        id: bundleId,
        slug: request.slug.toLowerCase().trim(),
        title: request.title.trim(),
        description: request.description ?? null,
        thumbnail_media_id: request.thumbnailMediaId ?? null,
        status: request.status,
        price: request.price,
        currency: request.currency,
        created_at: now,
        updated_at: now,
      });

      for (const courseId of request.courseIds) {
        await bundleRepo.insertBundleItem(trx, {
          id: crypto.randomUUID(),
          bundle_id: bundleId,
          course_id: courseId,
          created_at: now,
        });
      }

      return bundle;
    });

    return await hydrateBundle(created);
  }

  async function updateBundle(
    id: string,
    request: UpdateBundleRequest,
  ): Promise<CourseBundle> {
    const existing = await bundleRepo.findBundleById(database, id);
    if (!existing) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }

    if (request.slug && request.slug !== existing.slug) {
      const slugMatch = await bundleRepo.findBundleBySlug(database, request.slug);
      if (slugMatch && slugMatch.id !== id) {
        throw new AppError(409, "BUNDLE_SLUG_EXISTS", `A bundle with slug "${request.slug}" already exists.`);
      }
    }

    if (request.courseIds) {
      for (const courseId of request.courseIds) {
        const course = await courseRepo.findCourseById(database as any, courseId);
        if (!course) {
          throw CommerceErrors.COURSE_NOT_FOUND(courseId);
        }
      }
    }

    const now = new Date();

    const updated = await database.transaction().execute(async (trx) => {
      const bundle = await bundleRepo.updateBundle(trx, id, {
        slug: request.slug?.toLowerCase().trim(),
        title: request.title?.trim(),
        description: request.description,
        thumbnail_media_id: request.thumbnailMediaId,
        status: request.status,
        price: request.price,
        currency: request.currency,
        updated_at: now,
      });

      if (request.courseIds) {
        await bundleRepo.deleteBundleItems(trx, id);
        for (const courseId of request.courseIds) {
          await bundleRepo.insertBundleItem(trx, {
            id: crypto.randomUUID(),
            bundle_id: id,
            course_id: courseId,
            created_at: now,
          });
        }
      }

      return bundle;
    });

    return await hydrateBundle(updated);
  }

  async function deleteBundle(id: string): Promise<void> {
    const existing = await bundleRepo.findBundleById(database, id);
    if (!existing) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }

    await bundleRepo.softDeleteBundle(database, id);
  }

  return {
    listPublishedBundles,
    getBundleBySlug,
    listAllBundles,
    getBundleById,
    createBundle,
    updateBundle,
    deleteBundle,
  };
}
