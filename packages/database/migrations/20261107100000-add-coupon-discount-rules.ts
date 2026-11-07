import { sql, type Kysely } from "kysely";

/**
 * One coupon, a different discount per course or bundle: HAPPYDIWALI at 40%
 * on one course and 50% on another. A rule gives one target its own
 * discount; the coupon's own discount stays the default for every other item
 * it applies to. Which items a coupon applies to is still decided by its
 * restrictions, so a rule never widens a coupon.
 *
 * No foreign key to the target: it is a course or a bundle. A rule for a
 * deleted target simply never matches an item.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists coupon_discount_rules (
      id uuid primary key,
      coupon_id uuid not null references coupons(id) on delete cascade,
      target_type text not null,
      target_id uuid not null,
      discount_type text not null,
      discount_value integer not null,
      max_discount_amount integer,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint coupon_discount_rules_target_type_valid
        check (target_type in ('course', 'bundle')),
      constraint coupon_discount_rules_discount_type_valid
        check (discount_type in ('percentage', 'fixed')),
      constraint coupon_discount_rules_value_valid
        check (
          discount_value > 0
          and (discount_type <> 'percentage' or discount_value <= 100)
        ),
      constraint coupon_discount_rules_max_positive
        check (max_discount_amount is null or max_discount_amount > 0),
      constraint coupon_discount_rules_target_unique
        unique (coupon_id, target_type, target_id)
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists coupon_discount_rules`.execute(database);
}
