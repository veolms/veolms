import { sql, type Kysely } from "kysely";

/**
 * Indexes for the team and permission paths.
 *
 * - Foreign keys with no index of their own: deleting a role or a
 *   permission, or a user named as granter or inviter, scanned the whole
 *   referencing table (user_roles holds a row per student).
 * - sessions (user_id, last_used_at desc): the Team page's "last active"
 *   reads one row per member instead of every session they ever had.
 *
 * Migrations run in a transaction, which rules out CONCURRENTLY. Where
 * sessions or user_roles is already large, create these by hand with
 * CREATE INDEX CONCURRENTLY first; IF NOT EXISTS then skips them here.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists role_permissions_permission_idx
      on role_permissions (permission_id)
  `.execute(database);
  await sql`
    create index if not exists user_roles_role_idx on user_roles (role_id)
  `.execute(database);
  await sql`
    create index if not exists role_assignments_created_by_idx
      on role_assignments (created_by) where created_by is not null
  `.execute(database);
  await sql`
    create index if not exists team_invitations_invited_by_idx
      on team_invitations (invited_by) where invited_by is not null
  `.execute(database);
  await sql`
    create index if not exists idx_sessions_user_last_used
      on sessions (user_id, last_used_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  for (const index of [
    "idx_sessions_user_last_used",
    "team_invitations_invited_by_idx",
    "role_assignments_created_by_idx",
    "user_roles_role_idx",
    "role_permissions_permission_idx",
  ]) {
    await sql`drop index if exists ${sql.ref(index)}`.execute(database);
  }
}
