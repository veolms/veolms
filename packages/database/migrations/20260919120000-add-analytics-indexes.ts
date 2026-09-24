import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_enrollments_course_created
      on enrollments (course_id, created_at)
  `.execute(database);

  await sql`
    create index if not exists idx_enrollments_created
      on enrollments (created_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_enrollments_created`.execute(database);
  await sql`drop index if exists idx_enrollments_course_created`.execute(database);
}
