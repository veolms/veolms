import { z } from "zod";

/**
 * Changing one's own email address or mobile number: the current value is
 * proven with a code first, then the new one (`/auth/me/contact-changes`).
 */
export const contactChannelSchema = z.enum(["email", "phone"]);
export type ContactChannel = z.infer<typeof contactChannelSchema>;

const codeSchema = z
  .string()
  .length(6, "Code must be exactly 6 digits")
  .regex(/^\d+$/, "Code must contain only digits")
  .meta({ example: "123456" });

export const contactChangeStartRequestSchema = z.strictObject({
  channel: contactChannelSchema,
});
export type ContactChangeStartRequest = z.infer<
  typeof contactChangeStartRequestSchema
>;

/** A change in progress, and what it waits for next. */
export const contactChangeResponseSchema = z.strictObject({
  id: z.uuid(),
  channel: contactChannelSchema,
  /**
   * `prove_current`: enter the code sent to the current value.
   * `confirm_new`: enter the new value, then the code sent to it.
   */
  step: z.enum(["prove_current", "confirm_new"]),
  /** Where the last code went, partly hidden ("n*****@getgtm.ai"); null before any. */
  sentTo: z.string().nullable(),
  /** How long the code just sent stays valid; null when none was sent. */
  codeExpiresInSeconds: z.number().int().positive().nullable(),
  /** When the change closes and has to be started again. */
  expiresAt: z.string().or(z.date()),
});
export type ContactChangeResponse = z.infer<typeof contactChangeResponseSchema>;

export const contactChangeCodeRequestSchema = z.strictObject({
  code: codeSchema,
});
export type ContactChangeCodeRequest = z.infer<
  typeof contactChangeCodeRequestSchema
>;

/** The new email address or number; checked for its channel by the server. */
export const contactChangeNewValueRequestSchema = z.strictObject({
  value: z.string().trim().min(3).max(255),
});
export type ContactChangeNewValueRequest = z.infer<
  typeof contactChangeNewValueRequestSchema
>;

export const contactChangeConfirmRequestSchema = z.strictObject({
  value: z.string().trim().min(3).max(255),
  code: codeSchema,
});
export type ContactChangeConfirmRequest = z.infer<
  typeof contactChangeConfirmRequestSchema
>;

export const contactChangeCompletedResponseSchema = z.strictObject({
  channel: contactChannelSchema,
  /** The value now on the account, confirmed. */
  value: z.string(),
});
export type ContactChangeCompletedResponse = z.infer<
  typeof contactChangeCompletedResponseSchema
>;
