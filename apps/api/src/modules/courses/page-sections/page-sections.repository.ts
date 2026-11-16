import type {
  CoursePageSectionKind as StoredKind,
  DatabaseExecutor,
} from "@veolms/database";
import { sql } from "kysely";

/** The course's page sections (and its "seo" row), as stored. */
export async function listSectionRows(
  database: DatabaseExecutor,
  courseId: string,
) {
  return await database
    .selectFrom("course_page_sections")
    .select(["kind", "position", "is_visible", "content", "updated_at"])
    .where("course_id", "=", courseId)
    .execute();
}

export type SectionRow = Awaited<ReturnType<typeof listSectionRows>>[number];

/**
 * Saves one kind's switch and/or content; the row is made the first time.
 * By constraint name, as every upsert of a per-academy table is.
 */
export async function upsertSection(
  database: DatabaseExecutor,
  courseId: string,
  kind: StoredKind,
  values: {
    isVisible?: boolean;
    content?: Record<string, unknown>;
    position?: number;
  },
): Promise<void> {
  const now = new Date();
  await database
    .insertInto("course_page_sections")
    .values({
      course_id: courseId,
      kind,
      // A new row starts as the editor shows a never-saved section: on,
      // except the instructor's (see presentEditorSections).
      is_visible: values.isVisible ?? kind !== "instructor",
      ...(values.content !== undefined
        ? { content: JSON.stringify(values.content) }
        : {}),
      ...(values.position !== undefined ? { position: values.position } : {}),
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.constraint("course_page_sections_course_kind_key").doUpdateSet({
        ...(values.isVisible !== undefined
          ? { is_visible: values.isVisible }
          : {}),
        ...(values.content !== undefined
          ? { content: JSON.stringify(values.content) }
          : {}),
        ...(values.position !== undefined ? { position: values.position } : {}),
        updated_at: now,
      }),
    )
    .execute();
}

/** Puts the kinds in this order (0, 1, 2, ...), making missing rows. */
export async function setOrder(
  trx: DatabaseExecutor,
  courseId: string,
  kinds: readonly StoredKind[],
): Promise<void> {
  // Locks the course's rows so two reorders don't interleave.
  await sql`select 1 from course_page_sections where course_id = ${courseId} for update`.execute(
    trx,
  );
  for (const [position, kind] of kinds.entries()) {
    await upsertSection(trx, courseId, kind, { position });
  }
}
