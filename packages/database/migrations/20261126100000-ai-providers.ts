import { sql, type Kysely } from "kysely";

/**
 * More than one AI provider (Claude, ChatGPT, Gemini, Grok).
 *
 * - `ai_provider_keys`: one row per connected provider: its key (encrypted
 *   with the server's secret key, only the last four characters shown) and,
 *   for Anthropic, the workspace a key made outside one must name. The key
 *   already saved in `ai_settings` is copied in as Anthropic's.
 * - `ai_custom_models`: models an admin added (a newer model, or a new
 *   price), with the price used for cost estimates.
 * - `ai_settings` gains the models behind Economy / Balanced / Best and the
 *   thinking effort ("auto": each feature decides).
 *
 * `ai_settings.api_key_*` and `workspace_id` stay: the API keeps Anthropic's
 * key there too, so an older API (a rollback) still finds it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists ai_provider_keys (
      provider text primary key,
      api_key_encrypted text not null,
      api_key_last4 text,
      workspace_id text,
      updated_by uuid references users (id) on delete set null,
      updated_at timestamptz not null default current_timestamp,
      constraint ai_provider_keys_provider_valid check (
        provider in ('anthropic', 'openai', 'gemini', 'xai')
      ),
      constraint ai_provider_keys_workspace_length check (
        workspace_id is null or char_length(workspace_id) <= 100
      )
    )
  `.execute(database);
  await sql`
    insert into ai_provider_keys
      (provider, api_key_encrypted, api_key_last4, workspace_id, updated_by)
    select 'anthropic', api_key_encrypted, api_key_last4, workspace_id, updated_by
    from ai_settings
    where api_key_encrypted is not null
    on conflict (provider) do nothing
  `.execute(database);

  await sql`
    create table if not exists ai_custom_models (
      id text primary key,
      provider text not null,
      label text not null,
      input_usd_per_million numeric(10, 4) not null,
      output_usd_per_million numeric(10, 4) not null,
      cache_read_usd_per_million numeric(10, 4) not null default 0,
      effort boolean not null default true,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      constraint ai_custom_models_provider_valid check (
        provider in ('anthropic', 'openai', 'gemini', 'xai')
      ),
      constraint ai_custom_models_id_length check (char_length(id) <= 80),
      constraint ai_custom_models_label_length check (char_length(label) <= 60),
      constraint ai_custom_models_prices_valid check (
        input_usd_per_million >= 0
        and output_usd_per_million >= 0
        and cache_read_usd_per_million >= 0
      )
    )
  `.execute(database);

  await sql`
    alter table ai_settings
      add column if not exists tier_models jsonb not null default '{}'::jsonb,
      add column if not exists effort text not null default 'auto'
  `.execute(database);
  await sql`
    alter table ai_settings
      drop constraint if exists ai_settings_effort_valid,
      add constraint ai_settings_effort_valid
        check (effort in ('auto', 'low', 'medium', 'high'))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ai_settings
      drop constraint if exists ai_settings_effort_valid,
      drop column if exists effort,
      drop column if exists tier_models
  `.execute(database);
  await sql`drop table if exists ai_custom_models`.execute(database);
  await sql`drop table if exists ai_provider_keys`.execute(database);
}
