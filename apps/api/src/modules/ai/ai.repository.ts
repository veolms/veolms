import type {
  AiCustomModelTable,
  AiProviderKeyTable,
  AiSettingsTable,
  AiUsageTable,
  DatabaseExecutor,
} from "@veolms/database";
import { sql, type Insertable, type Updateable } from "kysely";

export function findSettings(database: DatabaseExecutor) {
  return database
    .selectFrom("ai_settings")
    .selectAll()
    .where("id", "=", true)
    .executeTakeFirst();
}

export async function saveSettings(
  database: DatabaseExecutor,
  values: Updateable<AiSettingsTable>,
) {
  await database
    .insertInto("ai_settings")
    .values({ id: true, ...values } as Insertable<AiSettingsTable>)
    .onConflict((conflict) =>
      conflict
        .column("id")
        .doUpdateSet({ ...values, updated_at: sql`current_timestamp` }),
    )
    .execute();
}

export async function insertUsage(
  database: DatabaseExecutor,
  values: Insertable<AiUsageTable>,
) {
  await database.insertInto("ai_usage").values(values).execute();
}

/** What calls cost since `since`, in US dollars. */
export async function spendSince(database: DatabaseExecutor, since: Date) {
  const row = await database
    .selectFrom("ai_usage")
    .select(sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"))
    .where("created_at", ">=", since)
    .executeTakeFirst();
  return Number(row?.cost ?? 0);
}

/** One person's calls of one feature since `since` (their rate limit). */
export async function countCallsSince(
  database: DatabaseExecutor,
  userId: string,
  since: Date,
) {
  const row = await database
    .selectFrom("ai_usage")
    .select(sql<string>`count(*)`.as("calls"))
    .where("user_id", "=", userId)
    .where("created_at", ">=", since)
    .executeTakeFirst();
  return Number(row?.calls ?? 0);
}

export async function usageSince(database: DatabaseExecutor, since: Date) {
  const [total, byFeature, byModel, byPerson] = await Promise.all([
    database
      .selectFrom("ai_usage")
      .select([
        sql<string>`count(*)`.as("calls"),
        sql<string>`count(*) filter (where status <> 'ok')`.as("failed"),
        sql<string>`coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0)`.as(
          "input_tokens",
        ),
        sql<string>`coalesce(sum(output_tokens), 0)`.as("output_tokens"),
        sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"),
      ])
      .where("created_at", ">=", since)
      .executeTakeFirst(),
    database
      .selectFrom("ai_usage")
      .select([
        "feature",
        sql<string>`count(*)`.as("calls"),
        sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"),
      ])
      .where("created_at", ">=", since)
      .groupBy("feature")
      .orderBy("feature")
      .execute(),
    database
      .selectFrom("ai_usage")
      .select([
        "provider",
        "model",
        sql<string>`count(*)`.as("calls"),
        sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"),
      ])
      .where("created_at", ">=", since)
      .groupBy(["provider", "model"])
      .orderBy(sql`sum(cost_usd)`, "desc")
      .limit(20)
      .execute(),
    database
      .selectFrom("ai_usage")
      .select([
        "user_id",
        sql<string>`count(*)`.as("calls"),
        sql<string>`coalesce(sum(cost_usd), 0)`.as("cost"),
      ])
      .where("created_at", ">=", since)
      .groupBy("user_id")
      .orderBy(sql`sum(cost_usd)`, "desc")
      .limit(20)
      .execute(),
  ]);
  return { total, byFeature, byModel, byPerson };
}

export function listProviderKeys(database: DatabaseExecutor) {
  return database.selectFrom("ai_provider_keys").selectAll().execute();
}

/** Saves a provider's key (and workspace), or only its workspace. */
export async function saveProviderKey(
  database: DatabaseExecutor,
  values: Insertable<AiProviderKeyTable>,
) {
  const { provider: _provider, ...update } = values;
  await database
    .insertInto("ai_provider_keys")
    .values(values)
    .onConflict((conflict) =>
      conflict
        .column("provider")
        .doUpdateSet({ ...update, updated_at: sql`current_timestamp` }),
    )
    .execute();
}

export async function updateProviderWorkspace(
  database: DatabaseExecutor,
  provider: string,
  workspaceId: string | null,
  updatedBy: string,
) {
  const result = await database
    .updateTable("ai_provider_keys")
    .set({
      workspace_id: workspaceId,
      updated_by: updatedBy,
      updated_at: sql`current_timestamp`,
    })
    .where("provider", "=", provider)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function deleteProviderKey(
  database: DatabaseExecutor,
  provider: string,
) {
  await database
    .deleteFrom("ai_provider_keys")
    .where("provider", "=", provider)
    .execute();
}

export function listCustomModels(database: DatabaseExecutor) {
  return database
    .selectFrom("ai_custom_models")
    .selectAll()
    .orderBy("created_at")
    .execute();
}

export async function saveCustomModel(
  database: DatabaseExecutor,
  values: Insertable<AiCustomModelTable>,
) {
  const { id: _id, created_by: _by, ...update } = values;
  await database
    .insertInto("ai_custom_models")
    .values(values)
    .onConflict((conflict) => conflict.column("id").doUpdateSet(update))
    .execute();
}

export async function deleteCustomModel(
  database: DatabaseExecutor,
  id: string,
) {
  const result = await database
    .deleteFrom("ai_custom_models")
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
