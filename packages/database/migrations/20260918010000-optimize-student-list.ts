import { sql, type Kysely } from "kysely";

/**
 * Indexes used by the instructor student list. The list is cursor-paginated,
 * so the user ordering indexes also include the stable id tie-breaker.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_students_users_recent
      on users (created_at desc, id desc)
      where is_deleted = false
  `.execute(database);

  await sql`
    create index if not exists idx_students_users_name
      on users (display_name asc, id asc)
      where is_deleted = false
  `.execute(database);

  // Trigram search keeps the existing contains-search UX fast for large
  // academies. The extension is shared by the database and is intentionally
  // not removed during rollback because another feature may use it.
  await sql`create extension if not exists pg_trgm`.execute(database);
  await sql`
    create index if not exists idx_students_users_search
      on users using gin (
        display_name gin_trgm_ops,
        username gin_trgm_ops,
        email gin_trgm_ops
      )
      where is_deleted = false
  `.execute(database);

  await sql`
    create index if not exists idx_students_progress_user_updated
      on learning_progress (user_id, updated_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_students_progress_user_updated`.execute(
    database,
  );
  await sql`drop index if exists idx_students_users_search`.execute(database);
  await sql`drop index if exists idx_students_users_name`.execute(database);
  await sql`drop index if exists idx_students_users_recent`.execute(database);
}
