import { z } from "zod";

export const refundStatusSchema = z.enum(["pending", "processed", "failed"]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  orderItemId: z.uuid().nullable().optional(),
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

/** What issuing a refund answers with; the full record is `GET /refunds/:id`. */
export const refundResultSchema = z.strictObject({
  id: z.uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: refundStatusSchema,
});
export type RefundResult = z.infer<typeof refundResultSchema>;

/**
 * Marks a refund as one staff already made outside the platform, for an
 * order paid by manual bank or UPI transfer. No money is moved: the refund
 * is only recorded. `reference` is what staff put on the transfer back (a
 * UTR, say); one reference can be recorded once, whatever its spacing or
 * letter case.
 */
export const outsideRefundSchema = z.strictObject({
  reference: z.string().trim().min(1).max(100),
});
export type OutsideRefund = z.infer<typeof outsideRefundSchema>;

export const createRefundRequestSchema = z.strictObject({
  orderId: z.uuid(),
  orderItemId: z.uuid().optional(),
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
  preserveAccess: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(255).optional(),
  /** Only for an order paid by manual transfer; refused for any other. */
  outsideRefund: outsideRefundSchema.optional(),
});
export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

export const refundRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export type RefundRequestStatus = z.infer<typeof refundRequestStatusSchema>;

export const refundRequestSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  userId: z.uuid(),
  reason: z.string(),
  status: refundRequestStatusSchema,
  adminNotes: z.string().nullable().optional(),
  resolvedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  /**
   * Whether the order was paid by manual bank or UPI transfer. Approving
   * such a request moves no money: staff return it themselves and the
   * approval must carry `outsideRefund` with the reference of that transfer.
   */
  paidByManualTransfer: z.boolean().optional(),
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

/** A refund request as the learner who filed it sees it: no internal notes. */
export const learnerRefundRequestSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  reason: z.string(),
  status: refundRequestStatusSchema,
  resolvedAt: z.string().or(z.date()).nullable(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type LearnerRefundRequest = z.infer<typeof learnerRefundRequestSchema>;

export const createStudentRefundRequestSchema = z.strictObject({
  reason: z.string().min(5).max(1000),
});
export type CreateStudentRefundRequest = z.infer<
  typeof createStudentRefundRequestSchema
>;

export const reviewRefundRequestSchema = z.strictObject({
  action: z.enum(["approve", "reject"]),
  adminNotes: z.string().max(500).optional(),
  preserveAccess: z.boolean().default(false),
  /**
   * With `approve` only, and only for an order paid by manual transfer,
   * where it is required: the reference of the transfer staff sent the money
   * back by. Refused for any other order, and when rejecting.
   */
  outsideRefund: outsideRefundSchema.optional(),
});
export type ReviewRefundRequest = z.infer<typeof reviewRefundRequestSchema>;

export const creditNoteSchema = z.strictObject({
  id: z.uuid(),
  creditNoteNumber: z.string(),
  refundId: z.uuid(),
  orderId: z.uuid(),
  userId: z.uuid(),
  totalRefundAmount: z.number().int().positive(),
  taxAdjustmentAmount: z.number().int().nonnegative().default(0),
  createdAt: z.string().or(z.date()),
});
export type CreditNote = z.infer<typeof creditNoteSchema>;

export interface CreateGatewayRefundInput {
  gatewayPaymentId: string;
  amount: number;
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

export interface GatewayRefundDetails {
  gatewayRefundId: string;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
}
