import type { Database, DatabaseExecutor } from "@veolms/database";
import type { Selectable } from "kysely";

export async function listChapters(
  database: DatabaseExecutor,
  lessonId: string,
) {
  return await database
    .selectFrom("lesson_chapters")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .orderBy("start_seconds", "asc")
    .orderBy("id", "asc")
    .execute();
}

export async function findChapterById(
  database: DatabaseExecutor,
  chapterId: string,
  lessonId: string,
) {
  return await database
    .selectFrom("lesson_chapters")
    .selectAll()
    .where("id", "=", chapterId)
    .where("lesson_id", "=", lessonId)
    .executeTakeFirst();
}

export async function insertChapter(
  database: DatabaseExecutor,
  values: {
    id: string;
    lesson_id: string;
    title: string;
    start_seconds: number;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("lesson_chapters").values(values).execute();
}

export async function updateChapter(
  database: DatabaseExecutor,
  chapterId: string,
  lessonId: string,
  values: {
    title?: string;
    start_seconds?: number;
    updated_at: Date;
  },
) {
  await database
    .updateTable("lesson_chapters")
    .set(values)
    .where("id", "=", chapterId)
    .where("lesson_id", "=", lessonId)
    .execute();
}

export async function deleteChapter(
  database: DatabaseExecutor,
  chapterId: string,
  lessonId: string,
) {
  await database
    .deleteFrom("lesson_chapters")
    .where("id", "=", chapterId)
    .where("lesson_id", "=", lessonId)
    .execute();
}

export type LessonChapterRow = Selectable<Database["lesson_chapters"]>;
