import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table quiz_questions drop constraint if exists quiz_questions_type_valid`.execute(
    database,
  );
  await sql`alter table quiz_questions add constraint quiz_questions_type_valid check (question_type in ('single_choice', 'multiple_choice', 'true_false', 'short_answer'))`.execute(
    database,
  );
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`update quiz_questions set question_type = 'single_choice' where question_type = 'short_answer'`.execute(
    database,
  );
  await sql`alter table quiz_questions drop constraint if exists quiz_questions_type_valid`.execute(
    database,
  );
  await sql`alter table quiz_questions add constraint quiz_questions_type_valid check (question_type in ('single_choice', 'multiple_choice', 'true_false'))`.execute(
    database,
  );
}
