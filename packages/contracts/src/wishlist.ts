import { z } from "zod";

/**
 * A learner's wishlist: the published courses they have saved for later.
 *
 * It belongs to the signed-in learner; nobody else can read or change it. A
 * saved course that is no longer published is left out of the list (and is
 * back in it if the course is published again).
 */

/** The most courses one learner can save. */
export const WISHLIST_MAX_ITEMS = 500;

/**
 * The most entries one import may carry. A browser kept two entries for a
 * saved course (its id and its slug), so this is twice the list's limit.
 */
export const WISHLIST_IMPORT_MAX_COURSES = WISHLIST_MAX_ITEMS * 2;

export const wishlistItemSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string(),
  addedAt: z.iso.datetime(),
});
export type WishlistItem = z.infer<typeof wishlistItemSchema>;

/** The whole wishlist, the course saved last first. */
export const wishlistResponseSchema = z.strictObject({
  items: z.array(wishlistItemSchema),
});
export type WishlistResponse = z.infer<typeof wishlistResponseSchema>;

export const wishlistCourseParamsSchema = z.strictObject({
  courseId: z.uuid(),
});
export type WishlistCourseParams = z.infer<typeof wishlistCourseParamsSchema>;

/**
 * Courses saved in a browser before the wishlist was kept on the server,
 * each named by its id or its slug. The ones that are published courses are
 * added; the rest are ignored.
 */
export const importWishlistRequestSchema = z.strictObject({
  courses: z
    .array(z.string().trim().min(1).max(160))
    .max(WISHLIST_IMPORT_MAX_COURSES),
});
export type ImportWishlistRequest = z.infer<typeof importWishlistRequestSchema>;
