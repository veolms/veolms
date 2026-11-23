import { sql, type Kysely } from "kysely";

/**
 * Coding Lab v2 and the first AI feature.
 *
 * AI (API module `ai`), shared by every AI feature:
 * - `ai_settings`: one row. Whether AI is on, the provider and model, the
 *   provider key (encrypted with the server's secret key, like payment
 *   gateway secrets; only its last four characters are ever shown) and an
 *   optional monthly budget. Admins change it in Platform → AI.
 * - `ai_usage`: one row per call to the provider: who, which feature, the
 *   tokens and what they cost. The budget is summed from it.
 *
 * Coding practice:
 * - versions get an `editorial` (how the answer works, shown to learners by
 *   the question's solution policy);
 * - exercises get `topics` (list filters) and `created_with_ai`;
 * - learner state keeps active coding seconds, when they last counted, and
 *   the fastest passing solve; submissions keep the solve time the
 *   learner's timer showed.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists ai_settings (
      id boolean primary key default true check (id),
      enabled boolean not null default false,
      provider text not null default 'anthropic',
      model text not null default 'claude-opus-5-5',
      api_key_encrypted text,
      api_key_last4 text,
      monthly_budget_usd numeric(10, 2),
      updated_by uuid references users (id) on delete set null,
      updated_at timestamptz not null default current_timestamp,
      constraint ai_settings_provider_length check (char_length(provider) <= 40),
      constraint ai_settings_model_length check (char_length(model) <= 80),
      constraint ai_settings_budget_valid check (
        monthly_budget_usd is null or monthly_budget_usd >= 0
      )
    )
  `.execute(database);

  await sql`
    create table if not exists ai_usage (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references users (id) on delete set null,
      feature text not null,
      provider text not null,
      model text not null,
      status text not null,
      error_code text,
      subject_id uuid,
      input_tokens integer not null default 0,
      output_tokens integer not null default 0,
      cache_read_tokens integer not null default 0,
      cache_write_tokens integer not null default 0,
      cost_usd numeric(12, 6) not null default 0,
      duration_ms integer not null default 0,
      created_at timestamptz not null default current_timestamp,
      constraint ai_usage_status_valid check (
        status in ('ok', 'error', 'refused', 'cancelled')
      )
    )
  `.execute(database);
  await sql`
    create index if not exists idx_ai_usage_created
      on ai_usage (created_at desc)
  `.execute(database);
  await sql`
    create index if not exists idx_ai_usage_user_created
      on ai_usage (user_id, created_at desc)
  `.execute(database);

  await sql`
    alter table coding_exercise_versions
      add column if not exists editorial text not null default ''
  `.execute(database);
  await sql`
    alter table coding_exercises
      add column if not exists topics text[] not null default '{}',
      add column if not exists created_with_ai boolean not null default false
  `.execute(database);
  await sql`
    alter table coding_learner_states
      add column if not exists active_seconds integer not null default 0,
      add column if not exists last_activity_at timestamptz,
      add column if not exists best_solve_seconds integer
  `.execute(database);
  await sql`
    alter table coding_submissions
      add column if not exists solve_seconds integer
  `.execute(database);
  // The learner's practice calendar and streak read their submissions by day.
  await sql`
    create index if not exists idx_coding_submissions_user_created
      on coding_submissions (user_id, created_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_coding_submissions_user_created`.execute(
    database,
  );
  await sql`alter table coding_submissions drop column if exists solve_seconds`.execute(
    database,
  );
  await sql`
    alter table coding_learner_states
      drop column if exists best_solve_seconds,
      drop column if exists last_activity_at,
      drop column if exists active_seconds
  `.execute(database);
  await sql`
    alter table coding_exercises
      drop column if exists created_with_ai,
      drop column if exists topics
  `.execute(database);
  await sql`alter table coding_exercise_versions drop column if exists editorial`.execute(
    database,
  );
  await sql`drop table if exists ai_usage`.execute(database);
  await sql`drop table if exists ai_settings`.execute(database);
}
