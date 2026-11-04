import { type Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "@veolms/database";

const INCLUDE_COLUMNS = [
  "id",
  "text",
  "detail",
  "icon",
  "color",
  "kind",
  "position",
] as const;

export async function findMaxIncludePosition(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_includes")
    .select((eb) => eb.fn.max("position").as("max"))
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertInclude(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    text: string;
    detail?: string | null;
    icon?: string | null;
    color?: string | null;
    kind?: "custom" | "video";
    position: number;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_includes").values(values).execute();
}

/** Several lines at once (a new course's standard lines). */
export async function insertIncludes(
  database: DatabaseExecutor,
  values: Array<{
    id: string;
    course_id: string;
    text: string;
    detail: string | null;
    icon: string;
    color: string;
    kind: "custom" | "video";
    position: number;
    created_at: Date;
    updated_at: Date;
  }>,
) {
  if (values.length === 0) return;
  await database.insertInto("course_includes").values(values).execute();
}

export async function countIncludes(
  database: Kysely<Database>,
  courseId: string,
) {
  const row = await database
    .selectFrom("course_includes")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("course_id", "=", courseId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function findIncludeById(
  database: Kysely<Database>,
  includeId: string,
  courseId: string,
) {
  return await database
    .selectFrom("course_includes")
    .select(INCLUDE_COLUMNS)
    .where("id", "=", includeId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function findIncludesByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_includes")
    .select(INCLUDE_COLUMNS)
    .where("course_id", "=", courseId)
    .orderBy("position", "asc")
    .orderBy("created_at", "asc")
    .execute();
}

export async function updateInclude(
  database: Kysely<Database>,
  includeId: string,
  courseId: string,
  values: {
    text?: string;
    detail?: string | null;
    icon?: string | null;
    color?: string | null;
    position?: number;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_includes")
    .set(values)
    .where("id", "=", includeId)
    .where("course_id", "=", courseId)
    .execute();
}

export async function deleteInclude(
  database: Kysely<Database>,
  includeId: string,
  courseId: string,
) {
  return await database
    .deleteFrom("course_includes")
    .where("id", "=", includeId)
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function updateIncludePosition(
  database: Kysely<Database>,
  includeId: string,
  courseId: string,
  position: number,
  now: Date,
) {
  await database
    .updateTable("course_includes")
    .set({ position, updated_at: now })
    .where("id", "=", includeId)
    .where("course_id", "=", courseId)
    .execute();
}
