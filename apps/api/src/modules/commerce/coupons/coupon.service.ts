import type {
  Coupon,
  CouponListItem,
  CouponListResponse,
  CreateCouponRequest,
  ListCouponsQuery,
  UpdateCouponRequest,
} from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { AppError } from "../../../lib/errors.ts";
import { ADMIN_ROLE } from "../../auth/index.ts";
import type { CourseService } from "../../courses/index.ts";
import { toMinorUnits } from "../shared/currency.ts";
import * as couponRepo from "./coupon.repository.ts";

/**
 * Discounts actually given are transacted money, so they leave the API in
 * minor units like order totals. Redemption rows store the order's
 * major-unit discount and carry no currency of their own; INR is the
 * academy's operating currency.
 */
const discountGivenToMinor = (amountMajor: number) =>
  toMinorUnits(Math.round(amountMajor), "INR");

/** The staff member managing coupons. */
export interface CouponActor {
  id: string;
  roles: readonly string[];
}

export interface CouponService {
  listCoupons(
    actor: CouponActor,
    query?: ListCouponsQuery,
  ): Promise<CouponListResponse>;
  getCouponById(actor: CouponActor, id: string): Promise<Coupon>;
  createCoupon(
    actor: CouponActor,
    request: CreateCouponRequest,
  ): Promise<Coupon>;
  updateCoupon(
    actor: CouponActor,
    id: string,
    request: UpdateCouponRequest,
  ): Promise<Coupon>;
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
  courseService,
}: {
  database: Executor;
  courseService: Pick<CourseService, "listOwnedCourseIds">;
}): CouponService {
  const isAdmin = (actor: CouponActor) => actor.roles.includes(ADMIN_ROLE);

  function couponNotFound(id: string): AppError {
    return new AppError(
      404,
      "COUPON_NOT_FOUND",
      `Coupon with id "${id}" was not found.`,
    );
  }

  /**
   * Admins manage every coupon. Anyone else manages only coupons they
   * created; other coupons (including pre-ownership rows with no creator)
   * answer exactly like a missing id.
   */
  function assertCanManageCoupon(
    actor: CouponActor,
    coupon: { id: string; created_by: string | null },
  ): void {
    if (isAdmin(actor)) return;
    if (coupon.created_by !== actor.id) throw couponNotFound(coupon.id);
  }

  /**
   * A non-admin's coupon must name the courses it applies to, and they must
   * all be the actor's own: an empty restriction means "every course and
   * bundle in the academy", which is an admin decision. Bundles are
   * admin-managed, so a non-admin coupon cannot target them either.
   */
  async function assertOwnCourseScope(
    actor: CouponActor,
    restrictedCourseIds: readonly string[] | null | undefined,
    restrictedBundleIds: readonly string[] | null | undefined,
  ): Promise<void> {
    if (isAdmin(actor)) return;

    if (!restrictedCourseIds || restrictedCourseIds.length === 0) {
      throw new AppError(
        403,
        "COUPON_SCOPE_REQUIRED",
        "Choose at least one of your own courses for this coupon. Only administrators can create coupons that apply to every course.",
      );
    }
    if (restrictedBundleIds && restrictedBundleIds.length > 0) {
      throw new AppError(
        403,
        "COUPON_SCOPE_FORBIDDEN",
        "Only administrators can create coupons for bundles.",
      );
    }

    const owned = new Set(await courseService.listOwnedCourseIds(actor.id));
    if (!restrictedCourseIds.every((courseId) => owned.has(courseId))) {
      throw new AppError(
        403,
        "COUPON_SCOPE_FORBIDDEN",
        "A coupon can only apply to courses you created.",
      );
    }
  }

  function mapToCoupon(
    row: NonNullable<Awaited<ReturnType<typeof couponRepo.findCouponById>>>,
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
    };
  }

  function mapToCouponListItem(
    row: Awaited<ReturnType<typeof couponRepo.listCoupons>>[number],
    redemptionCount: number,
  ): CouponListItem {
    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      globalUsageLimit: row.global_usage_limit,
      isActive: row.is_active,
      redemptionCount,
      createdAt: row.created_at,
    };
  }

  async function listCoupons(
    actor: CouponActor,
    query?: ListCouponsQuery,
  ): Promise<CouponListResponse> {
    const limit = query?.limit ?? 30;
    const cursor = query?.cursor ? decodeCouponCursor(query.cursor) : undefined;
    const createdBy = isAdmin(actor) ? undefined : actor.id;

    // The summary describes the whole library, so only the first page
    // carries it; later pages would recompute the same numbers.
    const [rows, summary] = await Promise.all([
      couponRepo.listCoupons(database, {
        courseId: query?.courseId,
        createdBy,
        cursor,
        limit,
      }),
      cursor
        ? undefined
        : couponRepo.getCouponOverallSummary(database, {
            courseId: query?.courseId,
            createdBy,
          }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const counts = await couponRepo.listCouponRedemptionCounts(
      database,
      pageRows.map((row) => row.id),
    );
    const redemptionCountById = new Map(
      counts.map((row) => [row.coupon_id, Number(row.redemption_count ?? 0)]),
    );

    const items = pageRows.map((row) =>
      mapToCouponListItem(row, redemptionCountById.get(row.id) ?? 0),
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
      ...(summary
        ? {
            summary: {
              ...summary,
              totalDiscountGiven: discountGivenToMinor(
                summary.totalDiscountGiven,
              ),
            },
          }
        : {}),
    };
  }

  async function getCouponById(
    actor: CouponActor,
    id: string,
  ): Promise<Coupon> {
    const coupon = await couponRepo.findCouponById(database, id);
    if (!coupon) throw couponNotFound(id);
    assertCanManageCoupon(actor, coupon);
    return mapToCoupon(coupon);
  }

  async function createCoupon(
    actor: CouponActor,
    request: CreateCouponRequest,
  ): Promise<Coupon> {
    await assertOwnCourseScope(
      actor,
      request.restrictedCourseIds,
      request.restrictedBundleIds,
    );

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
      created_by: actor.id,
      created_at: now,
      updated_at: now,
    });

    return mapToCoupon(created);
  }

  async function updateCoupon(
    actor: CouponActor,
    id: string,
    request: UpdateCouponRequest,
  ): Promise<Coupon> {
    const existing = await couponRepo.findCouponById(database, id);
    if (!existing) throw couponNotFound(id);
    assertCanManageCoupon(actor, existing);
    // Check the restriction the coupon will have AFTER this update, so a
    // partial update cannot widen it (e.g. `restrictedCourseIds: null`).
    await assertOwnCourseScope(
      actor,
      request.restrictedCourseIds === undefined
        ? existing.restricted_course_ids
        : request.restrictedCourseIds,
      request.restrictedBundleIds === undefined
        ? existing.restricted_bundle_ids
        : request.restrictedBundleIds,
    );

    const effectiveDiscountType =
      request.discountType ?? existing.discount_type;
    const effectiveDiscountValue =
      request.discountValue ?? existing.discount_value;
    if (
      effectiveDiscountType === "percentage" &&
      effectiveDiscountValue > 100
    ) {
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

    return mapToCoupon(updated);
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
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
}
