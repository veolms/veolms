import { sql, type Kysely } from "kysely";

/**
 * Courses that come free with another course.
 *
 * A row says: whoever holds `course_id` also holds `linked_course_id`. The
 * learner is not sold the linked course; their order names only the course
 * they bought. Access to the linked course is written as a grant and an
 * enrolment with source `linked_course` and no order, and is worked out
 * again whenever the learner's access to a course changes or a link is
 * added or removed (see linked-course-access in the access module). A row
 * of any other source is never touched by that, so a course the learner
 * bought on its own stays theirs when the link goes.
 *
 * Only one level: holding a linked course does not hand on that course's
 * own links.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists course_links (
      id uuid primary key default gen_random_uuid(),
      course_id uuid not null references courses (id) on delete cascade,
      linked_course_id uuid not null references courses (id) on delete cascade,
      position integer not null default 0,
      created_at timestamptz not null default current_timestamp,
      constraint course_links_unique unique (course_id, linked_course_id),
      constraint course_links_not_self check (course_id <> linked_course_id)
    )
  `.execute(database);

  // "Which courses give this one."
  await sql`
    create index if not exists idx_course_links_linked_course_id
      on course_links (linked_course_id)
  `.execute(database);

  await sql`
    alter table access_grants
      drop constraint if exists access_grants_source_valid
  `.execute(database);
  await sql`
    alter table access_grants
      add constraint access_grants_source_valid
      check (source in ('purchase', 'bundle_purchase', 'free_grant', 'admin_grant', 'linked_course'))
  `.execute(database);

  await sql`
    alter table enrollments
      drop constraint if exists enrollments_source_valid
  `.execute(database);
  await sql`
    alter table enrollments
      add constraint enrollments_source_valid
      check (source in ('direct_purchase', 'bundle_purchase', 'free_grant', 'admin_grant', 'linked_course'))
  `.execute(database);

  // Finding a learner's linked rows, and every learner holding one course
  // through a link.
  await sql`
    create index if not exists idx_access_grants_linked_course
      on access_grants (course_id, user_id)
      where source = 'linked_course'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Linked access has no order behind it; with the links gone it is revoked
  // rather than relabelled as something it was not.
  await sql`
    update access_grants
      set status = 'revoked', source = 'admin_grant', updated_at = now()
      where source = 'linked_course'
  `.execute(database);
  await sql`
    update enrollments
      set status = 'revoked', source = 'admin_grant', updated_at = now()
      where source = 'linked_course'
  `.execute(database);

  await sql`drop index if exists idx_access_grants_linked_course`.execute(
    database,
  );

  await sql`
    alter table access_grants
      drop constraint if exists access_grants_source_valid
  `.execute(database);
  await sql`
    alter table access_grants
      add constraint access_grants_source_valid
      check (source in ('purchase', 'bundle_purchase', 'free_grant', 'admin_grant'))
  `.execute(database);

  await sql`
    alter table enrollments
      drop constraint if exists enrollments_source_valid
  `.execute(database);
  await sql`
    alter table enrollments
      add constraint enrollments_source_valid
      check (source in ('direct_purchase', 'bundle_purchase', 'free_grant', 'admin_grant'))
  `.execute(database);

  await sql`drop table if exists course_links`.execute(database);
}
