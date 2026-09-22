import { sql } from "kysely";
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

export type InsertCouponRedemptionResult =
  | {
      success: true;
      redemption: {
        id: string;
        coupon_id: string;
        user_id: string;
        order_id: string;
        discount_amount: number;
        created_at: Date;
      };
    }
  | { success: false; reason: "global_limit_reached" | "user_limit_reached" };

/**
 * Atomically checks the global and per-user usage limits and inserts a redemption.
 * Locks the coupon row with SELECT FOR UPDATE to prevent concurrent over-redemption across simultaneous requests.
 * Returns structured result indicating success or the specific limit reason that failed.
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
    per_user_limit?: number | null;
    created_at?: Date;
  },
): Promise<InsertCouponRedemptionResult> {
  const { global_usage_limit, per_user_limit, ...insertValues } = values;

  // Lock the coupon row to serialize concurrent limit checks
  await database
    .selectFrom("coupons")
    .select("id")
    .where("id", "=", values.coupon_id)
    .forUpdate()
    .executeTakeFirst();

  // If already redeemed for this exact order (e.g. idempotent retry), succeed with existing record
  const existingForOrder = await database
    .selectFrom("coupon_redemptions")
    .selectAll()
    .where("coupon_id", "=", values.coupon_id)
    .where("order_id", "=", values.order_id)
    .executeTakeFirst();

  if (existingForOrder) {
    return { success: true, redemption: existingForOrder };
  }

  if (global_usage_limit !== null && global_usage_limit !== undefined) {
    const globalCountResult = await database
      .selectFrom("coupon_redemptions")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("coupon_id", "=", values.coupon_id)
      .executeTakeFirst();

    const currentGlobalCount = Number(globalCountResult?.count ?? 0);
    if (currentGlobalCount >= global_usage_limit) {
      return { success: false, reason: "global_limit_reached" };
    }
  }

  if (per_user_limit !== null && per_user_limit !== undefined) {
    const userCountResult = await database
      .selectFrom("coupon_redemptions")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("coupon_id", "=", values.coupon_id)
      .where("user_id", "=", values.user_id)
      .executeTakeFirst();

    const currentUserCount = Number(userCountResult?.count ?? 0);
    if (currentUserCount >= per_user_limit) {
      return { success: false, reason: "user_limit_reached" };
    }
  }

  const inserted = await database
    .insertInto("coupon_redemptions")
    .values(insertValues)
    .onConflict((oc) => oc.columns(["coupon_id", "order_id"]).doNothing())
    .returningAll()
    .executeTakeFirst();

  if (inserted) {
    return { success: true, redemption: inserted };
  }

  const recheck = await database
    .selectFrom("coupon_redemptions")
    .selectAll()
    .where("coupon_id", "=", values.coupon_id)
    .where("order_id", "=", values.order_id)
    .executeTakeFirst();

  if (recheck) {
    return { success: true, redemption: recheck };
  }

  return { success: false, reason: "global_limit_reached" };
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

export async function listCouponRedemptionStats(
  database: Executor,
  couponIds?: string[],
) {
  if (couponIds !== undefined && couponIds.length === 0) {
    return [];
  }
  let query = database
    .selectFrom("coupon_redemptions")
    .select((eb) => [
      "coupon_id",
      eb.fn.countAll<number>().as("redemption_count"),
      eb.fn.sum<number>("discount_amount").as("total_discount_given"),
    ]);

  if (couponIds && couponIds.length > 0) {
    query = query.where("coupon_id", "in", couponIds);
  }

  return await query.groupBy("coupon_id").execute();
}

export async function getCouponRedemptionStats(
  database: Executor,
  couponId: string,
) {
  const result = await database
    .selectFrom("coupon_redemptions")
    .select((eb) => [
      "coupon_id",
      eb.fn.countAll<number>().as("redemption_count"),
      eb.fn.sum<number>("discount_amount").as("total_discount_given"),
    ])
    .where("coupon_id", "=", couponId)
    .executeTakeFirst();

  return {
    redemptionCount: Number(result?.redemption_count ?? 0),
    totalDiscountGiven: Number(result?.total_discount_given ?? 0),
  };
}

export interface ListCouponsRepositoryOptions {
  courseId?: string;
  cursor?: {
    createdAt: Date;
    id: string;
  };
  limit?: number;
}

export async function listCoupons(
  database: Executor,
  options?: ListCouponsRepositoryOptions,
) {
  let query = database.selectFrom("coupons").selectAll();

  if (options?.courseId) {
    const courseId = options.courseId;
    query = query.where(
      sql<boolean>`(
        restricted_course_ids is null
        or cardinality(restricted_course_ids) = 0
        or ${courseId}::uuid = any(restricted_course_ids)
      )`,
    );
  }

  if (options?.cursor) {
    const cursor = options.cursor;
    query = query.where(
      sql<boolean>`(
        created_at < ${cursor.createdAt}
        or (created_at = ${cursor.createdAt} and id < ${cursor.id}::uuid)
      )`,
    );
  }

  const limit = options?.limit ?? 30;

  return await query
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit + 1)
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

export async function getCouponOverallSummary(
  database: Executor,
  options?: { courseId?: string },
) {
  let query = database.selectFrom("coupons");
  if (options?.courseId) {
    const courseId = options.courseId;
    query = query.where(
      sql<boolean>`(
        restricted_course_ids is null
        or cardinality(restricted_course_ids) = 0
        or ${courseId}::uuid = any(restricted_course_ids)
      )`,
    );
  }

  const coupons = await query
    .select(["id", "is_active", "starts_at", "expires_at"])
    .execute();

  const totalCount = coupons.length;
  const now = Date.now();
  let activeCount = 0;
  let scheduledCount = 0;
  let expiredCount = 0;
  let inactiveCount = 0;

  for (const c of coupons) {
    if (!c.is_active) {
      inactiveCount += 1;
    } else {
      const startsAt = new Date(c.starts_at).getTime();
      const expiresAt = new Date(c.expires_at).getTime();
      if (startsAt > now) {
        scheduledCount += 1;
      } else if (expiresAt < now) {
        expiredCount += 1;
      } else {
        activeCount += 1;
      }
    }
  }

  let totalRedemptions = 0;
  let totalDiscountGiven = 0;

  if (coupons.length > 0) {
    const couponIds = coupons.map((c) => c.id);
    const redemptionStats = await database
      .selectFrom("coupon_redemptions")
      .select([
        sql<number>`count(*)::int`.as("total_redemptions"),
        sql<number>`coalesce(sum(discount_amount), 0)::int`.as("total_discount_given"),
      ])
      .where("coupon_id", "in", couponIds)
      .executeTakeFirst();

    totalRedemptions = Number(redemptionStats?.total_redemptions ?? 0);
    totalDiscountGiven = Number(redemptionStats?.total_discount_given ?? 0);
  }

  return {
    totalCount,
    activeCount,
    scheduledCount,
    expiredCount,
    inactiveCount,
    totalRedemptions,
    totalDiscountGiven,
  };
}
