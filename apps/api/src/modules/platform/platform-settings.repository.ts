import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

export interface PlatformSettingsRow {
  settings: unknown;
  updatedAt: Date;
}

/** The PostgreSQL "undefined_table" code: the settings migration has not run yet. */
const UNDEFINED_TABLE = "42P01";

export function isMissingPlatformSettingsTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNDEFINED_TABLE
  );
}

/** The single settings row of the academy, or null when nothing was saved yet. */
export async function findPlatformSettings(
  database: Kysely<Database>,
): Promise<PlatformSettingsRow | null> {
  const row = await database
    .selectFrom("platform_settings")
    .select(["settings", "updated_at"])
    .where("id", "=", true)
    .executeTakeFirst();

  return row ? { settings: row.settings, updatedAt: row.updated_at } : null;
}

export async function savePlatformSettings(
  database: Kysely<Database>,
  input: { settings: unknown; updatedBy: string | null },
): Promise<PlatformSettingsRow> {
  const settings = JSON.stringify(input.settings);
  const row = await database
    .insertInto("platform_settings")
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
