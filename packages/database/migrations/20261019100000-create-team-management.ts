import { sql, type Kysely } from "kysely";

/**
 * Team management: new permission keys, the invitation tables, and the flag
 * that keeps custom roles hidden until every check reads permissions.
 *
 * Permission ids follow the seed's scheme (position in the contracts list,
 * 1-based), so a later `pnpm db:seed` finds the same rows. The 50 keys that
 * already exist hold 001 to 050.
 */
const newPermissionKeys = [
  "team.read",
  "team.invite",
  "team.update",
  "team.remove",
  "student.read",
  "student.contact.update",
  "student.access.manage",
  "coupon.read",
  "coupon.manage",
  "coupon.delete",
  "refund.review",
  "payment.manual.verify",
  "payment.gateway.manage",
  "bundle.manage",
  "category.manage",
  "course.restore",
  "platform.settings.read",
  "platform.settings.update",
  "platform.branding.update",
  "platform.homepage.update",
] as const;

const firstNewPosition = 51;

// The course routes already require these; instructors only lacked the
// grants. The course services still restrict them to courses they own.
const instructorLifecycleKeys = [
  "course.create",
  "course.publish",
  "course.unpublish",
  "course.archive",
  "course.delete",
] as const;

const systemRoleNames = [
  "admin",
  "instructor",
  "student",
  "course_manager",
  "content_editor",
  "thumbnail_editor",
  "teaching_assistant",
  "reviewer",
  "analytics_viewer",
] as const;

function permissionId(position: number): string {
  return `00000000-0000-4000-b000-${String(position).padStart(12, "0")}`;
}

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const [index, key] of newPermissionKeys.entries()) {
    const domain = key.split(".")[0] ?? "general";
    await sql`
      insert into permissions (id, permission_key, domain, description)
      values (
        ${permissionId(firstNewPosition + index)}::uuid,
        ${key},
        ${domain},
        ${`Permission to perform ${key}`}
      )
      on conflict do nothing
    `.execute(database);
  }

  // Admin holds every permission, including the new ones.
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    cross join permissions
    where roles.name = 'admin'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);

  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions
      on permissions.permission_key in (${sql.join(
        instructorLifecycleKeys.map((key) => sql`${key}`),
      )})
    where roles.name = 'instructor'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);

  await sql`
    update roles set is_system = true, updated_at = current_timestamp
    where name in (${sql.join(systemRoleNames.map((name) => sql`${name}`))})
      and is_system = false
  `.execute(database);

  await sql`
    insert into features (feature_key, description, enabled)
    values (
      'team_custom_roles',
      'Custom team roles built from permissions',
      false
    )
    on conflict (feature_key) do nothing
  `.execute(database);

  await sql`
    create table if not exists team_invitations (
      id uuid primary key,
      email text not null check (email = lower(email)),
      kind text not null check (kind in ('invite', 'preapproved')),
      token_hash text,
      invited_by uuid references users (id) on delete set null,
      message text check (char_length(message) <= 1000),
      expires_at timestamptz not null,
      accepted_at timestamptz,
      accepted_user_id uuid references users (id) on delete set null,
      revoked_at timestamptz,
      last_sent_at timestamptz,
      send_count integer not null default 0,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint team_invitations_token_by_kind check (
        (kind = 'invite' and token_hash is not null) or
        (kind = 'preapproved' and token_hash is null)
      ),
      constraint team_invitations_single_outcome check (
        accepted_at is null or revoked_at is null
      )
    )
  `.execute(database);

  // At most one open row per email. An expired row stays open until the
  // service revokes it, which it does before writing a new one.
  await sql`
    create unique index if not exists team_invitations_open_email_key
      on team_invitations (email)
      where accepted_at is null and revoked_at is null
  `.execute(database);
  await sql`
    create unique index if not exists team_invitations_token_hash_key
      on team_invitations (token_hash)
      where token_hash is not null
  `.execute(database);
  await sql`
    create index if not exists team_invitations_created_at_idx
      on team_invitations (created_at desc)
  `.execute(database);

  await sql`
    create table if not exists team_invitation_roles (
      invitation_id uuid not null
        references team_invitations (id) on delete cascade,
      role_id uuid not null references roles (id) on delete restrict,
      primary key (invitation_id, role_id)
    )
  `.execute(database);
  await sql`
    create index if not exists team_invitation_roles_role_idx
      on team_invitation_roles (role_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists team_invitation_roles`.execute(database);
  await sql`drop table if exists team_invitations`.execute(database);
  await sql`delete from features where feature_key = 'team_custom_roles'`.execute(
    database,
  );
  await sql`
    delete from role_permissions
    using roles, permissions
    where role_permissions.role_id = roles.id
      and role_permissions.permission_id = permissions.id
      and roles.name = 'instructor'
      and permissions.permission_key in (${sql.join(
        instructorLifecycleKeys.map((key) => sql`${key}`),
      )})
  `.execute(database);
  await sql`
    delete from permissions
    where permission_key in (${sql.join(
      newPermissionKeys.map((key) => sql`${key}`),
    )})
  `.execute(database);
}
