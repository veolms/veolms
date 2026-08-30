import { z } from "zod";

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
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Coupon = z.infer<typeof couponSchema>;

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
