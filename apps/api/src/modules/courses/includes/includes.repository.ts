import { type Kysely } from "kysely";
import type { Database } from "@veolms/database";

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
    icon?: string | null;
    position: number;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_includes").values(values).execute();
}

export async function findIncludeById(
  database: Kysely<Database>,
  includeId: string,
  courseId: string,
) {
  return await database
    .selectFrom("course_includes")
    .selectAll()
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
    .selectAll()
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
    icon?: string | null;
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
