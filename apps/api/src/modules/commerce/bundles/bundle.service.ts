import crypto from "node:crypto";
import {
  BUNDLE_OFFERS_PER_COURSE,
  type CourseBundleOffer,
} from "@veolms/contracts";
import type {
  CourseBundle,
  BundleItem,
  CreateBundleRequest,
  UpdateBundleRequest,
} from "@veolms/contracts";
import { cacheTags, createCache, invalidateCache } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { AppError } from "../../../lib/errors.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import { isUniqueViolation } from "../shared/db-errors.ts";
import * as bundleRepo from "./bundle.repository.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import * as courseConfigRepo from "../../courses/configuration/configuration.repository.ts";
import * as enrollmentRepo from "../enrollments/enrollment.repository.ts";
import { resolveCoursePricing } from "../pricing/purchasable.ts";
import { bundleCharge, bundleSaves } from "./bundle-pricing.ts";

/**
 * Published bundles as every visitor sees them (the list, and each by its
 * slug). A bundle write clears them (`bundles`); a course change clears
 * them too (`catalog`), since a bundle shows its courses.
 */
const BUNDLES_TAG = "bundles";
const PUBLISHED_BUNDLES_TTL_MS = 5 * 60_000;
const publishedBundleList = createCache<CourseBundle[]>({
  name: "commerce.published-bundle-list",
  ttlMs: PUBLISHED_BUNDLES_TTL_MS,
  maxBytes: 4 * 1024 * 1024,
});
const publishedBundlesBySlug = createCache<CourseBundle>({
  name: "commerce.published-bundles-by-slug",
  ttlMs: PUBLISHED_BUNDLES_TTL_MS,
  maxEntries: 1_000,
  maxBytes: 4 * 1024 * 1024,
});
const PUBLISHED_BUNDLE_TAGS = [BUNDLES_TAG, cacheTags.catalog, cacheTags.site];

export interface BundleService {
  listPublishedBundles(): Promise<CourseBundle[]>;
  getBundleBySlug(slug: string): Promise<CourseBundle>;
  listAllBundles(): Promise<CourseBundle[]>;
  getBundleById(id: string): Promise<CourseBundle>;
  createBundle(request: CreateBundleRequest): Promise<CourseBundle>;
  updateBundle(id: string, request: UpdateBundleRequest): Promise<CourseBundle>;
  deleteBundle(id: string): Promise<void>;
  listOffersForCourse(
    courseId: string,
    viewerId: string | null,
  ): Promise<CourseBundleOffer[]>;
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
    return await publishedBundleList.fetch(
      "list",
      async () => {
        const bundles = await bundleRepo.listPublishedBundles(database);
        return await hydrateBundles(bundles, { publishedCoursesOnly: true });
      },
      { tags: PUBLISHED_BUNDLE_TAGS },
    );
  }

  async function getBundleBySlug(slug: string): Promise<CourseBundle> {
    // An unknown or unpublished slug throws, and is not kept.
    return await publishedBundlesBySlug.fetch(
      slug,
      async () => {
        const bundle = await bundleRepo.findBundleBySlug(database, slug);
        if (!bundle || bundle.status !== "published") {
          throw CommerceErrors.BUNDLE_NOT_FOUND(slug);
        }
        return await hydrateBundle(bundle, { publishedCoursesOnly: true });
      },
      { tags: PUBLISHED_BUNDLE_TAGS },
    );
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

  /**
   * A slug stays taken after its bundle is deleted (the row is kept), and
   * two requests can pass the slug check at once. Both reach the unique
   * index, and both are the same refusal the check gives. Only the slug's
   * own index: any other unique violation is not about the slug, and is left
   * for the error handler's general answer.
   */
  function slugTakenOr(error: unknown, slug: string): unknown {
    if (!isUniqueViolation(error, "course_bundles_slug_key")) return error;
    return new AppError(
      409,
      "BUNDLE_SLUG_EXISTS",
      `A bundle with slug "${slug}" already exists.`,
    );
  }

  /** Today's price of each course, in whole rupees (0 for a free one). */
  async function coursePrices(courseIds: readonly string[]) {
    const rows = await courseConfigRepo.findPricingByCourseIds(database, [
      ...courseIds,
    ]);
    const byId = new Map(rows.map((row) => [row.course_id, row]));
    return new Map(
      courseIds.map((id) => [
        id,
        resolveCoursePricing(byId.get(id)).catalogPrice,
      ]),
    );
  }

  /**
   * A bundle must hold two courses or more and cost less than they do
   * apart, at today's prices: the "You save" a buyer is shown comes from
   * the same numbers.
   */
  async function assertSaves(courseIds: readonly string[], price: number) {
    if (courseIds.length < 2) {
      throw new AppError(
        400,
        "BUNDLE_TOO_SMALL",
        "A bundle needs at least two courses.",
      );
    }
    const prices = await coursePrices(courseIds);
    const courses = courseIds.map((courseId) => ({
      courseId,
      price: prices.get(courseId) ?? 0,
    }));
    if (!bundleSaves({ bundlePrice: price, courses })) {
      const apart = courses.reduce((sum, course) => sum + course.price, 0);
      throw new AppError(
        400,
        "BUNDLE_NO_SAVING",
        `The bundle must cost less than its courses bought apart (₹${apart.toLocaleString("en-IN")}).`,
      );
    }
  }

  async function listOffersForCourse(
    courseId: string,
    viewerId: string | null,
  ): Promise<CourseBundleOffer[]> {
    const bundles = await bundleRepo.listPublishedBundlesForCourse(
      database,
      courseId,
    );
    if (bundles.length === 0) return [];
    const [items, owned] = await Promise.all([
      bundleRepo.listBundleCoursesForBundleIds(
        database,
        bundles.map((bundle) => bundle.id),
      ),
      viewerId
        ? enrollmentRepo
            .listUserEnrolledCourseIds(database, viewerId)
            .then((ids) => new Set(ids))
        : Promise.resolve(new Set<string>()),
    ]);
    const prices = await coursePrices([
      ...new Set(items.map((item) => item.course_id)),
    ]);

    const offers: CourseBundleOffer[] = [];
    for (const bundle of bundles) {
      const courses = items.filter((item) => item.bundle_id === bundle.id);
      // Offered only while every course in it is on sale for a price, and
      // it still saves money at today's prices.
      if (
        courses.length < 2 ||
        courses.some(
          (course) =>
            course.course_status !== "published" ||
            (prices.get(course.course_id) ?? 0) <= 0,
        )
      ) {
        continue;
      }
      const atPrice = courses.map((course) => ({
        courseId: course.course_id,
        price: prices.get(course.course_id) ?? 0,
      }));
      if (!bundleSaves({ bundlePrice: bundle.price, courses: atPrice })) {
        continue;
      }
      const charge = bundleCharge({
        bundlePrice: bundle.price,
        courses: atPrice,
        ownedCourseIds: owned,
      });
      // Nothing left to buy, or nothing saved on what is left.
      if (charge.ownsAll || charge.saving <= 0) continue;
      offers.push({
        id: bundle.id,
        slug: bundle.slug,
        title: bundle.title,
        price: bundle.price,
        apart: charge.apart,
        charge: charge.charge,
        saving: charge.saving,
        currency: bundle.currency ?? "INR",
        courses: courses.map((course) => ({
          id: course.course_id,
          title: course.course_title,
          slug: course.course_slug,
          price: prices.get(course.course_id) ?? 0,
          owned: owned.has(course.course_id),
        })),
      });
      if (offers.length === BUNDLE_OFFERS_PER_COURSE) break;
    }
    return offers;
  }

  async function createBundle(
    request: CreateBundleRequest,
  ): Promise<CourseBundle> {
    const normalizedSlug = request.slug.toLowerCase().trim();
    // A course named twice is still one course in the bundle.
    const courseIds = [...new Set(request.courseIds)];
    await assertSaves(courseIds, request.price);
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
    for (const courseId of courseIds) {
      const course = await courseRepo.findCourseById(database, courseId);
      if (!course) {
        throw CommerceErrors.COURSE_NOT_FOUND(courseId);
      }
    }

    const bundleId = crypto.randomUUID();
    const now = new Date();

    const created = await database
      .transaction()
      .execute(async (trx) => {
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

        for (const courseId of courseIds) {
          await bundleRepo.insertBundleItem(trx, {
            id: crypto.randomUUID(),
            bundle_id: bundleId,
            course_id: courseId,
            created_at: now,
          });
        }

        return bundle;
      })
      .catch((error: unknown) => {
        throw slugTakenOr(error, request.slug);
      });

    invalidateCache([BUNDLES_TAG]);
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

    const courseIds = request.courseIds
      ? [...new Set(request.courseIds)]
      : undefined;
    if (courseIds) {
      for (const courseId of courseIds) {
        const course = await courseRepo.findCourseById(database, courseId);
        if (!course) {
          throw CommerceErrors.COURSE_NOT_FOUND(courseId);
        }
      }
    }
    if (courseIds || request.price !== undefined) {
      await assertSaves(
        courseIds ??
          (await bundleRepo.listBundleCourses(database, id)).map(
            (row) => row.course_id,
          ),
        request.price ?? existing.price,
      );
    }

    const now = new Date();

    const updated = await database
      .transaction()
      .execute(async (trx) => {
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

        if (courseIds) {
          await bundleRepo.deleteBundleItems(trx, id);
          for (const courseId of courseIds) {
            await bundleRepo.insertBundleItem(trx, {
              id: crypto.randomUUID(),
              bundle_id: id,
              course_id: courseId,
              created_at: now,
            });
          }
        }

        return bundle;
      })
      .catch((error: unknown) => {
        throw slugTakenOr(error, request.slug ?? existing.slug);
      });

    if (!updated) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }

    invalidateCache([BUNDLES_TAG]);
    return await hydrateBundle(updated);
  }

  async function deleteBundle(id: string): Promise<void> {
    const existing = await bundleRepo.findBundleById(database, id);
    if (!existing) {
      throw CommerceErrors.BUNDLE_NOT_FOUND(id);
    }

    await bundleRepo.softDeleteBundle(database, id);
    invalidateCache([BUNDLES_TAG]);
  }

  return {
    listPublishedBundles,
    getBundleBySlug,
    listAllBundles,
    getBundleById,
    createBundle,
    updateBundle,
    deleteBundle,
    listOffersForCourse,
  };
}
