import type {
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
  const [total, byFeature, byPerson] = await Promise.all([
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
  return { total, byFeature, byPerson };
}
