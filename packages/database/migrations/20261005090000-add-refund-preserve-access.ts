import { sql, type Kysely } from "kysely";

/**
 * Persists the admin's "preserve access" choice on the refund row itself.
 * The synchronous admin path already honors `preserveAccess` from the
 * request body, but the asynchronous finishers — the gateway webhook
 * handler and the refund-reconciliation worker — have no request context
 * and previously always revoked access. They now read this column.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table refunds
      add column if not exists preserve_access boolean not null default false
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table refunds
      drop column if exists preserve_access
  `.execute(database);
}
