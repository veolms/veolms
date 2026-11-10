import { z } from "zod";

/** The sign-in requests whose failures the browser reports back. */
export const signInFailureRequestSchema = z.enum([
  "otp-send",
  "login",
  "register",
  "oauth-url",
  "oauth-login",
  "google-one-tap",
]);

/**
 * How the request failed: no answer at all, no answer in time, or an answer
 * from the server that was an error of its own (5xx).
 */
export const signInFailureKindSchema = z.enum([
  "unreachable",
  "timeout",
  "server-error",
]);

/**
 * A sign-in request that failed in a visitor's browser. Kept there until it
 * can be delivered, so a request that never reached the server still leaves
 * a trace once the connection works again.
 */
export const signInFailureReportSchema = z.object({
  request: signInFailureRequestSchema,
  kind: signInFailureKindSchema,
  /** HTTP status of an answer that came back; absent when none did. */
  status: z.number().int().min(100).max(599).optional(),
  code: z.string().max(64).optional(),
  occurredAt: z.string().datetime(),
  /** How long the request ran before it failed. */
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
  /** `navigator.onLine` when it failed. */
  online: z.boolean().optional(),
  /**
   * The email or phone number typed into the form. The server keeps only a
   * hash of it, which lets support match a student's report to their address.
   */
  identifier: z.string().max(254).optional(),
});

export const signInFailureReportRequestSchema = z.object({
  reports: z.array(signInFailureReportSchema).min(1).max(10),
});

export type SignInFailureRequest = z.output<typeof signInFailureRequestSchema>;
export type SignInFailureKind = z.output<typeof signInFailureKindSchema>;
export type SignInFailureReport = z.input<typeof signInFailureReportSchema>;
export type SignInFailureReportRequest = z.input<
  typeof signInFailureReportRequestSchema
>;
