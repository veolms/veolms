import { sql, type Kysely } from "kysely";

/**
 * A course that is only ever had through another course's link
 * (`course_links`): it has no price, it is not sold, and it is left out of
 * the catalogue, the home rows and the prerendered pages. Learners get it
 * as linked access when they hold a course linking it.
 *
 * The API keeps such a course free (both prices zero) and its access rule
 * restricted, so every existing rule already treats it as entered by a
 * grant only: checkout refuses it and nobody can enrol themselves.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing
      add column if not exists linked_only boolean not null default false
  `.execute(database);
  await sql`
    alter table course_pricing
      drop constraint if exists course_pricing_linked_only_free
  `.execute(database);
  await sql`
    alter table course_pricing
      add constraint course_pricing_linked_only_free
      check (not linked_only or (price = 0 and sale_price = 0))
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing
      drop constraint if exists course_pricing_linked_only_free
  `.execute(database);
  await sql`
    alter table course_pricing drop column if exists linked_only
  `.execute(database);
}
