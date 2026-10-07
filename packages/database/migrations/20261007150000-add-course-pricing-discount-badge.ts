import { sql, type Kysely } from "kysely";

/**
 * Whether a course's cards show its discount as a badge ("20% off") beside
 * the price. Off unless the creator turns it on in the course's pricing
 * settings; the sale price itself is unaffected.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing
      add column if not exists show_discount_badge boolean not null default false
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing drop column if exists show_discount_badge
  `.execute(database);
}
