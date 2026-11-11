/**
 * Adds active_sessions_verified_at to sessions to record when a user verified
 * their email OTP for viewing and managing active sessions.
 */

import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sessions
      add column if not exists active_sessions_verified_at timestamptz
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sessions
      drop column if exists active_sessions_verified_at
  `.execute(database);
}
