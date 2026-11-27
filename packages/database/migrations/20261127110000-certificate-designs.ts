import { sql, type Kysely } from "kysely";

/**
 * Certificate designs: blank certificate sheets (a PDF, or a PNG or JPEG
 * image) that staff with `certificate.issue` upload in Platform >
 * Certificates. Each has its own `layout`: where the learner's name, the
 * course line, the date, the code and the verify QR code go, as fractions
 * of the page, with their font, size and colour.
 *
 * One design at a time is active (the partial unique index). Every
 * certificate PDF is drawn, when it is downloaded, on the active design;
 * with none active, on the built-in design that ships with the API.
 * Generated PDFs are never stored, only the uploaded blank sheet
 * (`storage_key`, under `protected/`).
 *
 * `certificates.design_id` records which design was active when a
 * certificate was issued (for the record; downloads use the active one).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists certificate_designs (
      id uuid primary key,
      name text not null check (char_length(name) between 1 and 80),
      storage_key text not null,
      content_type text not null
        check (content_type in ('application/pdf', 'image/png', 'image/jpeg')),
      file_size integer not null check (file_size > 0),
      page_width numeric(8, 2) not null check (page_width > 0),
      page_height numeric(8, 2) not null check (page_height > 0),
      layout jsonb not null,
      is_active boolean not null default false,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      deleted_at timestamptz
    )
  `.execute(database);
  await sql`
    create unique index if not exists certificate_designs_one_active
      on certificate_designs ((true)) where is_active and deleted_at is null
  `.execute(database);
  await sql`
    alter table certificates
      add column if not exists design_id uuid
        references certificate_designs (id) on delete set null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`alter table certificates drop column if exists design_id`.execute(
    database,
  );
  await sql`drop table if exists certificate_designs`.execute(database);
}
