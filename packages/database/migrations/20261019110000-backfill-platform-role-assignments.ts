import { sql, type Kysely } from "kysely";

/**
 * `role_assignments` becomes the table that grants access. Signups kept
 * writing only `user_roles` after the 2026-09-17 sync, so copy those rows
 * across again, then make each platform or course grant unique so the dual
 * write can use ON CONFLICT DO NOTHING.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_assignments (id, user_id, role_id, scope_type, course_id, created_at)
    select gen_random_uuid(), ur.user_id, ur.role_id, 'platform', null, current_timestamp
    from user_roles ur
    where not exists (
      select 1 from role_assignments ra
      where ra.user_id = ur.user_id
        and ra.role_id = ur.role_id
        and ra.scope_type = 'platform'
    )
  `.execute(database);

  await sql`
    create unique index if not exists role_assignments_platform_key
      on role_assignments (user_id, role_id)
      where scope_type = 'platform'
  `.execute(database);
  await sql`
    create unique index if not exists role_assignments_course_key
      on role_assignments (user_id, role_id, course_id)
      where scope_type = 'course'
  `.execute(database);
  // Member counts per role and "who holds admin" both look up by role.
  await sql`
    create index if not exists role_assignments_role_idx
      on role_assignments (role_id)
  `.execute(database);

  // A role whose course permissions reach only the courses its holder
  // created. Instructors hold course.* platform-wide so the route checks
  // pass, but must never act on another instructor's course.
  await sql`
    alter table roles
      add column if not exists own_courses_only boolean not null default false
  `.execute(database);
  await sql`
    update roles set own_courses_only = true where name = 'instructor'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table roles drop column if exists own_courses_only`.execute(
    database,
  );
  await sql`drop index if exists role_assignments_role_idx`.execute(database);
  await sql`drop index if exists role_assignments_course_key`.execute(database);
  await sql`drop index if exists role_assignments_platform_key`.execute(
    database,
  );
}
