import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

/** The lesson videos of a published course, in course order. */
function publishedLessonsQuery(database: Kysely<Database>) {
  return database
    .selectFrom("course_lessons")
    .innerJoin("courses", "courses.id", "course_lessons.course_id")
    .innerJoin(
      "course_sections",
      "course_sections.id",
      "course_lessons.section_id",
    )
    .leftJoin(
      "media_assets",
      "media_assets.id",
      "course_lessons.content_media_id",
    )
    .select([
      "courses.id as course_id",
      "course_lessons.id as lesson_id",
      "course_lessons.title as lesson_title",
      "course_lessons.is_preview as is_preview",
      "course_sections.title as section_title",
      "media_assets.id as media_id",
      "media_assets.type as media_type",
      "media_assets.status as media_status",
      "media_assets.storage_key as media_storage_key",
      "media_assets.duration_seconds as duration_seconds",
    ])
    .where("courses.status", "=", "published")
    .where("courses.deleted_at", "is", null)
    .where("course_sections.deleted_at", "is", null)
    .where("course_lessons.deleted_at", "is", null)
    .where("course_lessons.is_published", "=", true)
    .orderBy("course_sections.position", "asc")
    .orderBy("course_lessons.position", "asc")
    .orderBy("course_lessons.id", "asc");
}

export type HeroLessonRow = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof publishedLessonsQuery>["executeTakeFirst"]>
  >
>;

/**
 * Every published lesson of a published course, numbered the way the course
 * player numbers them (published lessons in order, across sections).
 */
export async function listPublishedCourseLessons(
  database: Kysely<Database>,
  courseId: string,
): Promise<(HeroLessonRow & { number: number })[]> {
  const rows = await publishedLessonsQuery(database)
    .where("courses.id", "=", courseId)
    .execute();
  return rows.map((row, index) => ({ ...row, number: index + 1 }));
}

/** One published lesson of a published course, by its id. */
export async function findPublishedLesson(
  database: Kysely<Database>,
  courseId: string,
  lessonId: string,
): Promise<HeroLessonRow | null> {
  return (
    (await publishedLessonsQuery(database)
      .where("courses.id", "=", courseId)
      .where("course_lessons.id", "=", lessonId)
      .executeTakeFirst()) ?? null
  );
}

/** A published course's lesson by its number, the course found by slug. */
export async function findPublishedLessonByNumber(
  database: Kysely<Database>,
  courseSlug: string,
  lessonNumber: number,
): Promise<HeroLessonRow | null> {
  return (
    (await publishedLessonsQuery(database)
      .where("courses.slug", "=", courseSlug)
      .offset(lessonNumber - 1)
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

/** A video uploaded for the home page. */
export async function findVideoAsset(
  database: Kysely<Database>,
  mediaId: string,
) {
  return (
    (await database
      .selectFrom("media_assets")
      .select([
        "id",
        "type",
        "status",
        "storage_key",
        "duration_seconds",
        "original_filename",
      ])
      .where("id", "=", mediaId)
      .executeTakeFirst()) ?? null
  );
}
