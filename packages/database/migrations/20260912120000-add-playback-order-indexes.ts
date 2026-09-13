import type { Kysely } from "kysely";

/**
 * Keeps the ordered lesson lookup used by playback bootstrap index-friendly.
 * The endpoint only needs one lesson, but it still orders by section and
 * lesson position before applying OFFSET/LIMIT.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createIndex("idx_course_sections_course_position")
    .on("course_sections")
    .columns(["course_id", "position"])
    .execute();

  await database.schema
    .createIndex("idx_course_lessons_section_position")
    .on("course_lessons")
    .columns(["section_id", "position"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("idx_course_lessons_section_position")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_course_sections_course_position")
    .ifExists()
    .execute();
}
