import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

export interface HomePageSettingsRow {
  settings: unknown;
  updatedAt: Date;
}

/** The PostgreSQL "undefined_table" code: the settings migration has not run yet. */
const UNDEFINED_TABLE = "42P01";

export function isMissingHomePageSettingsTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNDEFINED_TABLE
  );
}

/** The single settings row of the academy, or null when nothing was saved yet. */
export async function findHomePageSettings(
  database: Kysely<Database>,
): Promise<HomePageSettingsRow | null> {
  const row = await database
    .selectFrom("home_page_settings")
    .select(["settings", "updated_at"])
    .where("id", "=", true)
    .executeTakeFirst();

  return row ? { settings: row.settings, updatedAt: row.updated_at } : null;
}

export async function saveHomePageSettings(
  database: Kysely<Database>,
  input: { settings: unknown; updatedBy: string | null },
): Promise<HomePageSettingsRow> {
  const settings = JSON.stringify(input.settings);
  const row = await database
    .insertInto("home_page_settings")
    .values({
      id: true,
      settings: sql`${settings}::jsonb`,
      updated_by: input.updatedBy,
    })
    .onConflict((conflict) =>
      conflict.column("id").doUpdateSet({
        settings: sql`${settings}::jsonb`,
        updated_by: input.updatedBy,
        updated_at: sql`current_timestamp`,
      }),
    )
    .returning(["settings", "updated_at"])
    .executeTakeFirstOrThrow();

  return { settings: row.settings, updatedAt: row.updated_at };
}
