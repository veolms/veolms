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

type BundleRow = NonNullable<
  Awaited<ReturnType<typeof bundleRepo.findBundleById>>
>;

export function createBundleService({
  database,
}: {
  database: Kysely<Database>;
}): BundleService {
  /**
   * Attaches each bundle's courses with one query for the whole set. The
   * public endpoints pass `publishedCoursesOnly`: a published bundle may
   * still hold a draft or archived course, and those must not be named to
   * visitors.
   */
  async function hydrateBundles(
    bundles: BundleRow[],
    options: { publishedCoursesOnly?: boolean } = {},
  ): Promise<CourseBundle[]> {
    const courseItems = await bundleRepo.listBundleCoursesForBundleIds(
      database,
      bundles.map((bundle) => bundle.id),
    );
    const itemsByBundleId = new Map<string, BundleItem[]>();
    for (const c of courseItems) {
      if (options.publishedCoursesOnly && c.course_status !== "published") {
        continue;
      }
      const items = itemsByBundleId.get(c.bundle_id) ?? [];
      items.push({
        id: c.item_id,
        bundleId: c.bundle_id,
        courseId: c.course_id,
        courseTitle: c.course_title,
        courseSlug: c.course_slug,
        courseThumbnailMediaId: c.course_thumbnail_media_id,
        createdAt: c.created_at,
      });
      itemsByBundleId.set(c.bundle_id, items);
    }

    return bundles.map((bundle) => ({
      id: bundle.id,
      slug: bundle.slug,
      title: bundle.title,
      description: bundle.description,
      thumbnailMediaId: bundle.thumbnail_media_id,
      status: bundle.status,
      price: bundle.price,
      currency: bundle.currency,
      items: itemsByBundleId.get(bundle.id) ?? [],
      createdAt: bundle.created_at,
      updatedAt: bundle.updated_at,
    }));
  }

  async function hydrateBundle(
    bundle: BundleRow,
    options: { publishedCoursesOnly?: boolean } = {},
  ): Promise<CourseBundle> {
    const [hydrated] = await hydrateBundles([bundle], options);
    return hydrated!;
  }

  async function listPublishedBundles(): Promise<CourseBundle[]> {
    const bundles = await bundleRepo.listPublishedBundles(database);
    return await hydrateBundles(bundles, { publishedCoursesOnly: true });
  }

  async function getBundleBySlug(slug: string): Promise<CourseBundle> {
    const bundle = await bundleRepo.findBundleBySlug(database, slug);
    if (!bundle || bundle.status !== "published") {
      throw CommerceErrors.BUNDLE_NOT_FOUND(slug);
    }
    return await hydrateBundle(bundle, { publishedCoursesOnly: true });
  }

  async function listAllBundles(): Promise<CourseBundle[]> {
    const bundles = await bundleRepo.listAllBundles(database);
    return await hydrateBundles(bundles);
  }

  async function getBundleById(id: string): Promise<CourseBundle> {
    const bundle = await bundleRepo.findBundleById(database, id);
    if (!bundle) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }
    return await hydrateBundle(bundle);
  }

  async function createBundle(
    request: CreateBundleRequest,
  ): Promise<CourseBundle> {
    const normalizedSlug = request.slug.toLowerCase().trim();
    const existing = await bundleRepo.findBundleBySlug(
      database,
      normalizedSlug,
    );
    if (existing) {
      throw new AppError(
        409,
        "BUNDLE_SLUG_EXISTS",
        `A bundle with slug "${request.slug}" already exists.`,
      );
    }

    // Verify all courses exist
    for (const courseId of request.courseIds) {
      const course = await courseRepo.findCourseById(database, courseId);
      if (!course) {
        throw CommerceErrors.COURSE_NOT_FOUND(courseId);
      }
    }

    const bundleId = crypto.randomUUID();
    const now = new Date();

    const created = await database.transaction().execute(async (trx) => {
      const bundle = await bundleRepo.insertBundle(trx, {
        id: bundleId,
        slug: normalizedSlug,
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

    if (request.slug) {
      const normalizedSlug = request.slug.toLowerCase().trim();
      if (normalizedSlug !== existing.slug) {
        const slugMatch = await bundleRepo.findBundleBySlug(
          database,
          normalizedSlug,
        );
        if (slugMatch && slugMatch.id !== id) {
          throw new AppError(
            409,
            "BUNDLE_SLUG_EXISTS",
            `A bundle with slug "${request.slug}" already exists.`,
          );
        }
      }
    }

    if (request.courseIds) {
      for (const courseId of request.courseIds) {
        const course = await courseRepo.findCourseById(database, courseId);
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

    if (!updated) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }

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
