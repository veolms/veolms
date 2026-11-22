import { sql, type Kysely } from "kysely";

/**
 * Links: short addresses on the site's own domain (`/nodejs`) that redirect
 * to, or show, another page. Design: docs/short-links.md.
 *
 * `path` is stored normalised (lowercase, leading slash, no trailing slash),
 * so the unique index is also the case-insensitive one. `visit_count` is
 * bumped by the website Worker after it has answered a visit.
 *
 * Adds `link.manage` for admins and instructors, as id 87: feat/workshops
 * takes 85 and 86 (`workshop.read`, `workshop.manage`). The seed numbers
 * permissions by their place in the contracts list, so `link.manage` must
 * come after those two there once both are merged.
 */
const linkPermission = {
  key: "link.manage",
  id: "00000000-0000-4000-b000-000000000087",
  roles: ["admin", "instructor"],
} as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into permissions (id, permission_key, domain, description)
    values (
      ${linkPermission.id}::uuid,
      ${linkPermission.key},
      'link',
      ${`Permission to perform ${linkPermission.key}`}
    )
    on conflict do nothing
  `.execute(database);
  for (const role of linkPermission.roles) {
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${linkPermission.key}
      where roles.name = ${role}
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists short_links (
      id uuid primary key default gen_random_uuid(),
      path text not null check (path ~ '^(/[a-z0-9][a-z0-9._-]{0,63}){1,3}$'),
      destination text not null check (destination like 'https://%'),
      mode text not null default 'redirect' check (mode in ('redirect', 'rewrite')),
      redirect_status smallint not null default 302 check (redirect_status in (301, 302)),
      is_active boolean not null default true,
      visit_count bigint not null default 0,
      last_visited_at timestamptz,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  await sql`
    create unique index if not exists short_links_path_key on short_links (path)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists short_links`.execute(database);
  await sql`
    delete from permissions where permission_key = ${linkPermission.key}
  `.execute(database);
}
