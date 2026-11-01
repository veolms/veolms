import type { DatabaseExecutor } from "@veolms/database";

/** The courses linked to a course, in the order they were added. */
export async function listLinkedCourses(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_links as cl")
    .innerJoin("courses as c", "c.id", "cl.linked_course_id")
    .select(["c.id", "c.title", "c.slug", "c.status"])
    .where("cl.course_id", "=", courseId)
    .where("c.deleted_at", "is", null)
    .orderBy("cl.position", "asc")
    .orderBy("cl.created_at", "asc")
    .execute();
}

/** Adds the link; adding one that is already there changes nothing. */
export async function insertCourseLink(
  database: DatabaseExecutor,
  courseId: string,
  linkedCourseId: string,
) {
  const max = await database
    .selectFrom("course_links")
    .select((eb) => eb.fn.max("position").as("max"))
    .where("course_id", "=", courseId)
    .executeTakeFirst();

  await database
    .insertInto("course_links")
    .values({
      course_id: courseId,
      linked_course_id: linkedCourseId,
      position: (max?.max ?? -1) + 1,
    })
    .onConflict((oc) =>
      oc.columns(["course_id", "linked_course_id"]).doNothing(),
    )
    .execute();
}

/** Removes the link. Returns whether there was one. */
export async function deleteCourseLink(
  database: DatabaseExecutor,
  courseId: string,
  linkedCourseId: string,
): Promise<boolean> {
  const result = await database
    .deleteFrom("course_links")
    .where("course_id", "=", courseId)
    .where("linked_course_id", "=", linkedCourseId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
