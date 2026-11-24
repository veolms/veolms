import type { Generated } from "kysely";
import type { Json } from "./json.schema.ts";

export type QuestionGenerationJobStatus =
  "queued" | "running" | "done" | "failed" | "cancelled";

/** One AI run that writes draft questions for a course's lectures. */
export interface QuestionGenerationJobTable {
  id: Generated<string>;
  course_id: string;
  created_by: string | null;
  status: Generated<QuestionGenerationJobStatus>;
  /** What to make and how (questionGenerationSettingsSchema). */
  settings: Generated<Json>;
  total_items: Generated<number>;
  done_items: Generated<number>;
  quizzes_created: Generated<number>;
  coding_created: Generated<number>;
  skipped_items: Generated<number>;
  failed_items: Generated<number>;
  error: string | null;
  /** The server working on it holds it until then. */
  lease_until: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type QuestionGenerationItemStatus =
  "pending" | "running" | "done" | "skipped" | "failed";

/** One lecture of a run: what was made for it, or why not. */
export interface QuestionGenerationItemTable {
  id: Generated<string>;
  job_id: string;
  lesson_id: string;
  /** Course order. */
  position: number;
  status: Generated<QuestionGenerationItemStatus>;
  quiz_id: string | null;
  coding_exercise_id: string | null;
  message: string | null;
  attempts: Generated<number>;
  updated_at: Generated<Date>;
}
