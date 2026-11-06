import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "@veolms/database";

type Executor = Kysely<Database> | Transaction<Database>;

/**
 * The ids of every course an admin orders: each one not deleted and not
 * unlisted (an unlisted course is on no list). The rows stay locked until
 * the transaction ends, so two reorders cannot interleave.
 */
export async function lockOrderableCourseIds(
  trx: Transaction<Database>,
): Promise<string[]> {
  const rows = await trx
    .selectFrom("courses")
    .select("id")
    .where("deleted_at", "is", null)
    .where("unlisted", "=", false)
    .forUpdate()
    .execute();
  return rows.map((row) => row.id);
}

/** Gives each course its index in `courseIds` as its place. */
export async function writeCourseOrder(
  database: Executor,
  courseIds: readonly string[],
): Promise<void> {
  if (courseIds.length === 0) return;
  const values = sql.join(
    courseIds.map((id, index) => sql`(${id}::uuid, ${index}::integer)`),
  );
  // `updated_at` is left alone: placing a course does not change it, and
  // the lists fall back to it.
  await sql`
    update courses
       set sort_position = placed.position
      from (values ${values}) as placed(id, position)
     where courses.id = placed.id
  `.execute(database);
}
