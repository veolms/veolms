import { sql, type Kysely } from "kysely";

/**
 * Support as a queue the team works through:
 *
 * - `support_tickets` gets an assignee (who, since when, by whom) and an
 *   optional priority.
 * - `support_messages`: internal notes can be edited, pinned and deleted.
 *   A deleted note is kept (`deleted_at`) so the deletion can be audited.
 * - `support_events`: what the team did to a ticket, for its Activity log
 *   (assigned, status changed, note pinned, ...). Staff only.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table support_tickets
      add column if not exists assignee_id uuid
        references users (id) on delete set null,
      add column if not exists assigned_at timestamptz,
      add column if not exists assigned_by uuid
        references users (id) on delete set null,
      add column if not exists priority text
  `.execute(database);
  await sql`
    alter table support_tickets
      drop constraint if exists support_tickets_priority_valid
  `.execute(database);
  await sql`
    alter table support_tickets
      add constraint support_tickets_priority_valid check (
        priority is null or priority in ('low', 'medium', 'high', 'urgent')
      )
  `.execute(database);
  await sql`
    create index if not exists idx_support_tickets_assignee
      on support_tickets (assignee_id, kind, status)
      where assignee_id is not null
  `.execute(database);

  await sql`
    alter table support_messages
      add column if not exists updated_at timestamptz,
      add column if not exists edited_by uuid
        references users (id) on delete set null,
      add column if not exists pinned boolean not null default false,
      add column if not exists pinned_at timestamptz,
      add column if not exists deleted_at timestamptz,
      add column if not exists deleted_by uuid
        references users (id) on delete set null
  `.execute(database);

  await sql`
    create table if not exists support_events (
      id uuid primary key,
      -- The order they happened in: changes made in one step share a time.
      seq bigint generated always as identity,
      ticket_id uuid not null references support_tickets (id) on delete cascade,
      actor_id uuid references users (id) on delete set null,
      type text not null,
      -- What changed: { from, to } for a status, priority or category;
      -- { assigneeId } for an assignment; { messageId } for a note.
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp,
      constraint support_events_type_valid check (type in (
        'assigned', 'unassigned', 'status_changed', 'priority_changed',
        'category_changed', 'note_pinned', 'note_unpinned', 'note_deleted'
      ))
    )
  `.execute(database);
  await sql`
    create index if not exists idx_support_events_ticket
      on support_events (ticket_id, seq)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists support_events`.execute(database);
  await sql`
    alter table support_messages
      drop column if exists deleted_by,
      drop column if exists deleted_at,
      drop column if exists pinned_at,
      drop column if exists pinned,
      drop column if exists edited_by,
      drop column if exists updated_at
  `.execute(database);
  await sql`drop index if exists idx_support_tickets_assignee`.execute(
    database,
  );
  await sql`
    alter table support_tickets
      drop constraint if exists support_tickets_priority_valid,
      drop column if exists priority,
      drop column if exists assigned_by,
      drop column if exists assigned_at,
      drop column if exists assignee_id
  `.execute(database);
}
