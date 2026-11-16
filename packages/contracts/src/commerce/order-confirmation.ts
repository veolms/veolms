import { z } from "zod";

import { orderStatusSchema } from "./order.ts";

/**
 * `GET /orders/:orderId/confirmation`: the buyer's own order as the order
 * page shows it right after paying, and whenever they come back to it (the
 * confirmation email links here). Amounts are in minor units.
 *
 * `state` is what the page says:
 * - `paid`: the payment went through (`free` when nothing was charged);
 * - `pending`: not confirmed yet (a UPI payment can take a moment);
 * - `failed`: not completed (failed, cancelled or the checkout ran out);
 * - `refunded`: paid, then refunded in full or in part.
 */
export const orderConfirmationStateSchema = z.enum([
  "paid",
  "free",
  "pending",
  "failed",
  "refunded",
]);
export type OrderConfirmationState = z.infer<
  typeof orderConfirmationStateSchema
>;

export const orderConfirmationWelcomeSchema = z.strictObject({
  /** The creator's message with the buyer's name filled in. */
  message: z.string(),
  link: z.strictObject({ label: z.string(), url: z.string() }).nullable(),
});
export type OrderConfirmationWelcome = z.infer<
  typeof orderConfirmationWelcomeSchema
>;

export const orderConfirmationSessionSchema = z.strictObject({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: z.string(),
});

/** Where an item's main button leads. */
export const orderConfirmationNextSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("course"),
    /** The `/learn/:key` key of the course to open. */
    courseKey: z.string(),
    courseSlug: z.string(),
  }),
  z.strictObject({
    kind: z.literal("workshop"),
    workshopSlug: z.string(),
    /** The next session still to come; null once all have ended. */
    nextSession: orderConfirmationSessionSchema.nullable(),
  }),
  /** Nothing to open from here (a quiz, or something since removed). */
  z.strictObject({ kind: z.literal("none") }),
]);
export type OrderConfirmationNext = z.infer<typeof orderConfirmationNextSchema>;

export const orderConfirmationItemSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  amount: z.number().int().nonnegative(),
  next: orderConfirmationNextSchema,
  /** The creator's welcome for this item; null when they wrote none. */
  welcome: orderConfirmationWelcomeSchema.nullable(),
});
export type OrderConfirmationItem = z.infer<typeof orderConfirmationItemSchema>;

export const orderConfirmationSchema = z.strictObject({
  id: z.uuid(),
  orderNumber: z.string(),
  state: orderConfirmationStateSchema,
  status: orderStatusSchema,
  currency: z.string().length(3),
  subtotalAmount: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  refundedAmount: z.number().int().nonnegative(),
  /** How it was paid ("UPI", "Card"…); null when not paid or unknown. */
  paymentMethod: z.string().nullable(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  /** An invoice PDF can be downloaded (a paid order with an amount). */
  invoiceAvailable: z.boolean(),
  /** Where the confirmation email went, partly hidden: "a•••@gmail.com". */
  emailHint: z.string().nullable(),
  items: z.array(orderConfirmationItemSchema),
});
export type OrderConfirmation = z.infer<typeof orderConfirmationSchema>;
