import type { CouponDiscountType } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findCouponByCode(database: Executor, code: string) {
  return await database
    .selectFrom("coupons")
    .selectAll()
    .where("code", "=", code.toUpperCase())
    .executeTakeFirst();
}

export async function findCouponById(database: Executor, id: string) {
  return await database
    .selectFrom("coupons")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function countCouponRedemptionsGlobal(
  database: Executor,
  couponId: string,
) {
  const result = await database
    .selectFrom("coupon_redemptions")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("coupon_id", "=", couponId)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

export async function countCouponRedemptionsByUser(
  database: Executor,
  couponId: string,
  userId: string,
) {
  const result = await database
    .selectFrom("coupon_redemptions")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("coupon_id", "=", couponId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

export async function insertCouponRedemption(
  database: Executor,
  values: {
    id: string;
    coupon_id: string;
    user_id: string;
    order_id: string;
    discount_amount: number;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("coupon_redemptions")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertCoupon(
  database: Executor,
  values: {
    id: string;
    code: string;
    description?: string | null;
    discount_type: CouponDiscountType;
    discount_value: number;
    max_discount_amount?: number | null;
    min_order_amount?: number;
    starts_at: Date;
    expires_at: Date;
    global_usage_limit?: number | null;
    per_user_limit?: number;
    is_active?: boolean;
    restricted_course_ids?: string[] | null;
    restricted_bundle_ids?: string[] | null;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("coupons")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}
