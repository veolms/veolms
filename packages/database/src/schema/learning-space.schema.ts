import type { Generated } from "kysely";

export type LearningSpaceSessionOrigin = "home" | "courses" | "wishlist";

export interface LearningSpaceSessionTable {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string | null;
  lesson_number: number | null;
  origin: LearningSpaceSessionOrigin;
  return_path: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
