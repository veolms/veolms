import { sql, type Kysely } from "kysely";

/**
 * Email marketing (creator-features/34-email-marketing-plan.md).
 *
 * `marketing_emails` holds both broadcasts (written once, sent to an
 * audience now or at a set time) and the emails of the ready automations
 * (welcome, nudge to start, ...). `marketing_email_recipients` is the
 * queue and the report in one: one small row per person, the HTML made
 * only when it is sent, so a send to 20,000 students is 20,000 short rows.
 *
 * Adds `marketing.manage` for admins as id 88: permissions are numbered by
 * their place in the contracts list, after `link.manage` (87).
 */
const marketingPermission = {
  key: "marketing.manage",
  id: "00000000-0000-4000-b000-000000000088",
  roles: ["admin"],
} as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into permissions (id, permission_key, domain, description)
    values (
      ${marketingPermission.id}::uuid,
      ${marketingPermission.key},
      'marketing',
      ${`Permission to perform ${marketingPermission.key}`}
    )
    on conflict do nothing
  `.execute(database);
  for (const role of marketingPermission.roles) {
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${marketingPermission.key}
      where roles.name = ${role}
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists marketing_emails (
      id uuid primary key default gen_random_uuid(),
      kind text not null check (kind in ('broadcast', 'automation')),
      -- One row per ready automation ("welcome", "start_nudge", ...).
      automation_key text,
      name text not null,
      subject text not null default '',
      preheader text not null default '',
      blocks jsonb not null default '[]'::jsonb,
      audience jsonb,
      -- An automation's timing and course: { waitHours, courseId }.
      settings jsonb,
      status text not null check (
        status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'active', 'paused')
      ),
      scheduled_at timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      -- When an automation was last switched on: only what happens after
      -- it counts, so switching on never emails the whole history.
      enabled_at timestamptz,
      resend_of uuid references marketing_emails (id) on delete set null,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      deleted_at timestamptz,
      check ((kind = 'automation') = (automation_key is not null))
    )
  `.execute(database);
  await sql`
    create unique index if not exists marketing_emails_automation_key
      on marketing_emails (automation_key)
      where automation_key is not null and deleted_at is null
  `.execute(database);
  await sql`
    create index if not exists marketing_emails_list
      on marketing_emails (kind, created_at desc)
      where deleted_at is null
  `.execute(database);
  await sql`
    create index if not exists marketing_emails_due
      on marketing_emails (scheduled_at)
      where status = 'scheduled'
  `.execute(database);

  await sql`
    create table if not exists marketing_email_recipients (
      email_id uuid not null references marketing_emails (id) on delete cascade,
      user_id uuid not null references users (id) on delete cascade,
      email text not null,
      -- The course an automation email is about ("you haven't started X").
      course_id uuid references courses (id) on delete set null,
      status text not null default 'pending'
        check (status in ('pending', 'sent', 'failed', 'skipped')),
      due_at timestamptz not null default current_timestamp,
      attempt_count integer not null default 0,
      locked_until timestamptz,
      sent_at timestamptz,
      opened_at timestamptz,
      clicked_at timestamptz,
      unsubscribed_at timestamptz,
      last_error text,
      created_at timestamptz not null default current_timestamp,
      primary key (email_id, user_id)
    )
  `.execute(database);
  await sql`
    create index if not exists marketing_email_recipients_due
      on marketing_email_recipients (due_at)
      where status = 'pending'
  `.execute(database);
  await sql`
    create index if not exists marketing_email_recipients_user
      on marketing_email_recipients (user_id, clicked_at)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists marketing_email_recipients`.execute(database);
  await sql`drop table if exists marketing_emails`.execute(database);
  await sql`
    delete from permissions where permission_key = ${marketingPermission.key}
  `.execute(database);
}
