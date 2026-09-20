import { sql, type Kysely } from "kysely";

/**
 * Restricts user avatars storage to strictly the 2 most recently used
 * uploaded avatars and 1 Google synced avatar. Evicts any older uploaded
 * avatars and any non-Google provider avatars.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Delete any provider avatars other than Google (e.g. legacy GitHub entries)
  await sql`
    DELETE FROM user_avatars
    WHERE source NOT IN ('upload', 'google')
  `.execute(database);

  // 2. Retain strictly the 2 most recently used uploaded avatars per user
  await sql`
    DELETE FROM user_avatars
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY last_used_at DESC, created_at DESC, id DESC
        ) AS rn
        FROM user_avatars
        WHERE source = 'upload'
      ) ranked
      WHERE ranked.rn > 2
    )
  `.execute(database);

  // 3. Update check constraint to strictly allow 'upload' and 'google'
  await sql`
    ALTER TABLE user_avatars
    DROP CONSTRAINT IF EXISTS user_avatars_source_valid
  `.execute(database);

  await sql`
    ALTER TABLE user_avatars
    ADD CONSTRAINT user_avatars_source_valid
    CHECK (source IN ('upload', 'google'))
  `.execute(database);

  // 4. Index for fast ordered lookup by last_used_at
  await database.schema
    .createIndex("idx_user_avatars_user_source_last_used")
    .ifNotExists()
    .on("user_avatars")
    .columns(["user_id", "source", "last_used_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("idx_user_avatars_user_source_last_used")
    .ifExists()
    .execute();

  await sql`
    ALTER TABLE user_avatars
    DROP CONSTRAINT IF EXISTS user_avatars_source_valid
  `.execute(database);

  await sql`
    ALTER TABLE user_avatars
    ADD CONSTRAINT user_avatars_source_valid
    CHECK (source IN ('upload', 'google', 'github'))
  `.execute(database);
}
