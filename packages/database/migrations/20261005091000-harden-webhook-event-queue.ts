import { sql, type Kysely } from "kysely";

/**
 * Hardens the PostgreSQL-backed payment webhook queue:
 *
 * - `attempts` + `next_attempt_at`: lets the poller claim rows atomically
 *   (incrementing attempts and setting a short lease) and back off failed
 *   events exponentially instead of retrying every poll tick forever.
 * - `dead_at`: dead-letter marker after the attempt cap, so a permanently
 *   failing event stops occupying batch slots (the old queue had head-of-line
 *   blocking: 10 poisoned rows starved every newer webhook indefinitely).
 * - Partial index: the poll query previously seq-scanned + sorted the whole
 *   table every 5 seconds, degrading forever since processed rows are kept.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table webhook_events
      add column if not exists attempts integer not null default 0
  `.execute(database);

  await sql`
    alter table webhook_events
      add column if not exists next_attempt_at timestamptz
  `.execute(database);

  await sql`
    alter table webhook_events
      add column if not exists dead_at timestamptz
  `.execute(database);

  await sql`
    create index if not exists idx_webhook_events_unprocessed
      on webhook_events (created_at)
      where processed_at is null and dead_at is null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_webhook_events_unprocessed`.execute(
    database,
  );
  await sql`alter table webhook_events drop column if exists dead_at`.execute(
    database,
  );
  await sql`
    alter table webhook_events drop column if exists next_attempt_at
  `.execute(database);
  await sql`alter table webhook_events drop column if exists attempts`.execute(
    database,
  );
}
