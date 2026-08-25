import { type Kysely } from "kysely";
import type { Database } from "@veolms/database";

// --- Sections ---

export async function findMaxSectionPosition(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_sections")
    .select((eb) => eb.fn.max("position").as("max"))
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function insertSection(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    title: string;
    description: string | null;
    position: number;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_sections").values(values).execute();
}

export async function findSectionById(
  database: Kysely<Database>,
  sectionId: string,
  courseId: string,
) {
  return await database
    .selectFrom("course_sections")
    .selectAll()
    .where("id", "=", sectionId)
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function updateSection(
  database: Kysely<Database>,
  sectionId: string,
  courseId: string,
  values: { title?: string; description?: string | null; updated_at: Date },
) {
  await database
    .updateTable("course_sections")
    .set(values)
    .where("id", "=", sectionId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function softDeleteSection(
  database: Kysely<Database>,
  sectionId: string,
  courseId: string,
  now: Date,
) {
  await database
    .updateTable("course_sections")
    .set({ deleted_at: now, updated_at: now })
    .where("id", "=", sectionId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function findSectionsByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_sections")
    .selectAll()
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

export async function updateSectionPosition(
  database: Kysely<Database>,
  sectionId: string,
  courseId: string,
  position: number,
  now: Date,
) {
  await database
    .updateTable("course_sections")
    .set({ position, updated_at: now })
    .where("id", "=", sectionId)
    .where("course_id", "=", courseId)
    .execute();
}

// --- Lessons ---

export async function findMaxLessonPosition(
  database: Kysely<Database>,
  sectionId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .select((eb) => eb.fn.max("position").as("max"))
    .where("section_id", "=", sectionId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function insertLesson(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    section_id: string;
    title: string;
    description: string | null;
    content_type: "video" | "document";
    position: number;
    is_preview: boolean;
    is_published: boolean;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_lessons").values(values).execute();
}

export async function findLessonById(
  database: Kysely<Database>,
  lessonId: string,
  courseId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .selectAll()
    .where("id", "=", lessonId)
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function updateLesson(
  database: Kysely<Database>,
  lessonId: string,
  courseId: string,
  values: {
    title?: string;
    description?: string | null;
    content_type?: "video" | "document";
    content_media_id?: string | null;
    is_preview?: boolean;
    is_published?: boolean;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_lessons")
    .set(values)
    .where("id", "=", lessonId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function softDeleteLesson(
  database: Kysely<Database>,
  lessonId: string,
  courseId: string,
  now: Date,
) {
  await database
    .updateTable("course_lessons")
    .set({ deleted_at: now, updated_at: now })
    .where("id", "=", lessonId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function findLessonsBySectionId(
  database: Kysely<Database>,
  sectionId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .select("id")
    .where("section_id", "=", sectionId)
    .where("deleted_at", "is", null)
    .execute();
}

export async function softDeleteLessonsBySectionId(
  database: Kysely<Database>,
  sectionId: string,
  now: Date,
) {
  await database
    .updateTable("course_lessons")
    .set({ deleted_at: now, updated_at: now })
    .where("section_id", "=", sectionId)
    .execute();
}

export async function findLessonsByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .selectAll()
    .where("course_id", "=", courseId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

export async function findLessonsBySection(
  database: Kysely<Database>,
  sectionId: string,
) {
  return await database
    .selectFrom("course_lessons")
    .selectAll()
    .where("section_id", "=", sectionId)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}

export async function updateLessonPosition(
  database: Kysely<Database>,
  lessonId: string,
  sectionId: string,
  position: number,
  now: Date,
) {
  await database
    .updateTable("course_lessons")
    .set({ position, updated_at: now })
    .where("id", "=", lessonId)
    .where("section_id", "=", sectionId)
    .execute();
}

// --- Resources ---

export async function findMaxResourcePosition(
  database: Kysely<Database>,
  lessonId: string,
) {
  return await database
    .selectFrom("lesson_resources")
    .select((eb) => eb.fn.max("position").as("max"))
    .where("lesson_id", "=", lessonId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function insertResource(
  database: Kysely<Database>,
  values: {
    id: string;
    lesson_id: string;
    media_asset_id: string;
    title: string;
    description: string | null;
    position: number;
    created_at: Date;
  },
) {
  await database.insertInto("lesson_resources").values(values).execute();
}

export async function findResourceById(
  database: Kysely<Database>,
  resourceId: string,
  courseId: string,
) {
  return await database
    .selectFrom("lesson_resources")
    .innerJoin(
      "course_lessons",
      "course_lessons.id",
      "lesson_resources.lesson_id",
    )
    .select([
      "lesson_resources.id",
      "lesson_resources.lesson_id",
      "lesson_resources.media_asset_id",
      "lesson_resources.title",
      "lesson_resources.description",
      "lesson_resources.position",
      "lesson_resources.created_at",
    ])
    .where("lesson_resources.id", "=", resourceId)
    .where("course_lessons.course_id", "=", courseId)
    .where("lesson_resources.deleted_at", "is", null)
    .executeTakeFirst();
}

export async function softDeleteResource(
  database: Kysely<Database>,
  resourceId: string,
  lessonId: string,
  now: Date,
) {
  await database
    .updateTable("lesson_resources")
    .set({ deleted_at: now })
    .where("id", "=", resourceId)
    .where("lesson_id", "=", lessonId)
    .execute();
}

export async function softDeleteResourcesByLessonId(
  database: Kysely<Database>,
  lessonId: string,
  now: Date,
) {
  await database
    .updateTable("lesson_resources")
    .set({ deleted_at: now })
    .where("lesson_id", "=", lessonId)
    .execute();
}

export async function softDeleteResourcesByLessonIds(
  database: Kysely<Database>,
  lessonIds: string[],
  now: Date,
) {
  if (lessonIds.length === 0) {
    return;
  }
  await database
    .updateTable("lesson_resources")
    .set({ deleted_at: now })
    .where("lesson_id", "in", lessonIds)
    .execute();
}

export async function listResourcesForLessons(
  database: Kysely<Database>,
  lessonIds: string[],
) {
  if (lessonIds.length === 0) {
    return [];
  }
  return await database
    .selectFrom("lesson_resources")
    .selectAll()
    .where("lesson_id", "in", lessonIds)
    .where("deleted_at", "is", null)
    .orderBy("position", "asc")
    .execute();
}
