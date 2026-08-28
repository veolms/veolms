import { z } from "zod";

// ============================================================================
// 1. DOMAIN ENUMS & CONSTANTS
// ============================================================================

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

export const paymentStatusSchema = z.enum([
  "initiated",
  "processing",
  "captured",
  "failed",
  "refunded",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentAttemptStatusSchema = z.enum([
  "initiated",
  "processing",
  "captured",
  "failed",
]);
export type PaymentAttemptStatus = z.infer<typeof paymentAttemptStatusSchema>;

export const refundStatusSchema = z.enum([
  "pending",
  "processed",
  "failed",
]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const couponDiscountTypeSchema = z.enum([
  "percentage",
  "fixed",
]);
export type CouponDiscountType = z.infer<typeof couponDiscountTypeSchema>;

export const paymentProviderSchema = z.enum([
  "razorpay",
  "stripe",
  "mock",
  "free",
]);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const orderItemTypeSchema = z.enum([
  "course",
  "bundle",
]);
export type OrderItemType = z.infer<typeof orderItemTypeSchema>;

export const bundleStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);
export type BundleStatus = z.infer<typeof bundleStatusSchema>;

export const enrollmentStatusSchema = z.enum([
  "active",
  "suspended",
  "revoked",
  "expired",
]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const enrollmentSourceSchema = z.enum([
  "direct_purchase",
  "bundle_purchase",
  "free_grant",
  "admin_grant",
]);
export type EnrollmentSource = z.infer<typeof enrollmentSourceSchema>;

// ============================================================================
// 2. COURSE BUNDLES & BUNDLE ITEMS
// ============================================================================

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

// ============================================================================
// 3. CART & CART ITEMS
// ============================================================================

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

// ============================================================================
// 4. COUPONS & DISCOUNT ENGINE
// ============================================================================

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
  startsAt: z.string().or(z.date()),
  expiresAt: z.string().or(z.date()),
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
  startsAt: z.string().or(z.date()).optional(),
  expiresAt: z.string().or(z.date()).optional(),
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

// ============================================================================
// 5. PRICING CALCULATION
// ============================================================================

export const pricingItemCalculationSchema = z.strictObject({
  itemType: orderItemTypeSchema,
  itemId: z.uuid(), // courseId or bundleId
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

// ============================================================================
// 6. PURCHASES & PURCHASE ITEMS (Canonical Domain Model; Order aliases preserved)
// ============================================================================

export const purchaseItemSnapshotSchema = z.strictObject({
  id: z.uuid(),
  purchaseId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  itemType: orderItemTypeSchema,
  offeringId: z.uuid().nullable().optional(), // canonical reference to sellable offering
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
  purchaseNumber: z.string().optional(), // e.g. PUR-20260825-XXXX
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

// ============================================================================
// 6.1 INVOICES
// ============================================================================

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

// ============================================================================
// 7. CHECKOUT REQUESTS & RESPONSES
// ============================================================================

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

export const gatewayOrderDetailsSchema = z.strictObject({
  provider: paymentProviderSchema,
  gatewayOrderId: z.string(),
  keyId: z.string().optional(),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  notes: z.record(z.string(), z.string()).optional(),
});
export type GatewayOrderDetails = z.infer<typeof gatewayOrderDetailsSchema>;

export const createCheckoutOrderResponseSchema = z.strictObject({
  order: purchaseSchema,
  gateway: z
    .strictObject({
      provider: paymentProviderSchema,
      gatewayOrderId: z.string(),
      keyId: z.string().optional(),
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    })
    .nullable()
    .optional(),
});
export type CreateCheckoutOrderResponse = z.infer<typeof createCheckoutOrderResponseSchema>;
export const createPurchaseResponseSchema = createCheckoutOrderResponseSchema;
export type CreatePurchaseResponse = CreateCheckoutOrderResponse;

// ============================================================================
// 8. PAYMENTS & PAYMENT ATTEMPTS
// ============================================================================

export const paymentAttemptSchema = z.strictObject({
  id: z.uuid(),
  paymentId: z.uuid(),
  gatewayPaymentId: z.string().nullable().optional(),
  attemptNumber: z.number().int().positive(),
  status: paymentAttemptStatusSchema,
  errorCode: z.string().nullable().optional(),
  errorDescription: z.string().nullable().optional(),
  rawPayload: z.unknown().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;

export const paymentMethodDetailsSchema = z.strictObject({
  method: z.string(),
  bank: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  cardLast4: z.string().nullable().optional(),
  cardNetwork: z.string().nullable().optional(),
});
export type PaymentMethodDetails = z.infer<typeof paymentMethodDetailsSchema>;

export const paymentSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  purchaseId: z.uuid().optional(),
  gatewayProvider: paymentProviderSchema,
  gatewayOrderId: z.string(),
  gatewayPaymentId: z.string().nullable().optional(),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: paymentStatusSchema,
  paymentMethod: paymentMethodDetailsSchema.nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorDescription: z.string().nullable().optional(),
  attempts: z.array(paymentAttemptSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Payment = z.infer<typeof paymentSchema>;

export const verifyPaymentRequestSchema = z.strictObject({
  orderId: z.uuid(),
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1),
  gatewaySignature: z.string().min(1),
});
export type VerifyPaymentRequest = z.infer<typeof verifyPaymentRequestSchema>;
export const verifyPurchaseRequestSchema = verifyPaymentRequestSchema;
export type VerifyPurchaseRequest = VerifyPaymentRequest;

export const verifyPaymentResponseSchema = z.strictObject({
  verified: z.boolean(),
  orderId: z.uuid(),
  orderStatus: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  message: z.string().optional(),
});
export type VerifyPaymentResponse = z.infer<typeof verifyPaymentResponseSchema>;

// ============================================================================
// 9. REFUNDS
// ============================================================================

export const refundSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  paymentId: z.uuid(),
  gatewayRefundId: z.string().nullable().optional(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  reason: z.string().nullable().optional(),
  status: refundStatusSchema,
  createdBy: z.uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Refund = z.infer<typeof refundSchema>;

export const createRefundRequestSchema = z.strictObject({
  orderId: z.uuid(),
  amount: z.number().int().positive().optional(), // If omitted, full refund
  reason: z.string().max(500).optional(),
});
export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

// ============================================================================
// 10. ACCESS GRANTS & LEARNING ENROLLMENTS
// ============================================================================

export const accessGrantStatusSchema = z.enum(["active", "suspended", "revoked", "expired"]);
export type AccessGrantStatus = z.infer<typeof accessGrantStatusSchema>;

export const accessGrantSourceSchema = z.enum([
  "purchase",
  "bundle_purchase",
  "free_grant",
  "admin_grant",
]);
export type AccessGrantSource = z.infer<typeof accessGrantSourceSchema>;

export const accessGrantSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  offeringId: z.uuid().optional(), // courseId or offeringId
  courseId: z.uuid(),
  purchaseId: z.uuid().nullable().optional(),
  status: accessGrantStatusSchema,
  source: accessGrantSourceSchema,
  validFrom: z.string().or(z.date()),
  validUntil: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AccessGrant = z.infer<typeof accessGrantSchema>;

export const enrollmentSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  courseId: z.uuid(),
  accessGrantId: z.uuid().nullable().optional(),
  orderId: z.uuid().nullable().optional(),
  status: enrollmentStatusSchema,
  source: enrollmentSourceSchema,
  accessStartsAt: z.string().or(z.date()),
  accessExpiresAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

export const fulfillmentResultSchema = z.strictObject({
  orderId: z.uuid(),
  userId: z.uuid(),
  enrolledCourseIds: z.array(z.uuid()),
  skippedCourseIds: z.array(z.uuid()), // Already enrolled before
  fulfilledAt: z.string().or(z.date()),
});
export type FulfillmentResult = z.infer<typeof fulfillmentResultSchema>;

// ============================================================================
// 11. WEBHOOKS & NORMALIZED DOMAIN EVENTS
// ============================================================================

export const webhookEventStatusSchema = z.enum([
  "pending",
  "processed",
  "failed",
  "ignored",
]);
export type WebhookEventStatus = z.infer<typeof webhookEventStatusSchema>;

export const normalizedPaymentEventTypeSchema = z.enum([
  "payment.succeeded",
  "payment.failed",
  "refund.pending",
  "refund.succeeded",
  "refund.failed",
  /**
   * A signature-valid webhook event whose provider-specific type isn't one
   * this gateway adapter acts on (e.g. Razorpay subscription/dispute events).
   * Acknowledged and stored like any other event — see PaymentWorker's
   * fallback branch — rather than rejected, so the provider doesn't see a
   * failing webhook and retry forever. The original provider event name is
   * still recoverable from the stored payload.
   */
  "ignored",
]);
export type NormalizedPaymentEventType = z.infer<typeof normalizedPaymentEventTypeSchema>;

export const normalizedPaymentEventSchema = z.strictObject({
  eventId: z.string(),
  eventType: normalizedPaymentEventTypeSchema,
  provider: paymentProviderSchema,
  gatewayOrderId: z.string().optional(),
  gatewayPaymentId: z.string().optional(),
  gatewayRefundId: z.string().optional(),
  amount: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  paymentMethod: paymentMethodDetailsSchema.optional(),
  errorCode: z.string().optional(),
  errorDescription: z.string().optional(),
  rawPayload: z.unknown(),
  occurredAt: z.string().or(z.date()),
});
export type NormalizedPaymentEvent = z.infer<typeof normalizedPaymentEventSchema>;

export const webhookEventRecordSchema = z.strictObject({
  id: z.uuid(),
  provider: paymentProviderSchema,
  eventId: z.string(),
  eventType: z.string(),
  payload: z.unknown(),
  processedAt: z.string().or(z.date()).nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type WebhookEventRecord = z.infer<typeof webhookEventRecordSchema>;

// ============================================================================
// 12. PAYMENT GATEWAY ABSTRACTION INTERFACES
// ============================================================================

export interface GatewayCustomerInfo {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface CreateGatewayOrderInput {
  orderId: string;
  orderNumber: string;
  amount: number; // Smallest unit (e.g. paise)
  currency: string;
  receipt: string;
  customer: GatewayCustomerInfo;
  notes?: Record<string, string>;
}

export interface GatewayOrderOutput {
  provider: PaymentProvider;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  notes?: Record<string, string>;
}

export interface VerifyGatewayPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface GatewayPaymentDetails {
  gatewayPaymentId: string;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  captured?: boolean;
  amountRefunded?: number;
  fee?: number | null;
  tax?: number | null;
  method?: string;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  cardLast4?: string | null;
  cardNetwork?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorSource?: string | null;
  errorStep?: string | null;
  errorReason?: string | null;
}

export interface CreateGatewayRefundInput {
  gatewayPaymentId: string;
  amount: number; // Smallest unit
  currency: string;
  reason?: string;
  notes?: Record<string, string>;
  idempotencyKey?: string;
}

export interface GatewayRefundOutput {
  gatewayRefundId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
}

export interface GatewayOrderStatus {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  /** 'created' = not yet paid; 'attempted' = payment initiated; 'paid' = successfully paid */
  status: "created" | "attempted" | "paid";
}

export interface GatewayRefundDetails {
  gatewayRefundId: string;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
}

export interface PaymentGateway {
  readonly providerName: PaymentProvider;

  /**
   * Create an upstream order with the payment provider.
   */
  createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrderOutput>;

  /**
   * Fetch current order status from the gateway (used by reconciliation recovery workers).
   */
  fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus>;

  /**
   * Fetch payments associated with a gateway order (GET /v1/orders/:id/payments).
   * Used by reconciliation workers when an order is paid but local gateway_payment_id is missing.
   */
  fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPaymentDetails[]>;

  /**
   * Verify the checkout payment signature returned from client.
   */
  verifyPaymentSignature(input: VerifyGatewayPaymentInput): boolean;

  /**
   * Fetch current payment status & metadata from provider.
   */
  getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails>;

  /**
   * Initiate a refund through the provider.
   */
  refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefundOutput>;

  /**
   * Fetch refund status from the gateway (used by refund reconciliation).
   */
  fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails>;

  /**
   * Verify webhook request authenticity using raw body (string or binary buffer) and header signature.
   */
  verifyWebhookSignature(rawBody: string | Uint8Array, signature: string): boolean;

  /**
   * Translate provider-specific webhook payload into normalized domain event.
   * Can accept an explicit eventId (e.g. from x-razorpay-event-id header).
   */
  normalizeWebhookEvent(rawPayload: unknown, eventId?: string): NormalizedPaymentEvent;
}

