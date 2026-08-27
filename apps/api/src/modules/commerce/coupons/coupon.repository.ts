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
    .onConflict((oc) => oc.columns(["coupon_id", "order_id"]).doNothing())
    .returningAll()
    .executeTakeFirst(); // returns undefined if conflict — that is correct and expected
}

/**
 * Atomically checks the global usage limit and inserts a redemption.
 * Locks the coupon row with SELECT FOR UPDATE to prevent concurrent over-redemption.
 * Returns the inserted row, or undefined if already at the limit or duplicate.
 * Must be called inside a transaction.
 */
export async function insertCouponRedemptionIfLimitNotReached(
  database: Executor,
  values: {
    id: string;
    coupon_id: string;
    user_id: string;
    order_id: string;
    discount_amount: number;
    global_usage_limit: number | null;
    created_at?: Date;
  },
) {
  const { global_usage_limit, ...insertValues } = values;

  if (global_usage_limit !== null) {
    // Lock the coupon row to serialize concurrent limit checks
    await database
      .selectFrom("coupons")
      .select("id")
      .where("id", "=", values.coupon_id)
      .forUpdate()
      .executeTakeFirst();

    const countResult = await database
      .selectFrom("coupon_redemptions")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("coupon_id", "=", values.coupon_id)
      .executeTakeFirst();

    const currentCount = Number(countResult?.count ?? 0);
    if (currentCount >= global_usage_limit) {
      return undefined;
    }
  }

  return await database
    .insertInto("coupon_redemptions")
    .values(insertValues)
    .onConflict((oc) => oc.columns(["coupon_id", "order_id"]).doNothing())
    .returningAll()
    .executeTakeFirst();
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

export async function listCoupons(database: Executor) {
  return await database
    .selectFrom("coupons")
    .selectAll()
    .orderBy("created_at", "desc")
    .execute();
}

export async function updateCoupon(
  database: Executor,
  couponId: string,
  updates: {
    description?: string | null;
    discount_type?: CouponDiscountType;
    discount_value?: number;
    max_discount_amount?: number | null;
    min_order_amount?: number;
    starts_at?: Date;
    expires_at?: Date;
    global_usage_limit?: number | null;
    per_user_limit?: number;
    is_active?: boolean;
    restricted_course_ids?: string[] | null;
    restricted_bundle_ids?: string[] | null;
    updated_at?: Date;
  },
) {
  return await database
    .updateTable("coupons")
    .set({
      ...updates,
      updated_at: new Date(),
    })
    .where("id", "=", couponId)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteCoupon(database: Executor, couponId: string) {
  return await database
    .deleteFrom("coupons")
    .where("id", "=", couponId)
    .executeTakeFirst();
}
