import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table course_lessons drop constraint if exists course_lessons_content_type_valid`.execute(
    database,
  );
  await sql`alter table course_lessons add constraint course_lessons_content_type_valid check (content_type in ('video', 'document', 'quiz'))`.execute(
    database,
  );
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`update course_lessons set content_type = 'document' where content_type = 'quiz'`.execute(
    database,
  );
  await sql`alter table course_lessons drop constraint if exists course_lessons_content_type_valid`.execute(
    database,
  );
  await sql`alter table course_lessons add constraint course_lessons_content_type_valid check (content_type in ('video', 'document'))`.execute(
    database,
  );
}
