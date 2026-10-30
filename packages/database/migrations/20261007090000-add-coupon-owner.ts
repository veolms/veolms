import { sql, type Kysely } from "kysely";

/**
 * Records who created a coupon.
 *
 * Coupons had no owner, so every staff role could list, create and edit
 * every coupon — an instructor could publish a 100%-off code for another
 * instructor's course. The API now limits non-admins to coupons they
 * created (and to their own courses).
 *
 * Nullable on purpose: existing coupons keep `created_by = null`, which the
 * API treats as admin-managed, and the old code keeps working during the
 * migrate-then-restart window.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table coupons
      add column if not exists created_by uuid
        references users(id) on delete set null
  `.execute(database);

  await sql`
    create index if not exists idx_coupons_created_by
      on coupons (created_by, created_at desc, id desc)
      where created_by is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_coupons_created_by`.execute(database);
  await sql`alter table coupons drop column if exists created_by`.execute(
    database,
  );
}
