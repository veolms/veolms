import { sql, type Kysely } from "kysely";

/**
 * Staff can extend one learner's access to one course (Students → Extend
 * validity). The extension is kept on the grant beside its end date: a
 * linked course's end is worked out again from the courses that link it at
 * every sync, and would otherwise undo an extension given to it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table access_grants
      add column if not exists extended_until timestamptz,
      add column if not exists extended_lifetime boolean not null default false,
      add column if not exists extended_at timestamptz,
      add column if not exists extended_by uuid
        references users (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table access_grants
      drop column if exists extended_by,
      drop column if exists extended_at,
      drop column if exists extended_lifetime,
      drop column if exists extended_until
  `.execute(database);
}
