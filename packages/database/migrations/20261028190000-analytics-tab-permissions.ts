import { sql, type Kysely } from "kysely";

/**
 * Analytics by tab, one role editor tick each. Until now "View course
 * analytics" opened every tab but Revenue, and the tabs the advanced
 * analytics plugin adds went with the revenue permission.
 *
 * - `analytics.overview.read` (position 72 in the contracts list, the seed's
 *   id scheme): the Overview tab and the Home dashboard's numbers. Every role
 *   that could see analytics keeps it.
 * - One key per plugin tab (positions 73 to 78). Every role holding the
 *   revenue permission, which opened those tabs, keeps them.
 */
const overview = {
  key: "analytics.overview.read",
  position: 72,
  grantedWith: ["analytics.course.read", "analytics.revenue.read"],
};
const pluginTabs = [
  "analytics.learning.read",
  "analytics.learners.read",
  "analytics.conversion.read",
  "analytics.delivery.read",
  "analytics.storage.read",
  "analytics.video_quality.read",
].map((key, index) => ({
  key,
  position: 73 + index,
  grantedWith: ["analytics.revenue.read"],
}));
const added = [overview, ...pluginTabs];

function permissionId(position: number): string {
  return `00000000-0000-4000-b000-${String(position).padStart(12, "0")}`;
}

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of added) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      values (
        ${permissionId(permission.position)}::uuid,
        ${permission.key},
        'analytics',
        ${`Permission to perform ${permission.key}`}
      )
      on conflict do nothing
    `.execute(database);
    const holders = sql.join(permission.grantedWith.map((key) => sql`${key}`));
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select distinct held.role_id, granted.id, 'allow'::text
      from role_permissions held
      join permissions existing on existing.id = held.permission_id
      join permissions granted on granted.permission_key = ${permission.key}
      where existing.permission_key in (${holders})
        and held.effect = 'allow'
      on conflict (role_id, permission_id) do nothing
    `.execute(database);
  }
  // Admin holds every permission.
  const keys = sql.join(added.map(({ key }) => sql`${key}`));
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key in (${keys})
    where roles.name = 'admin'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  const keys = sql.join(added.map(({ key }) => sql`${key}`));
  await sql`
    delete from permissions where permission_key in (${keys})
  `.execute(database);
}
