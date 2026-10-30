import { z } from "zod";
import { orderStatusSchema } from "./order.ts";
import type {
  CreateGatewayRefundInput,
  GatewayRefundOutput,
  GatewayRefundDetails,
} from "./refund.ts";

/**
 * How long a payment window stays open before it closes itself, in seconds.
 * The web app passes it to the gateway's checkout; the API uses it to tell
 * whether a gateway order it handed out may still be paid, and refuses to
 * start a second payment for the same thing until it cannot.
 */
export const CHECKOUT_WINDOW_SECONDS = 600;

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

export const paymentProviderSchema = z.enum([
  "razorpay",
  "dodo",
  "cashfree",
  "stripe",
  "mock",
  "free",
  "manual",
]);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const gatewayOrderDetailsSchema = z.strictObject({
  provider: paymentProviderSchema,
  gatewayOrderId: z.string(),
  keyId: z.string().optional(),
  checkoutUrl: z.url().optional(),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  notes: z.record(z.string(), z.string()).optional(),
});
export type GatewayOrderDetails = z.infer<typeof gatewayOrderDetailsSchema>;

/**
 * `gateway` is what the payment widget is opened with; it is null when there
 * is nothing to pay (a free course, a 100% coupon) and the order is already
 * complete. `provider` says which gateway's widget: Razorpay opens with
 * `keyId` and the gateway order, a hosted checkout (Dodo Payments) with its
 * `checkoutUrl`.
 */
export const createCheckoutOrderResponseSchema = z.strictObject({
  order: z.strictObject({
    id: z.uuid(),
    status: orderStatusSchema,
  }),
  gateway: z
    .strictObject({
      provider: paymentProviderSchema,
      gatewayOrderId: z.string(),
      keyId: z.string().optional(),
      checkoutUrl: z.url().optional(),
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    })
    .nullable()
    .optional(),
});
export type CreateCheckoutOrderResponse = z.infer<
  typeof createCheckoutOrderResponseSchema
>;
/**
 * The answer to the buyer closing the payment window. `released` is true
 * when the order was cancelled and another checkout may start at once; false
 * when it was left as it is because a payment for it may still arrive (the
 * gateway has one in progress or captured, or could not be asked), or it
 * had already ended.
 */
export const releaseCheckoutOrderResponseSchema = z.strictObject({
  released: z.boolean(),
  status: orderStatusSchema,
});
export type ReleaseCheckoutOrderResponse = z.infer<
  typeof releaseCheckoutOrderResponseSchema
>;
export const createPurchaseResponseSchema = createCheckoutOrderResponseSchema;
export type CreatePurchaseResponse = CreateCheckoutOrderResponse;

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

/**
 * What the payment widget reported when the buyer paid. Razorpay's widget
 * hands over the payment and a signature of it, and both are required for
 * it. A hosted checkout (Dodo Payments) gives the page no signature and not
 * always the payment: the server then asks the gateway which payment was
 * made for `gatewayOrderId`.
 */
export const verifyPaymentRequestSchema = z.strictObject({
  orderId: z.uuid(),
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1).optional(),
  gatewaySignature: z.string().min(1).optional(),
});
export type VerifyPaymentRequest = z.infer<typeof verifyPaymentRequestSchema>;
export const verifyPurchaseRequestSchema = verifyPaymentRequestSchema;
export type VerifyPurchaseRequest = VerifyPaymentRequest;

export const verifyPaymentResponseSchema = z.strictObject({
  verified: z.boolean(),
  orderStatus: orderStatusSchema,
});
export type VerifyPaymentResponse = z.infer<typeof verifyPaymentResponseSchema>;

export const creatorPaymentConfigSchema = z.strictObject({
  id: z.uuid(),
  provider: paymentProviderSchema,
  /** Masked for display (a short prefix and the last 4 characters). */
  keyId: z.string(),
  hasWebhookSecret: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type CreatorPaymentConfig = z.infer<typeof creatorPaymentConfigSchema>;

export const saveCreatorPaymentConfigRequestSchema = z.strictObject({
  provider: paymentProviderSchema.default("razorpay"),
  keyId: z.string().min(1),
  keySecret: z.string().min(1),
  webhookSecret: z.string().optional(),
});
export type SaveCreatorPaymentConfigRequest = z.infer<
  typeof saveCreatorPaymentConfigRequestSchema
>;

/**
 * `withdrawn`: the buyer took the report back before staff answered it.
 * It no longer waits for review and no longer stops another payment.
 */
export const manualPaymentStatusSchema = z.enum([
  "pending",
  "verified",
  "rejected",
  "withdrawn",
]);
export type ManualPaymentStatus = z.infer<typeof manualPaymentStatusSchema>;

export const manualPaymentRequestSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  userId: z.uuid(),
  paymentMethod: z.string(),
  transactionReference: z.string(),
  proofMediaId: z.uuid().nullable().optional(),
  status: manualPaymentStatusSchema,
  adminNotes: z.string().nullable().optional(),
  verifiedBy: z.uuid().nullable().optional(),
  verifiedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ManualPaymentRequest = z.infer<typeof manualPaymentRequestSchema>;

/**
 * A manual payment as the learner who submitted it sees it: no reviewer
 * identity and no internal review notes.
 */
export const learnerManualPaymentRequestSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  paymentMethod: z.string(),
  transactionReference: z.string(),
  proofMediaId: z.uuid().nullable(),
  status: manualPaymentStatusSchema,
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type LearnerManualPaymentRequest = z.infer<
  typeof learnerManualPaymentRequestSchema
>;

export const submitManualPaymentRequestSchema = z.strictObject({
  paymentMethod: z.enum(["upi", "bank_transfer"]).default("upi"),
  transactionReference: z.string().min(4).max(100),
  proofMediaId: z.uuid().optional(),
});
export type SubmitManualPaymentRequest = z.infer<
  typeof submitManualPaymentRequestSchema
>;

export const verifyManualPaymentRequestSchema = z.strictObject({
  action: z.enum(["verify", "reject"]),
  adminNotes: z.string().max(500).optional(),
});
export type VerifyManualPaymentRequest = z.infer<
  typeof verifyManualPaymentRequestSchema
>;

export interface GatewayCustomerInfo {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface CreateGatewayOrderInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  receipt: string;
  customer: GatewayCustomerInfo;
  /** What is being bought, as the buyer knows it ("Complete Node.js"). */
  description?: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderOutput {
  provider: PaymentProvider;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  /**
   * What the gateway's own window is opened with, besides the order: the
   * Razorpay key id, or a Cashfree payment session (see the Cashfree
   * gateway for its form). Kept on the payment row and handed out again.
   */
  keyId?: string;
  /** Where a hosted checkout is opened (Dodo Payments). */
  checkoutUrl?: string;
  notes?: Record<string, string>;
}

export interface VerifyGatewayPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature?: string;
}

/** A webhook delivery's request headers, names in lower case. */
export type GatewayWebhookHeaders = Record<string, string | undefined>;

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

export interface GatewayOrderStatus {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  status: "created" | "attempted" | "paid";
}

/**
 * One payment gateway (Razorpay, Dodo Payments). "Gateway order" is the
 * gateway's own record of what is to be paid: a Razorpay order, a Dodo
 * checkout session. Every amount is in the order's currency and its smallest
 * unit, as orders store them.
 */
export interface PaymentGateway {
  readonly providerName: PaymentProvider;
  createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrderOutput>;
  /**
   * Where the buyer pays a gateway order of this gateway's, for one whose
   * checkout is a page of its own (Dodo Payments); undefined for one whose
   * widget is opened with the order's id (Razorpay).
   */
  checkoutUrl(gatewayOrderId: string): string | undefined;
  fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus>;
  /**
   * Ends a gateway order that is not to be paid (the buyer closed its window
   * and our order was cancelled), so that nobody can pay it later. For a
   * gateway whose orders can be ended (Cashfree); one whose orders cannot
   * leaves this out. A payment already begun may still complete.
   */
  cancelOrder?(gatewayOrderId: string): Promise<void>;
  fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPaymentDetails[]>;
  /**
   * Whether what the widget reported can be trusted as far as it goes. A
   * gateway whose widget signs its report checks the signature; one whose
   * widget gives none answers true, and the payment is then only taken as
   * proven by asking the gateway for it (`getPayment`), as it always is.
   */
  verifyPaymentSignature(input: VerifyGatewayPaymentInput): boolean;
  getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails>;
  refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefundOutput>;
  fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails>;
  /** Whether a webhook delivery was signed by the gateway. */
  verifyWebhookSignature(
    rawBody: string | Uint8Array,
    headers: GatewayWebhookHeaders,
  ): boolean;
  /** The gateway's own id for a webhook delivery, from its headers. */
  webhookEventId(headers: GatewayWebhookHeaders): string | undefined;
  normalizeWebhookEvent(
    rawPayload: unknown,
    eventId?: string,
  ): NormalizedPaymentEvent;
}

/**
 * Every gateway the server takes payments through. A payment row names the
 * one it was made with (`gateway_provider`), and whatever is done with it
 * later (asking about it, refunding it, its webhooks) goes to that one. A new
 * checkout gets the gateway for the buyer's country.
 */
export interface PaymentGateways {
  /** The gateway a checkout gets when its buyer's country is not known. */
  readonly primary: PaymentGateway;
  /** Every gateway, the primary first. */
  readonly all: readonly PaymentGateway[];
  /** The gateway payments recorded under `provider` were made with. */
  get(provider: string): PaymentGateway | undefined;
  /**
   * The gateway a new checkout opens for a buyer in `country` (ISO 3166-1
   * alpha-2), or the primary one when the country is not known.
   */
  forCountry(country: string | null | undefined): PaymentGateway;
}

export const webhookEventStatusSchema = z.enum([
  "pending",
  "processed",
  "failed",
  "ignored",
]);
export type WebhookEventStatus = z.infer<typeof webhookEventStatusSchema>;

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

export const normalizedPaymentEventTypeSchema = z.enum([
  "payment.succeeded",
  "payment.failed",
  "refund.pending",
  "refund.succeeded",
  "refund.failed",
  "ignored",
]);
export type NormalizedPaymentEventType = z.infer<
  typeof normalizedPaymentEventTypeSchema
>;

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
export type NormalizedPaymentEvent = z.infer<
  typeof normalizedPaymentEventSchema
>;
