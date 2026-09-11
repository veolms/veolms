import type { Generated } from "kysely";

/** Durable learner progress for one course lesson. */
export interface LearningProgressTable {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  progress_percent: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
