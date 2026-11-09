import { sql, type Kysely } from "kysely";

/**
 * Whether a contact change had to prove the current value. One that did not
 * (the value was never confirmed) stops applying once the value is
 * confirmed while it is open: it would otherwise replace a confirmed email
 * address or number with no proof of it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table contact_changes
      add column if not exists proof_required boolean not null default true
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table contact_changes drop column if exists proof_required
  `.execute(database);
}
