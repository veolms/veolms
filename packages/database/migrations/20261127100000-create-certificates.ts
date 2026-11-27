import { sql, type Kysely } from "kysely";

/**
 * Course certificates (certificates/CERTIFICATES_PLAN.md in the planning
 * folder; summary in apps/api/src/modules/certificates/README.md).
 *
 * - `certificates`: one row per issued certificate, never deleted. What is
 *   printed (name, course title, academy, date) is a snapshot taken when the
 *   learner claims it, so later course renames, curriculum changes or a lower
 *   progress do not change it. `public_code` is the 16-character Crockford
 *   base32 code (80 random bits) the verify page and QR code use. A learner
 *   has at most one active certificate per course.
 * - `certificate_unlocks`: the first time a learner was seen at or above the
 *   course's threshold. Course progress is computed live and can go down
 *   (lessons added, a video attached resets a lesson), so an unlock that was
 *   reached is kept until the learner claims it.
 * - `certificate_events`: what happened to each certificate, and who did it.
 * - `course_certificate_settings`: the completion percentage a course asks
 *   for (90 when there is no row). `course_settings.certificate_enabled`
 *   stays the on/off switch.
 *
 * The course and learner references are `on delete set null`: purging a
 * deleted course (course-deletion.repository.ts deletes from `courses`) or a
 * learner's account must not take issued certificates with it.
 *
 * `certificate.issue` and `certificate.revoke` already exist in
 * `permissions` (the seed has always had them, reserved until now).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists certificates (
      id uuid primary key,
      public_code text not null check (public_code ~ '^[0-9A-Z]{16,32}$'),
      user_id uuid references users (id) on delete set null,
      course_id uuid references courses (id) on delete set null,
      status text not null default 'active' check (status in ('active', 'revoked')),
      revision integer not null default 1 check (revision >= 1),
      recipient_name text not null check (char_length(recipient_name) between 1 and 120),
      course_title text not null,
      course_slug text,
      academy_name text not null,
      site_origin text not null,
      template_key text not null,
      template_version integer not null,
      issued_on date not null,
      issued_at timestamptz not null,
      issued_by uuid references users (id) on delete set null,
      rule_snapshot jsonb not null,
      revoked_at timestamptz,
      revoked_by uuid references users (id) on delete set null,
      revoke_reason text,
      name_corrections integer not null default 0,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  await sql`
    create unique index if not exists certificates_public_code_key
      on certificates (public_code)
  `.execute(database);
  // At most one live certificate per learner and course: a second claim
  // (double click, two tabs, two API servers) finds the first one.
  await sql`
    create unique index if not exists certificates_one_active_per_course
      on certificates (user_id, course_id) where status = 'active'
  `.execute(database);
  await sql`
    create index if not exists certificates_course_issued_idx
      on certificates (course_id, issued_at desc)
  `.execute(database);
  await sql`
    create index if not exists certificates_user_issued_idx
      on certificates (user_id, issued_at desc)
  `.execute(database);

  await sql`
    create table if not exists certificate_unlocks (
      user_id uuid not null references users (id) on delete cascade,
      course_id uuid not null references courses (id) on delete cascade,
      unlocked_at timestamptz not null default current_timestamp,
      percent numeric(5, 2) not null,
      primary key (user_id, course_id)
    )
  `.execute(database);

  await sql`
    create table if not exists certificate_events (
      id uuid primary key,
      certificate_id uuid not null references certificates (id) on delete cascade,
      type text not null check (
        type in ('issued', 'name_corrected', 'revoked', 'restored')
      ),
      actor_id uuid references users (id) on delete set null,
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    )
  `.execute(database);
  await sql`
    create index if not exists certificate_events_certificate_idx
      on certificate_events (certificate_id, created_at)
  `.execute(database);

  await sql`
    create table if not exists course_certificate_settings (
      course_id uuid primary key references courses (id) on delete cascade,
      threshold_percent integer not null default 90
        check (threshold_percent between 50 and 100),
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists course_certificate_settings`.execute(database);
  await sql`drop table if exists certificate_events`.execute(database);
  await sql`drop table if exists certificate_unlocks`.execute(database);
  await sql`drop table if exists certificates`.execute(database);
}
