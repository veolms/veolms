import { z } from "zod";

export const coursePublishedEventSchema = z.strictObject({
  courseId: z.uuid(),
  courseSlug: z.string().min(1).max(160),
  courseTitle: z.string().min(1).max(255),
  creatorUserId: z.uuid(),
});

export const paymentCompletedEventSchema = z.strictObject({
  paymentId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  totalAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  itemTitles: z.array(z.string().min(1).max(255)).min(1).max(100),
});

export const paymentFailedEventSchema = z.strictObject({
  paymentId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  reason: z.string().min(1).max(1000),
});

export const refundCompletedEventSchema = z.strictObject({
  refundId: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string().min(1).max(100),
  recipientUserId: z.uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
});

export const videoProcessingEventSchema = z.strictObject({
  mediaId: z.uuid(),
  recipientUserId: z.uuid(),
  filename: z.string().min(1).max(255),
  error: z.string().min(1).max(2000).optional(),
});

export const authMfaEnabledEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
});

export const authPasskeyAddedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  passkeyId: z.uuid(),
});

export const authSessionRevokedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  sessionId: z.uuid(),
});

export const userMentionedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  actorName: z.string().min(1).max(255),
  context: z.string().min(1).max(1000),
  deepLink: z
    .string()
    .min(1)
    .max(1000)
    .regex(/^\/(?!\/)/u, "Deep links must be internal application paths."),
});

export const certificateGeneratedEventSchema = z.strictObject({
  recipientUserId: z.uuid(),
  courseTitle: z.string().min(1).max(255),
  certificateId: z.uuid(),
});
