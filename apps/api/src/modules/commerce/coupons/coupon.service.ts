import type {
  Coupon,
  CouponListResponse,
  CreateCouponRequest,
  ListCouponsQuery,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { AppError } from "../../../lib/errors.ts";
import * as couponRepo from "./coupon.repository.ts";

export interface CouponService {
  listCoupons(query?: ListCouponsQuery): Promise<CouponListResponse>;
  getCouponById(id: string): Promise<Coupon>;
  getCouponByCode(code: string): Promise<Coupon>;
  createCoupon(request: CreateCouponRequest): Promise<Coupon>;
  updateCoupon(id: string, request: UpdateCouponRequest): Promise<Coupon>;
  deleteCoupon(id: string): Promise<void>;
}

interface DecodedCouponCursor {
  createdAt: Date;
  id: string;
}

function encodeCouponCursor(cursor: DecodedCouponCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.createdAt.toISOString(), cursor.id]),
    "utf8",
  ).toString("base64url");
}

function decodeCouponCursor(value: string): DecodedCouponCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== "string" ||
      typeof decoded[1] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        decoded[1],
      )
    ) {
      throw new Error("Malformed cursor");
    }
    const createdAt = new Date(decoded[0]);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid date");
    return { createdAt, id: decoded[1] };
  } catch {
    throw new AppError(
      400,
      "INVALID_COUPON_CURSOR",
      "The coupon pagination cursor is invalid or expired.",
    );
  }
}

function assertValidWindow(startsAt: Date, expiresAt: Date) {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    throw new AppError(
      400,
      "INVALID_COUPON_DATES",
      "Coupon start and expiry dates must be valid.",
    );
  }
  if (startsAt >= expiresAt) {
    throw new AppError(
      400,
      "INVALID_COUPON_DATES",
      "Expiry date must be after the start date.",
    );
  }
}

export function createCouponService({
  database,
}: {
  database: Executor;
}): CouponService {
  function mapToCoupon(
    row: NonNullable<Awaited<ReturnType<typeof couponRepo.findCouponById>>>,
    usage?: { redemptionCount: number; totalDiscountGiven: number },
  ): Coupon {
    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxDiscountAmount: row.max_discount_amount,
      minOrderAmount: row.min_order_amount,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      globalUsageLimit: row.global_usage_limit,
      perUserLimit: row.per_user_limit,
      isActive: row.is_active,
      restrictedCourseIds: row.restricted_course_ids,
      restrictedBundleIds: row.restricted_bundle_ids,
      redemptionCount: usage?.redemptionCount ?? 0,
      totalDiscountGiven: usage?.totalDiscountGiven ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function attachUsage(
    row: NonNullable<Awaited<ReturnType<typeof couponRepo.findCouponById>>>,
  ): Promise<Coupon> {
    const usage = await couponRepo.getCouponRedemptionStats(database, row.id);
    return mapToCoupon(row, usage);
  }

  async function listCoupons(
    query?: ListCouponsQuery,
  ): Promise<CouponListResponse> {
    const limit = query?.limit ?? 30;
    const cursor = query?.cursor ? decodeCouponCursor(query.cursor) : undefined;

    const [rows, summary] = await Promise.all([
      couponRepo.listCoupons(database, {
        courseId: query?.courseId,
        cursor,
        limit,
      }),
      couponRepo.getCouponOverallSummary(database, {
        courseId: query?.courseId,
      }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const couponIds = pageRows.map((r) => r.id);
    const stats = await couponRepo.listCouponRedemptionStats(
      database,
      couponIds,
    );
    const usageById = new Map(
      stats.map((row) => [
        row.coupon_id,
        {
          redemptionCount: Number(row.redemption_count ?? 0),
          totalDiscountGiven: Number(row.total_discount_given ?? 0),
        },
      ]),
    );

    const items = pageRows.map((row) =>
      mapToCoupon(row, usageById.get(row.id)),
    );
    const lastRow = pageRows.at(-1);

    return {
      items,
      nextCursor:
        hasMore && lastRow
          ? encodeCouponCursor({
              createdAt: lastRow.created_at,
              id: lastRow.id,
            })
          : null,
      totalCount: summary.totalCount,
      summary,
    };
  }

  async function getCouponById(id: string): Promise<Coupon> {
    const coupon = await couponRepo.findCouponById(database, id);
    if (!coupon) {
      throw new AppError(
        404,
        "COUPON_NOT_FOUND",
        `Coupon with id "${id}" was not found.`,
      );
    }
    return attachUsage(coupon);
  }

  async function getCouponByCode(code: string): Promise<Coupon> {
    const coupon = await couponRepo.findCouponByCode(database, code);
    if (!coupon) {
      throw new AppError(
        404,
        "COUPON_NOT_FOUND",
        `Coupon "${code}" was not found.`,
      );
    }
    return attachUsage(coupon);
  }

  async function createCoupon(request: CreateCouponRequest): Promise<Coupon> {
    if (request.discountType === "percentage" && request.discountValue > 100) {
      throw new AppError(
        400,
        "INVALID_COUPON_DISCOUNT",
        "Percentage discount cannot exceed 100%.",
      );
    }

    assertValidWindow(new Date(request.startsAt), new Date(request.expiresAt));

    const existing = await couponRepo.findCouponByCode(database, request.code);
    if (existing) {
      throw new AppError(
        409,
        "COUPON_CODE_ALREADY_EXISTS",
        `Coupon code "${request.code}" already exists.`,
      );
    }

    const now = new Date();
    const created = await couponRepo.insertCoupon(database, {
      id: crypto.randomUUID(),
      code: request.code.toUpperCase(),
      description: request.description ?? null,
      discount_type: request.discountType,
      discount_value: request.discountValue,
      max_discount_amount: request.maxDiscountAmount ?? null,
      min_order_amount: request.minOrderAmount ?? 0,
      starts_at: new Date(request.startsAt),
      expires_at: new Date(request.expiresAt),
      global_usage_limit: request.globalUsageLimit ?? null,
      per_user_limit: request.perUserLimit ?? 1,
      is_active: request.isActive ?? true,
      restricted_course_ids: request.restrictedCourseIds ?? null,
      restricted_bundle_ids: request.restrictedBundleIds ?? null,
      created_at: now,
      updated_at: now,
    });

    return mapToCoupon(created);
  }

  async function updateCoupon(
    id: string,
    request: UpdateCouponRequest,
  ): Promise<Coupon> {
    const existing = await couponRepo.findCouponById(database, id);
    if (!existing) {
      throw new AppError(
        404,
        "COUPON_NOT_FOUND",
        `Coupon with id "${id}" was not found.`,
      );
    }

    const effectiveDiscountType = request.discountType ?? existing.discount_type;
    const effectiveDiscountValue =
      request.discountValue ?? existing.discount_value;
    if (effectiveDiscountType === "percentage" && effectiveDiscountValue > 100) {
      throw new AppError(
        400,
        "INVALID_COUPON_DISCOUNT",
        "Percentage discount cannot exceed 100%.",
      );
    }

    const nextStartsAt = request.startsAt
      ? new Date(request.startsAt)
      : existing.starts_at;
    const nextExpiresAt = request.expiresAt
      ? new Date(request.expiresAt)
      : existing.expires_at;
    assertValidWindow(nextStartsAt, nextExpiresAt);

    const updated = await couponRepo.updateCoupon(database, id, {
      description: request.description,
      discount_type: request.discountType,
      discount_value: request.discountValue,
      max_discount_amount: request.maxDiscountAmount,
      min_order_amount: request.minOrderAmount,
      starts_at: request.startsAt ? new Date(request.startsAt) : undefined,
      expires_at: request.expiresAt ? new Date(request.expiresAt) : undefined,
      global_usage_limit: request.globalUsageLimit,
      per_user_limit: request.perUserLimit,
      is_active: request.isActive,
      restricted_course_ids: request.restrictedCourseIds,
      restricted_bundle_ids: request.restrictedBundleIds,
    });

    if (!updated) {
      throw new AppError(
        404,
        "COUPON_NOT_FOUND",
        `Coupon with id "${id}" was not found.`,
      );
    }

    return attachUsage(updated);
  }

  async function deleteCoupon(id: string): Promise<void> {
    const existing = await couponRepo.findCouponById(database, id);
    if (!existing) {
      throw new AppError(
        404,
        "COUPON_NOT_FOUND",
        `Coupon with id "${id}" was not found.`,
      );
    }

    const redemptionCount = await couponRepo.countCouponRedemptionsGlobal(
      database,
      id,
    );
    if (redemptionCount > 0) {
      throw new AppError(
        409,
        "COUPON_HAS_REDEMPTIONS",
        "This coupon has already been redeemed. Deactivate it instead of deleting.",
      );
    }

    await couponRepo.deleteCoupon(database, id);
  }

  return {
    listCoupons,
    getCouponById,
    getCouponByCode,
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
}
