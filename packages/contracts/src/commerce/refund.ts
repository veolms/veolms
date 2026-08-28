import { z } from "zod";

export const refundStatusSchema = z.enum(["pending", "processed", "failed"]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

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
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
  preserveAccess: z.boolean().default(false),
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
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

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
