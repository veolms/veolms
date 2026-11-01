import {
  WISHLIST_MAX_ITEMS,
  type ImportWishlistRequest,
  type WishlistResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import { createCourseService } from "../courses/index.ts";
import * as wishlistRepository from "./wishlist.repository.ts";

type CourseService = Pick<
  ReturnType<typeof createCourseService>,
  "listPublishedCourseRefs"
>;

/**
 * A learner's saved courses. Every operation takes the learner's own id from
 * the session, so one learner's list cannot be read or changed by another.
 */
export function createWishlistService({
  database,
  services,
  courseService = createCourseService({ database, services }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  courseService?: CourseService;
}) {
  /**
   * Only the saved courses that are published now. The others keep their
   * row, so they are back in the list when the course is published again.
   */
  async function list(userId: string): Promise<WishlistResponse> {
    const rows = await wishlistRepository.listItems(database, userId);
    const published = await courseService.listPublishedCourseRefs(
      rows.map((row) => row.course_id),
    );
    const slugById = new Map(published.map((ref) => [ref.id, ref.slug]));

    return {
      items: rows.flatMap((row) => {
        const courseSlug = slugById.get(row.course_id);
        return courseSlug === undefined
          ? []
          : [
              {
                courseId: row.course_id,
                courseSlug,
                addedAt: row.created_at.toISOString(),
              },
            ];
      }),
    };
  }

  /**
   * How many of the saved courses the learner can see. The limit is counted
   * against these: a course that was unpublished since is hidden from the
   * list, and the learner has no way to remove it to make room.
   */
  async function countListed(
    rows: readonly { course_id: string }[],
  ): Promise<number> {
    if (rows.length < WISHLIST_MAX_ITEMS) return rows.length;
    const published = await courseService.listPublishedCourseRefs(
      rows.map((row) => row.course_id),
    );
    return published.length;
  }

  async function add(
    userId: string,
    courseId: string,
  ): Promise<WishlistResponse> {
    // A draft, an archived or a deleted course answers as one that does not
    // exist: a learner is not told which unpublished courses there are.
    const [course] = await courseService.listPublishedCourseRefs([courseId]);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    await database.transaction().execute(async (trx) => {
      await wishlistRepository.lockWishlist(trx, userId);
      const rows = await wishlistRepository.listItems(trx, userId);
      if (rows.some((row) => row.course_id === course.id)) return;
      if ((await countListed(rows)) >= WISHLIST_MAX_ITEMS) {
        throw new AppError(
          409,
          "WISHLIST_FULL",
          `A wishlist holds ${WISHLIST_MAX_ITEMS} courses at most. Remove one to save another.`,
        );
      }
      await wishlistRepository.insertItems(trx, userId, [course.id]);
    });
    return await list(userId);
  }

  async function remove(
    userId: string,
    courseId: string,
  ): Promise<WishlistResponse> {
    await wishlistRepository.deleteItem(database, userId, courseId);
    return await list(userId);
  }

  /**
   * Adds the courses a browser had saved. What is not a published course is
   * ignored, and so is what would take the list past its limit.
   */
  async function importFromBrowser(
    userId: string,
    payload: ImportWishlistRequest,
  ): Promise<WishlistResponse> {
    const wanted = [...new Set(payload.courses)];
    const published = await courseService.listPublishedCourseRefs(wanted);
    // In the order the browser sent them, so that when only some fit it is
    // the first ones that are kept.
    const position = new Map(wanted.map((value, index) => [value, index]));
    const placeOf = (ref: { id: string; slug: string }) =>
      Math.min(
        position.get(ref.id) ?? Number.MAX_SAFE_INTEGER,
        position.get(ref.slug) ?? Number.MAX_SAFE_INTEGER,
      );
    const ordered = [...published].sort((a, b) => placeOf(a) - placeOf(b));

    await database.transaction().execute(async (trx) => {
      await wishlistRepository.lockWishlist(trx, userId);
      const rows = await wishlistRepository.listItems(trx, userId);
      const saved = new Set(rows.map((row) => row.course_id));
      const room = Math.max(0, WISHLIST_MAX_ITEMS - (await countListed(rows)));
      await wishlistRepository.insertItems(
        trx,
        userId,
        ordered
          .map((ref) => ref.id)
          .filter((courseId) => !saved.has(courseId))
          .slice(0, room),
      );
    });
    return await list(userId);
  }

  return { list, add, remove, importFromBrowser };
}

export type WishlistService = ReturnType<typeof createWishlistService>;
