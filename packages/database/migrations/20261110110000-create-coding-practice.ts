import { sql, type Kysely } from "kysely";

/**
 * Coding practice: exercises learners solve in the browser. The plan and its
 * decisions: CODING_PRACTICE_PLAN.md (section 4).
 *
 * - `coding_exercises`: the library; content lives in versions.
 * - `coding_exercise_versions`: statement, files, tests, hints and settings.
 *   A version is frozen once published; `suite_hash` fingerprints what the
 *   tests check, so a submission graded against other tests is refused.
 * - `coding_assignments`: where learners find an exercise, pinned to a
 *   published version (null while it is a draft: learners don't see it).
 *   Every exercise has one course-wide row (no lecture: the course's
 *   practice list) and may have one per lecture it is shown under.
 * - `coding_drafts`: a learner's unsubmitted code, saved when they leave.
 * - `coding_submissions`: every submit; code is kept on passing ones and the
 *   latest few failed ones (older failed rows lose `files` and `results`).
 * - `coding_learner_states`: one row per learner per lesson, read on every
 *   open; `first_passed_at` is what completes the lesson.
 *
 * Adds `coding.read` and `coding.manage`. Rows are matched by key, as the
 * seed does. The preferred ids follow the workshops permissions (85 and 86,
 * another branch); if an id is already taken, a random one is used, so the
 * order in which branches merge never stops the permissions being added.
 */
const codingPermissions = [
  {
    key: "coding.read",
    id: "00000000-0000-4000-b000-000000000087",
    roles: [
      "admin",
      "course_manager",
      "content_editor",
      "instructor",
      "teaching_assistant",
      "reviewer",
      "veolms_team",
    ],
  },
  {
    key: "coding.manage",
    id: "00000000-0000-4000-b000-000000000088",
    roles: ["admin", "course_manager", "content_editor", "instructor"],
  },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of codingPermissions) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      select
        case
          when exists (select 1 from permissions where id = ${permission.id}::uuid)
            then gen_random_uuid()
          else ${permission.id}::uuid
        end,
        ${permission.key},
        'coding',
        ${`Permission to perform ${permission.key}`}
      on conflict (permission_key) do nothing
    `.execute(database);
    for (const role of permission.roles) {
      await sql`
        insert into role_permissions (role_id, permission_id, effect)
        select roles.id, permissions.id, 'allow'
        from roles
        join permissions on permissions.permission_key = ${permission.key}
        where roles.name = ${role}
        on conflict (role_id, permission_id) do update set effect = 'allow'
      `.execute(database);
    }
  }

  await sql`
    create table if not exists coding_exercises (
      id uuid primary key,
      academy_id uuid not null references academy (id) on delete cascade,
      course_id uuid not null references courses (id) on delete cascade,
      creator_id uuid not null references users (id) on delete cascade,
      title text not null,
      kind text not null,
      difficulty text not null default 'easy',
      estimated_minutes smallint not null default 10,
      status text not null default 'draft',
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      deleted_at timestamptz,
      constraint coding_exercises_kind_valid check (kind in ('function', 'web', 'react', 'node')),
      constraint coding_exercises_difficulty_valid check (difficulty in ('easy', 'medium', 'hard')),
      constraint coding_exercises_minutes_valid check (estimated_minutes between 1 and 240),
      constraint coding_exercises_status_valid check (status in ('draft', 'published', 'archived'))
    )
  `.execute(database);
  await sql`
    create index if not exists idx_coding_exercises_course
      on coding_exercises (course_id, updated_at desc)
      where deleted_at is null
  `.execute(database);

  await sql`
    create table if not exists coding_exercise_versions (
      id uuid primary key,
      exercise_id uuid not null references coding_exercises (id) on delete cascade,
      version_number integer not null,
      statement text not null default '',
      starter_files jsonb not null default '[]'::jsonb,
      solution_files jsonb not null default '[]'::jsonb,
      entry jsonb not null,
      tests jsonb not null,
      hints jsonb not null default '[]'::jsonb,
      settings jsonb not null default '{}'::jsonb,
      suite_hash text not null,
      validated_at timestamptz,
      published_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint coding_exercise_versions_number_unique unique (exercise_id, version_number),
      constraint coding_exercise_versions_published_validated check (
        published_at is null or validated_at is not null
      )
    )
  `.execute(database);

  await sql`
    create table if not exists coding_assignments (
      id uuid primary key,
      exercise_id uuid not null references coding_exercises (id) on delete cascade,
      exercise_version_id uuid references coding_exercise_versions (id),
      course_id uuid not null references courses (id) on delete cascade,
      lesson_id uuid references course_lessons (id) on delete cascade,
      required boolean not null default true,
      solution_policy text not null default 'after_failed_submits',
      solution_after_failed_submits smallint not null default 3,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint coding_assignments_lesson_exercise_unique unique (lesson_id, exercise_id),
      constraint coding_assignments_policy_valid check (
        solution_policy in ('after_pass', 'after_failed_submits', 'always', 'never')
      ),
      constraint coding_assignments_after_submits_valid check (
        solution_after_failed_submits between 1 and 50
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_coding_assignments_course
      on coding_assignments (course_id)
  `.execute(database);
  await sql`
    create index if not exists idx_coding_assignments_lesson
      on coding_assignments (lesson_id, created_at)
  `.execute(database);
  await sql`
    create unique index if not exists idx_coding_assignments_course_wide
      on coding_assignments (exercise_id)
      where lesson_id is null
  `.execute(database);
  await sql`
    create index if not exists idx_coding_assignments_exercise
      on coding_assignments (exercise_id)
  `.execute(database);

  await sql`
    create table if not exists coding_drafts (
      user_id uuid not null references users (id) on delete cascade,
      assignment_id uuid not null references coding_assignments (id) on delete cascade,
      exercise_version_id uuid not null,
      files jsonb not null,
      updated_at timestamptz not null default current_timestamp,
      primary key (user_id, assignment_id)
    )
  `.execute(database);

  await sql`
    create table if not exists coding_submissions (
      id uuid primary key,
      user_id uuid not null references users (id) on delete cascade,
      assignment_id uuid not null references coding_assignments (id) on delete cascade,
      exercise_version_id uuid not null,
      suite_hash text not null,
      passed boolean not null,
      passed_count smallint not null,
      total_count smallint not null,
      failed_test_ids text[] not null default '{}',
      files jsonb,
      results jsonb,
      duration_ms integer,
      created_at timestamptz not null default current_timestamp
    )
  `.execute(database);
  await sql`
    create index if not exists idx_coding_submissions_learner
      on coding_submissions (assignment_id, user_id, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists coding_learner_states (
      user_id uuid not null references users (id) on delete cascade,
      assignment_id uuid not null references coding_assignments (id) on delete cascade,
      attempts_count integer not null default 0,
      failed_attempts_count integer not null default 0,
      first_opened_at timestamptz not null default current_timestamp,
      first_passed_at timestamptz,
      passed_version_id uuid,
      solution_viewed_at timestamptz,
      solution_viewed_before_pass boolean not null default false,
      last_submitted_at timestamptz,
      updated_at timestamptz not null default current_timestamp,
      primary key (user_id, assignment_id)
    ) with (fillfactor = 85)
  `.execute(database);
  await sql`
    create index if not exists idx_coding_learner_states_assignment_passed
      on coding_learner_states (assignment_id)
      where first_passed_at is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists coding_learner_states`.execute(database);
  await sql`drop table if exists coding_submissions`.execute(database);
  await sql`drop table if exists coding_drafts`.execute(database);
  await sql`drop table if exists coding_assignments`.execute(database);
  await sql`drop table if exists coding_exercise_versions`.execute(database);
  await sql`drop table if exists coding_exercises`.execute(database);
  for (const permission of codingPermissions) {
    await sql`
      delete from role_permissions
      where permission_id in (
        select id from permissions where permission_key = ${permission.key}
      )
    `.execute(database);
    await sql`delete from permissions where permission_key = ${permission.key}`.execute(
      database,
    );
  }
}
