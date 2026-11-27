import { sql, type Kysely } from "kysely";

/**
 * The badge and the background of the built-in certificate can be uploaded
 * in Platform > Certificates, like the signature: a PNG or JPEG under
 * `protected/certificate-badges/` or `protected/certificate-backgrounds/`,
 * or none (the design's own).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table certificate_academy_settings
      add column if not exists badge_key text,
      add column if not exists badge_content_type text
        check (badge_content_type in ('image/png', 'image/jpeg')),
      add column if not exists background_key text,
      add column if not exists background_content_type text
        check (background_content_type in ('image/png', 'image/jpeg'))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table certificate_academy_settings
      drop column if exists badge_key,
      drop column if exists badge_content_type,
      drop column if exists background_key,
      drop column if exists background_content_type
  `.execute(database);
}
