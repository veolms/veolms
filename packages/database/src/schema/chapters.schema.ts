import type { Generated } from "kysely";

export interface LessonChapterTable {
  id: string;
  lesson_id: string;
  title: string;
  start_seconds: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
