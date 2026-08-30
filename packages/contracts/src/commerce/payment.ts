import { z } from "zod";
import { orderStatusSchema, purchaseSchema } from "./order.ts";
import type {
  CreateGatewayRefundInput,
  GatewayRefundOutput,
  GatewayRefundDetails,
} from "./refund.ts";

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

export const creatorPaymentConfigSchema = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  provider: paymentProviderSchema,
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

export const manualPaymentStatusSchema = z.enum(["pending", "verified", "rejected"]);
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

export interface GatewayOrderStatus {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  status: "created" | "attempted" | "paid";
}

export interface PaymentGateway {
  readonly providerName: PaymentProvider;
  createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrderOutput>;
  fetchOrder(gatewayOrderId: string): Promise<GatewayOrderStatus>;
  fetchOrderPayments(gatewayOrderId: string): Promise<GatewayPaymentDetails[]>;
  verifyPaymentSignature(input: VerifyGatewayPaymentInput): boolean;
  getPayment(gatewayPaymentId: string): Promise<GatewayPaymentDetails>;
  refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefundOutput>;
  fetchRefund(gatewayRefundId: string): Promise<GatewayRefundDetails>;
  verifyWebhookSignature(rawBody: string | Uint8Array, signature: string): boolean;
  normalizeWebhookEvent(rawPayload: unknown, eventId?: string): NormalizedPaymentEvent;
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
  provider: z.enum(["razorpay", "stripe", "mock", "free", "manual"]),
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
