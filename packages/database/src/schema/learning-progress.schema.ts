import type { Generated } from "kysely";

/** Durable learner progress for one course lesson. */
export interface LearningProgressTable {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  progress_percent: number;
  /** Seconds into the lesson's video where the learner last was. */
  position_seconds: number | null;
  /** When `position_seconds` was saved: the last time it was played. */
  position_updated_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
