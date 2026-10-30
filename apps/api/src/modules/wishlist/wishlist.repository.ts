import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

/**
 * Makes one learner's wishlist changes take turns until the transaction
 * ends, so two requests cannot both count the list and both add to it.
 */
export async function lockWishlist(
  transaction: DatabaseExecutor,
  userId: string,
) {
  await sql`select pg_advisory_xact_lock(hashtext(${`veolms:wishlist:${userId}`}))`.execute(
    transaction,
  );
}

export async function listItems(database: DatabaseExecutor, userId: string) {
  return await database
    .selectFrom("wishlist_items")
    .select(["course_id", "created_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("course_id")
    .execute();
}

/** Saving a course that is already saved leaves its row as it was. */
export async function insertItems(
  database: DatabaseExecutor,
  userId: string,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return;
  await database
    .insertInto("wishlist_items")
    .values(
      courseIds.map((courseId) => ({ user_id: userId, course_id: courseId })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

export async function deleteItem(
  database: DatabaseExecutor,
  userId: string,
  courseId: string,
) {
  await database
    .deleteFrom("wishlist_items")
    .where("user_id", "=", userId)
    .where("course_id", "=", courseId)
    .execute();
}
