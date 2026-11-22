import type { DatabaseExecutor, LessonContentKind } from "@veolms/database";

/**
 * Every kind's content of the given lessons, with the file each one holds:
 * one query for a whole curriculum.
 */
export async function listLessonContents(
  database: DatabaseExecutor,
  lessonIds: readonly string[],
) {
  if (lessonIds.length === 0) return [];
  return await database
    .selectFrom("course_lesson_contents as c")
    .leftJoin("media_assets as m", "m.id", "c.media_id")
    .select([
      "c.lesson_id",
      "c.content_type",
      "c.media_id",
      "c.body",
      "m.original_filename",
      "m.mime_type",
      "m.size_bytes",
      "m.status",
      "m.duration_seconds",
    ])
    .where("c.lesson_id", "in", lessonIds)
    .orderBy("c.lesson_id")
    .orderBy("c.content_type")
    .execute();
}

export type LessonContentRow = Awaited<
  ReturnType<typeof listLessonContents>
>[number];

export async function findLessonContent(
  database: DatabaseExecutor,
  lessonId: string,
  contentType: LessonContentKind,
) {
  return await database
    .selectFrom("course_lesson_contents")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .where("content_type", "=", contentType)
    .executeTakeFirst();
}

/**
 * Sets what one kind of a lesson holds. A field left `undefined` keeps its
 * value; content left with neither media nor text is removed.
 */
export async function saveLessonContent(
  database: DatabaseExecutor,
  input: {
    lessonId: string;
    contentType: LessonContentKind;
    mediaId?: string | null;
    body?: string | null;
    now: Date;
  },
) {
  const current = await findLessonContent(
    database,
    input.lessonId,
    input.contentType,
  );
  const mediaId =
    input.mediaId !== undefined ? input.mediaId : (current?.media_id ?? null);
  const body = input.body !== undefined ? input.body : (current?.body ?? null);

  if (mediaId === null && (body === null || body.trim() === "")) {
    await database
      .deleteFrom("course_lesson_contents")
      .where("lesson_id", "=", input.lessonId)
      .where("content_type", "=", input.contentType)
      .execute();
    return null;
  }

  await database
    .insertInto("course_lesson_contents")
    .values({
      lesson_id: input.lessonId,
      content_type: input.contentType,
      media_id: mediaId,
      body,
      created_at: input.now,
      updated_at: input.now,
    })
    .onConflict((oc) =>
      oc.columns(["lesson_id", "content_type"]).doUpdateSet({
        media_id: mediaId,
        body,
        updated_at: input.now,
      }),
    )
    .execute();
  return { media_id: mediaId, body };
}
