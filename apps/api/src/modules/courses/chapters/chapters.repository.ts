import { sql } from "kysely";
import type { DatabaseExecutor } from "@veolms/database";

export interface LessonChapterValues {
  id: string;
  lesson_id: string;
  title: string;
  start_seconds: number;
  thumbnail_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listChapters(
  database: DatabaseExecutor,
  lessonId: string,
) {
  return await database
    .selectFrom("lesson_chapters")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .orderBy("start_seconds", "asc")
    .execute();
}

/** Replaces the derived chapter rows of one lesson. Run inside a transaction. */
export async function replaceChapters(
  database: DatabaseExecutor,
  lessonId: string,
  chapters: readonly LessonChapterValues[],
) {
  await database
    .deleteFrom("lesson_chapters")
    .where("lesson_id", "=", lessonId)
    .execute();
  if (chapters.length === 0) return;
  await database
    .insertInto("lesson_chapters")
    .values([...chapters])
    .execute();
}

/** Video lessons that currently play the given media asset. */
export async function findVideoLessonsByMediaId(
  database: DatabaseExecutor,
  mediaId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .select(["id", "description"])
    .where("content_media_id", "=", mediaId)
    .where("content_type", "=", "video")
    .where("deleted_at", "is", null)
    .execute();
}

/**
 * Records captured frames for every chapter of the media's lessons that
 * starts at one of `startSeconds`. Keys follow the capture contract:
 * `<keyPrefix><startSeconds>.webp`.
 */
export async function setCapturedThumbnailKeys(
  database: DatabaseExecutor,
  mediaId: string,
  keyPrefix: string,
  startSeconds: readonly number[],
  now: Date,
) {
  if (startSeconds.length === 0) return;
  await database
    .updateTable("lesson_chapters")
    .set({
      thumbnail_key: sql<string>`${keyPrefix} || start_seconds::text || '.webp'`,
      updated_at: now,
    })
    .where("start_seconds", "in", [...startSeconds])
    .where("lesson_id", "in", (eb) =>
      eb
        .selectFrom("course_lessons")
        .select("id")
        .where("content_media_id", "=", mediaId)
        .where("deleted_at", "is", null),
    )
    .execute();
}
