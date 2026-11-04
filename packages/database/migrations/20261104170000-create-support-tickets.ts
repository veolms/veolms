import { sql, type Kysely } from "kysely";

/**
 * Support: problems reported and feedback sent from "Help and feedback".
 *
 * - `support_tickets`: one row per report or feedback, with its own
 *   short number (#1001, ...) to quote in emails.
 * - `support_messages`: the conversation under a ticket. Staff can also
 *   leave internal notes, which the learner never sees.
 * - `support_attachments`: files added to a ticket or a message. A file is
 *   uploaded first and claimed by the ticket or message it is sent with.
 *
 * Also adds `support.read` and `support.manage` (positions 80 and 81 in the
 * contracts list, the seed's id scheme), granted to admin only.
 */
const supportPermissions = [
  { key: "support.read", id: "00000000-0000-4000-b000-000000000080" },
  { key: "support.manage", id: "00000000-0000-4000-b000-000000000081" },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of supportPermissions) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      values (
        ${permission.id}::uuid,
        ${permission.key},
        'support',
        ${`Permission to perform ${permission.key}`}
      )
      on conflict do nothing
    `.execute(database);
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${permission.key}
      where roles.name = 'admin'
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists support_tickets (
      id uuid primary key,
      number bigint generated always as identity (start with 1001) unique,
      user_id uuid not null references users (id) on delete cascade,
      kind text not null,
      category text not null,
      -- Feedback only: 1 (terrible) to 5 (love it).
      rating smallint,
      status text not null,
      -- The first line of the message, for lists.
      title text not null,
      content text not null,
      plain_text text not null,
      -- The page the learner was on when they opened the form.
      page_path text,
      page_label text,
      course_id uuid references courses (id) on delete set null,
      -- Browser, system, screen and app version, when the learner allowed it.
      technical jsonb,
      contact_allowed boolean not null default true,
      -- Who has something new to read.
      user_unread boolean not null default false,
      staff_unread boolean not null default true,
      last_message_at timestamptz not null default current_timestamp,
      resolved_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint support_tickets_kind_valid check (kind in ('problem', 'feedback')),
      constraint support_tickets_category_valid check (category in (
        'video', 'access', 'payment', 'account', 'bug', 'other',
        'idea', 'like', 'confusing', 'content'
      )),
      constraint support_tickets_status_valid check (status in (
        'open', 'in_progress', 'waiting', 'resolved',
        'new', 'reviewed', 'planned'
      )),
      constraint support_tickets_rating_range check (
        rating is null or rating between 1 and 5
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_support_tickets_user
      on support_tickets (user_id, last_message_at desc)
  `.execute(database);
  await sql`
    create index if not exists idx_support_tickets_queue
      on support_tickets (kind, status, created_at desc)
  `.execute(database);
  await sql`
    create index if not exists idx_support_tickets_created
      on support_tickets (kind, created_at desc, id desc)
  `.execute(database);

  await sql`
    create table if not exists support_messages (
      id uuid primary key,
      ticket_id uuid not null references support_tickets (id) on delete cascade,
      author_id uuid references users (id) on delete set null,
      author_role text not null,
      internal boolean not null default false,
      content text not null,
      plain_text text not null,
      created_at timestamptz not null default current_timestamp,
      constraint support_messages_author_role_valid check (
        author_role in ('user', 'staff')
      ),
      constraint support_messages_internal_staff_only check (
        not internal or author_role = 'staff'
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_support_messages_ticket
      on support_messages (ticket_id, created_at)
  `.execute(database);

  await sql`
    create table if not exists support_attachments (
      id uuid primary key,
      owner_id uuid not null references users (id) on delete cascade,
      ticket_id uuid references support_tickets (id) on delete cascade,
      message_id uuid references support_messages (id) on delete cascade,
      storage_key text not null,
      file_name text not null,
      mime_type text not null,
      file_size bigint not null,
      width integer,
      height integer,
      created_at timestamptz not null default current_timestamp,
      constraint support_attachments_size_positive check (file_size > 0)
    )
  `.execute(database);
  await sql`
    create index if not exists idx_support_attachments_ticket
      on support_attachments (ticket_id)
  `.execute(database);
  // Upload allowance and clean-up of files never sent.
  await sql`
    create index if not exists idx_support_attachments_owner
      on support_attachments (owner_id, created_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists support_attachments`.execute(database);
  await sql`drop table if exists support_messages`.execute(database);
  await sql`drop table if exists support_tickets`.execute(database);
  for (const permission of supportPermissions) {
    await sql`
      delete from role_permissions
      using permissions
      where role_permissions.permission_id = permissions.id
        and permissions.permission_key = ${permission.key}
    `.execute(database);
    await sql`
      delete from permissions where permission_key = ${permission.key}
    `.execute(database);
  }
}
