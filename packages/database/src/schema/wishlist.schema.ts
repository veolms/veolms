import type { Generated } from "kysely";

/** A course a learner has saved for later. One row per learner and course. */
export interface WishlistItemTable {
  user_id: string;
  course_id: string;
  created_at: Generated<Date>;
}
