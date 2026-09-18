import { z } from "zod";
import { refundSchema } from "./refund.ts";

export const bundleStatusSchema = z.enum(["draft", "published", "archived"]);
export type BundleStatus = z.infer<typeof bundleStatusSchema>;

export const bundleItemSchema = z.strictObject({
  id: z.uuid(),
  bundleId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string().optional(),
  courseSlug: z.string().optional(),
  courseThumbnailMediaId: z.uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type BundleItem = z.infer<typeof bundleItemSchema>;

export const courseBundleSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  status: bundleStatusSchema,
  price: z.number().int().nonnegative().meta({ description: "Price in smallest currency unit (e.g. paise)" }),
  currency: z.string().length(3).default("INR"),
  items: z.array(bundleItemSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type CourseBundle = z.infer<typeof courseBundleSchema>;

export const createBundleRequestSchema = z.strictObject({
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  thumbnailMediaId: z.uuid().optional(),
  status: bundleStatusSchema.default("draft"),
  price: z.number().int().nonnegative(),
  currency: z.string().length(3).default("INR"),
  courseIds: z.array(z.uuid()).min(1),
});
export type CreateBundleRequest = z.infer<typeof createBundleRequestSchema>;

export const updateBundleRequestSchema = z.strictObject({
  slug: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  status: bundleStatusSchema.optional(),
  price: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  courseIds: z.array(z.uuid()).optional(),
});
export type UpdateBundleRequest = z.infer<typeof updateBundleRequestSchema>;

export const orderItemTypeSchema = z.enum(["course", "bundle"]);
export type OrderItemType = z.infer<typeof orderItemTypeSchema>;

export const cartItemInputSchema = z.strictObject({
  itemType: orderItemTypeSchema,
  courseId: z.uuid().optional(),
  bundleId: z.uuid().optional(),
}).refine(
  (data) => (data.itemType === "course" && !!data.courseId && !data.bundleId) ||
            (data.itemType === "bundle" && !!data.bundleId && !data.courseId),
  { message: "Either courseId or bundleId must be provided matching itemType" },
);
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const cartItemSchema = z.strictObject({
  id: z.uuid(),
  cartId: z.uuid(),
  itemType: orderItemTypeSchema,
  courseId: z.uuid().nullable().optional(),
  bundleId: z.uuid().nullable().optional(),
  title: z.string(),
  slug: z.string(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  unitPrice: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.string().or(z.date()),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartResponseSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  items: z.array(cartItemSchema),
  itemCount: z.number().int().nonnegative(),
  subtotalAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  updatedAt: z.string().or(z.date()),
});
export type CartResponse = z.infer<typeof cartResponseSchema>;

export const couponDiscountTypeSchema = z.enum(["percentage", "fixed"]);
export type CouponDiscountType = z.infer<typeof couponDiscountTypeSchema>;

export const couponSchema = z.strictObject({
  id: z.uuid(),
  code: z.string().min(1).max(50).toUpperCase(),
  description: z.string().nullable().optional(),
  discountType: couponDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  maxDiscountAmount: z.number().int().positive().nullable().optional(),
  minOrderAmount: z.number().int().nonnegative().default(0),
  startsAt: z.string().or(z.date()),
  expiresAt: z.string().or(z.date()),
  globalUsageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  restrictedCourseIds: z.array(z.uuid()).nullable().optional(),
  restrictedBundleIds: z.array(z.uuid()).nullable().optional(),
  redemptionCount: z.number().int().nonnegative().default(0),
  totalDiscountGiven: z.number().int().nonnegative().default(0),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Coupon = z.infer<typeof couponSchema>;

export const listCouponsQuerySchema = z.object({
  courseId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

export const couponSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  scheduledCount: z.number().int().nonnegative(),
  expiredCount: z.number().int().nonnegative(),
  inactiveCount: z.number().int().nonnegative(),
  totalRedemptions: z.number().int().nonnegative(),
  totalDiscountGiven: z.number().int().nonnegative(),
});
export type CouponSummary = z.infer<typeof couponSummarySchema>;

export const couponListResponseSchema = z.object({
  items: z.array(couponSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
  summary: couponSummarySchema.optional(),
});
export type CouponListResponse = z.infer<typeof couponListResponseSchema>;

export const createCouponRequestSchema = z.strictObject({
  code: z.string().min(1).max(50).toUpperCase(),
  description: z.string().max(500).optional(),
  discountType: couponDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  maxDiscountAmount: z.number().int().positive().optional(),
  minOrderAmount: z.number().int().nonnegative().default(0),
  startsAt: z.string().datetime().or(z.date()),
  expiresAt: z.string().datetime().or(z.date()),
  globalUsageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  restrictedCourseIds: z.array(z.uuid()).optional(),
  restrictedBundleIds: z.array(z.uuid()).optional(),
});
export type CreateCouponRequest = z.infer<typeof createCouponRequestSchema>;

export const updateCouponRequestSchema = z.strictObject({
  description: z.string().max(500).optional(),
  discountType: couponDiscountTypeSchema.optional(),
  discountValue: z.number().int().positive().optional(),
  maxDiscountAmount: z.number().int().positive().nullable().optional(),
  minOrderAmount: z.number().int().nonnegative().optional(),
  startsAt: z.string().datetime().or(z.date()).optional(),
  expiresAt: z.string().datetime().or(z.date()).optional(),
  globalUsageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  restrictedCourseIds: z.array(z.uuid()).nullable().optional(),
  restrictedBundleIds: z.array(z.uuid()).nullable().optional(),
});
export type UpdateCouponRequest = z.infer<typeof updateCouponRequestSchema>;

export const validateCouponRequestSchema = z.strictObject({
  code: z.string().min(1).max(50).toUpperCase(),
  items: z.array(cartItemInputSchema).min(1),
});
export type ValidateCouponRequest = z.infer<typeof validateCouponRequestSchema>;

export const couponValidationResultSchema = z.strictObject({
  valid: z.boolean(),
  code: z.string(),
  discountType: couponDiscountTypeSchema.optional(),
  discountValue: z.number().int().optional(),
  discountAmount: z.number().int().nonnegative().default(0),
  message: z.string().optional(),
});
export type CouponValidationResult = z.infer<typeof couponValidationResultSchema>;

export const couponRedemptionSchema = z.strictObject({
  id: z.uuid(),
  couponId: z.uuid(),
  userId: z.uuid(),
  orderId: z.uuid(),
  discountAmount: z.number().int().nonnegative(),
  createdAt: z.string().or(z.date()),
});
export type CouponRedemption = z.infer<typeof couponRedemptionSchema>;

export const orderStatusSchema = z.enum([
  "pending",
  "payment_processing",
  "paid",
  "payment_failed",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const pricingItemCalculationSchema = z.strictObject({
  itemType: orderItemTypeSchema,
  itemId: z.uuid(),
  title: z.string(),
  unitPrice: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  finalAmount: z.number().int().nonnegative(),
});
export type PricingItemCalculation = z.infer<typeof pricingItemCalculationSchema>;

export const pricingCalculationSchema = z.strictObject({
  subtotalAmount: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  totalAmount: z.number().int().nonnegative(),
  currency: z.string().length(3).default("INR"),
  couponCode: z.string().optional(),
  couponId: z.uuid().optional(),
  items: z.array(pricingItemCalculationSchema),
});
export type PricingCalculation = z.infer<typeof pricingCalculationSchema>;

export const orderScopeTypeSchema = z.enum(["user", "academy"]);
export type OrderScopeType = z.infer<typeof orderScopeTypeSchema>;

export const orderScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), id: z.string().uuid() }),
  z.object({ type: z.literal("academy"), id: z.string().uuid() }),
]);
export type OrderScope = z.infer<typeof orderScopeSchema>;

export const orderSortOrderSchema = z.enum(["asc", "desc"]);
export type OrderSortOrder = z.infer<typeof orderSortOrderSchema>;

export const orderViewSchema = z.enum(["admin", "student"]);
export type OrderView = z.infer<typeof orderViewSchema>;

// UTC ISO-8601 with up to microsecond precision, matching what the API emits
// (Postgres `timestamptz` keeps microseconds). The value is bound into SQL and
// cast with `::timestamptz`, so anything Postgres would reject has to be
// refused here to surface as a 400 rather than a database error.
const orderCursorTimestampPattern =
  /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export const orderCursorPayloadSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().regex(orderCursorTimestampPattern),
  sortOrder: orderSortOrderSchema,
});
export type OrderCursorPayload = z.infer<typeof orderCursorPayloadSchema>;

function toBase64Url(str: string): string {
  const g = globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } };
  if (typeof g.Buffer !== "undefined") {
    return g.Buffer.from(str, "utf-8").toString("base64url");
  }
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
  const g = globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } };
  if (typeof g.Buffer !== "undefined") {
    return g.Buffer.from(str, "base64url").toString("utf-8");
  }
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return decodeURIComponent(escape(atob(base64)));
}

export function encodeOrderCursor(payload: OrderCursorPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeOrderCursor(
  cursor: string,
  expectedSortOrder: OrderSortOrder = "desc",
): OrderCursorPayload {
  try {
    const raw = fromBase64Url(cursor);
    const parsed = JSON.parse(raw);
    const result = orderCursorPayloadSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("Invalid cursor format");
    }
    if (result.data.sortOrder !== expectedSortOrder) {
      throw new Error("Cursor sort specification does not match request");
    }
    // JS rolls impossible dates over (2026-02-30 -> 2026-03-02) where Postgres
    // errors, so require the parsed value to round-trip to the same instant.
    const createdAtDate = new Date(result.data.createdAt);
    if (
      Number.isNaN(createdAtDate.getTime()) ||
      createdAtDate.toISOString().slice(0, 19) !==
        result.data.createdAt.slice(0, 19)
    ) {
      throw new Error("Invalid cursor timestamp");
    }
    return result.data;
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : "Invalid cursor");
  }
}

export const orderStudentInfoSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string().optional(),
  email: z.string().nullable().optional(),
  username: z.string(),
});
export type OrderStudentInfo = z.infer<typeof orderStudentInfoSchema>;

// Deliberately not strict: `payments.payment_method` is untyped jsonb written
// by several paths (gateway webhooks, manual grants, free checkout) and can
// carry keys we don't want to expose. A plain object strips anything not
// listed here, and an unexpected extra key can't fail serialization of a
// whole list response.
export const orderPaymentMethodSchema = z.object({
  method: z.string(),
  bank: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  cardLast4: z.string().nullable().optional(),
  cardNetwork: z.string().nullable().optional(),
  transactionReference: z.string().nullable().optional(),
});
export type OrderPaymentMethod = z.infer<typeof orderPaymentMethodSchema>;

export const orderAdminDetailsSchema = z.strictObject({
  student: orderStudentInfoSchema,
  coupon: z
    .strictObject({
      id: z.string().uuid(),
      code: z.string(),
      discountType: couponDiscountTypeSchema,
      discountValue: z.number(),
    })
    .nullable()
    .optional(),
  refunds: z.array(refundSchema).optional(),
  payment: z
    .strictObject({
      id: z.string().uuid(),
      gatewayProvider: z.string(),
      gatewayOrderId: z.string(),
      gatewayPaymentId: z.string().nullable().optional(),
      amount: z.number(),
      currency: z.string(),
      status: z.string(),
      paymentMethod: orderPaymentMethodSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type OrderAdminDetails = z.infer<typeof orderAdminDetailsSchema>;

export const purchaseItemSnapshotSchema = z.strictObject({
  id: z.uuid(),
  purchaseId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  itemType: orderItemTypeSchema,
  offeringId: z.uuid().nullable().optional(),
  courseId: z.uuid().nullable().optional(),
  bundleId: z.uuid().nullable().optional(),
  titleSnapshot: z.string(),
  unitPrice: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  finalAmount: z.number().int().nonnegative(),
  createdAt: z.string().or(z.date()),
});
export type PurchaseItemSnapshot = z.infer<typeof purchaseItemSnapshotSchema>;
export const orderItemSnapshotSchema = purchaseItemSnapshotSchema;
export type OrderItemSnapshot = PurchaseItemSnapshot;

export const purchaseStatusSchema = orderStatusSchema;
export type PurchaseStatus = OrderStatus;

export const purchaseSchema = z.strictObject({
  id: z.uuid(),
  purchaseNumber: z.string().optional(),
  orderNumber: z.string(),
  userId: z.uuid(),
  status: purchaseStatusSchema,
  currency: z.string().length(3),
  subtotalAmount: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  totalAmount: z.number().int().nonnegative(),
  couponId: z.uuid().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  items: z.array(purchaseItemSnapshotSchema).optional(),
  expiresAt: z.string().or(z.date()),
  paidAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  admin: orderAdminDetailsSchema.optional(),
});
export type Purchase = z.infer<typeof purchaseSchema>;
export const orderSchema = purchaseSchema;
export type Order = Purchase;

export const checkoutPreviewRequestSchema = z.strictObject({
  items: z.array(cartItemInputSchema).min(1),
  couponCode: z.string().max(50).toUpperCase().optional(),
});
export type CheckoutPreviewRequest = z.infer<typeof checkoutPreviewRequestSchema>;

export const checkoutPreviewResponseSchema = z.strictObject({
  pricing: pricingCalculationSchema,
  couponValidation: couponValidationResultSchema.optional(),
});
export type CheckoutPreviewResponse = z.infer<typeof checkoutPreviewResponseSchema>;

export const createCheckoutOrderRequestSchema = z.strictObject({
  items: z.array(cartItemInputSchema).min(1),
  couponCode: z.string().max(50).toUpperCase().optional(),
  idempotencyKey: z.string().max(255).optional(),
});
export type CreateCheckoutOrderRequest = z.infer<typeof createCheckoutOrderRequestSchema>;
export const createPurchaseRequestSchema = createCheckoutOrderRequestSchema;
export type CreatePurchaseRequest = CreateCheckoutOrderRequest;

export const invoiceItemSchema = z.strictObject({
  title: z.string(),
  unitPrice: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative(),
  finalAmount: z.number().int().nonnegative(),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoiceSchema = z.strictObject({
  invoiceNumber: z.string(),
  orderNumber: z.string(),
  purchaseId: z.uuid(),
  buyer: z.strictObject({
    userId: z.uuid(),
    name: z.string(),
    email: z.string().nullable().optional(),
  }),
  seller: z.strictObject({
    name: z.string(),
    logoUrl: z.string().nullable().optional(),
    customDomain: z.string().nullable().optional(),
  }),
  currency: z.string().length(3),
  subtotalAmount: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  paymentReference: z.string(),
  items: z.array(invoiceItemSchema),
  paidAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const ordersListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  courseId: z.string().uuid().optional(),
  couponId: z.string().uuid().optional(),
  status: orderStatusSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortOrder: orderSortOrderSchema.default("desc"),
  view: orderViewSchema.optional(),
});
export type OrdersListQueryInput = z.input<typeof ordersListQuerySchema>;
export type OrdersListQueryOutput = z.output<typeof ordersListQuerySchema>;
// The validated query (defaults applied, dates coerced) is what handlers
// receive; `OrdersListQueryInput` is what a client may send.
export type OrdersListQuery = OrdersListQueryOutput;

export const ordersListResponseSchema = z.strictObject({
  orders: z.array(orderSchema),
  nextCursor: z.string().nullable(),
});
export type OrdersListResponse = z.infer<typeof ordersListResponseSchema>;

export const orderStatsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  courseId: z.string().uuid().optional(),
  couponId: z.string().uuid().optional(),
  status: orderStatusSchema.optional(),
  // ISO 4217 code. Amounts in different currencies can't be summed, so the
  // figures always describe one currency; omit to get the one with the most
  // orders and read `currencies` in the response for the others.
  currency: z.string().length(3).optional(),
});
export type OrderStatsQuery = z.infer<typeof orderStatsQuerySchema>;

export const orderStatsResponseSchema = z.strictObject({
  netRevenue: z.number().int(),
  totalOrders: z.number().int().nonnegative(),
  uniqueBuyers: z.number().int().nonnegative(),
  refundedAmount: z.number().int().nonnegative(),
  currency: z.string().length(3).default("INR"),
  // Every currency present among the matching orders, so a caller can offer a
  // switch and re-query with `currency`.
  currencies: z.array(z.string().length(3)),
});
export type OrderStatsResponse = z.infer<typeof orderStatsResponseSchema>;

export const orderDirectRefundRequestSchema = z.strictObject({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
  preserveAccess: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(255).optional(),
});
export type OrderDirectRefundRequest = z.infer<typeof orderDirectRefundRequestSchema>;
