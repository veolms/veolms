export interface LessonChapterTable {
  id: string;
  lesson_id: string;
  title: string;
  start_seconds: number;
  /** Storage key of the extracted first frame; null until the fleet reports it. */
  thumbnail_key: string | null;
  created_at: Date;
  updated_at: Date;
}
