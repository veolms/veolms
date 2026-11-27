import { sql, type Kysely } from "kysely";

/**
 * Chat assistants (docs: PRD "Claude Assistant in VeoLMS Chat").
 *
 * An assistant is a chat member people talk to in a private chat; the work
 * itself is done by an outside agent service that reads the chat through the
 * assistant API. The LMS keeps only what people see:
 *
 * - the assistant's user row ("Claude"): no email, no phone, so it can never
 *   sign in;
 * - `assistant_conversations`: one private chat per person, and how far the
 *   agent has confirmed reading it (`delivered_seq`);
 * - `assistant_cards`: the status card of each request (steps, links, Stop);
 * - `assistant_heartbeats`: when the agent last checked in (Online/Offline).
 *
 * Everything about how a job runs lives in the agent's own database.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into users (id, email, phone_no, username, display_name)
    values (
      '00000000-0000-4000-a000-000000000001', null, null,
      'claude-assistant', 'Claude'
    )
    on conflict (id) do nothing
  `.execute(database);

  await sql`
    create table if not exists assistant_conversations (
      room_id uuid primary key references chat_rooms(id) on delete cascade,
      assistant_id uuid not null references users(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      delivered_seq bigint not null default 0,
      created_at timestamptz not null default now(),
      unique (assistant_id, user_id)
    )
  `.execute(database);

  await sql`
    create table if not exists assistant_cards (
      id uuid primary key,
      room_id uuid not null references assistant_conversations(room_id) on delete cascade,
      message_seq bigint,
      request_seq bigint not null,
      requester_id uuid not null references users(id) on delete cascade,
      kind text not null check (kind in ('fix', 'build', 'research', 'ask', 'review')),
      title varchar(120) not null,
      state text not null default 'queued'
        check (state in ('queued', 'running', 'waiting', 'done', 'failed', 'stopped')),
      steps jsonb not null default '[]'::jsonb,
      links jsonb not null default '[]'::jsonb,
      stop_requested_at timestamptz,
      stop_delivered_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      finished_at timestamptz,
      unique (room_id, request_seq)
    )
  `.execute(database);

  await sql`
    create index if not exists assistant_cards_room_created_idx
      on assistant_cards (room_id, created_at desc)
  `.execute(database);

  await sql`
    create index if not exists assistant_cards_stop_pending_idx
      on assistant_cards (room_id)
      where stop_requested_at is not null and stop_delivered_at is null
  `.execute(database);

  await sql`
    create table if not exists assistant_heartbeats (
      assistant_id uuid primary key references users(id) on delete cascade,
      seen_at timestamptz not null default now(),
      version varchar(64),
      info jsonb not null default '{}'::jsonb
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists assistant_heartbeats`.execute(database);
  await sql`drop table if exists assistant_cards`.execute(database);
  await sql`drop table if exists assistant_conversations`.execute(database);
  await sql`
    delete from chat_rooms where id in (
      select room_id from chat_members
      where user_id = '00000000-0000-4000-a000-000000000001'
    )
  `.execute(database);
  await sql`
    delete from users where id = '00000000-0000-4000-a000-000000000001'
  `.execute(database);
}
