import { sql, type Kysely } from "kysely";

/**
 * "Import from YouTube" in the lesson editor: one job row per imported
 * video, claimed by the API's background worker with FOR UPDATE SKIP LOCKED
 * and a lease, so several API instances never work the same import and a
 * crashed instance's import is picked up again once its lease runs out.
 *
 * Also adds the `lesson.video.import_youtube` permission (position 71 in
 * the contracts list, the seed's id scheme) and grants it to admin only.
 */
const permissionKey = "lesson.video.import_youtube";
const permissionId = "00000000-0000-4000-b000-000000000071";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into permissions (id, permission_key, domain, description)
    values (
      ${permissionId}::uuid,
      ${permissionKey},
      'lesson',
      ${`Permission to perform ${permissionKey}`}
    )
    on conflict do nothing
  `.execute(database);
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key = ${permissionKey}
    where roles.name = 'admin'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);

  await sql`
    create table if not exists youtube_import_jobs (
      id uuid primary key,
      media_id uuid not null unique references media_assets (id) on delete cascade,
      owner_id uuid not null references users (id) on delete cascade,
      course_id uuid references courses (id) on delete cascade,
      lesson_id uuid references course_lessons (id) on delete set null,
      -- The lesson's video when the import started (null: none). The
      -- finished import replaces it only if the lesson still holds it.
      replaces_media_id uuid,
      source_url text not null,
      youtube_id text not null,
      status text not null default 'queued',
      completed_stage text,
      stage_detail text,
      progress_percent integer not null default 0,
      title text,
      duration_seconds integer,
      qualities jsonb not null default '[]'::jsonb,
      attempts integer not null default 0,
      max_attempts integer not null default 3,
      error_message text,
      cancel_requested boolean not null default false,
      lease_owner text,
      lease_expires_at timestamptz,
      scratch_dir text,
      created_at timestamptz not null default current_timestamp,
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz not null default current_timestamp,
      constraint youtube_import_jobs_status_valid check (status in (
        'queued', 'resolving', 'downloading', 'packaging', 'uploading',
        'finalizing', 'completed', 'failed', 'cancelled'
      )),
      constraint youtube_import_jobs_stage_valid check (
        completed_stage is null
        or completed_stage in ('resolved', 'downloaded', 'packaged', 'uploaded')
      ),
      constraint youtube_import_jobs_progress_range check (
        progress_percent between 0 and 100
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_youtube_import_jobs_queue
      on youtube_import_jobs (status, created_at)
  `.execute(database);
  // Reuse lookups: "has this owner already imported this video?"
  await sql`
    create index if not exists idx_youtube_import_jobs_owner_video
      on youtube_import_jobs (owner_id, youtube_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists youtube_import_jobs`.execute(database);
  await sql`
    delete from role_permissions
    using permissions
    where role_permissions.permission_id = permissions.id
      and permissions.permission_key = ${permissionKey}
  `.execute(database);
  await sql`
    delete from permissions where permission_key = ${permissionKey}
  `.execute(database);
}
