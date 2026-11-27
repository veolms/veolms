import { sql, type Kysely } from "kysely";

/**
 * The academy's certificate settings (Platform > Certificates), one row at
 * most (`id` is always true):
 * - `threshold_percent`: the share of lessons a course asks for unless it
 *   sets its own (`course_certificate_settings`). 95 without a row.
 * - `auto_issue`: issue the certificate, and email it, as soon as a learner
 *   reaches the share. On without a row.
 * - `signature_key`: the uploaded signature printed on certificates (a PNG
 *   or JPEG under `protected/certificate-signatures/`), or none.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists certificate_academy_settings (
      id boolean primary key default true check (id),
      threshold_percent integer not null default 95
        check (threshold_percent between 50 and 100),
      auto_issue boolean not null default true,
      signature_key text,
      signature_content_type text
        check (signature_content_type in ('image/png', 'image/jpeg')),
      updated_by uuid references users (id) on delete set null,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists certificate_academy_settings`.execute(
    database,
  );
}
