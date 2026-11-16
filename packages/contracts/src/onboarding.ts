import { z } from "zod";

/**
 * A new academy's first hour: the academy's "first five moves" (every
 * academy), the sign-in hand-over from the platform site to the academy's
 * own address, and the creator sign-up that makes an academy (answered only
 * by a deployment that serves many academies).
 */

// ─── First five moves (admin home) ────────────────────────────────────────

export const firstMovesResponseSchema = z.object({
  moves: z.object({
    /** A logo was added, or a colour other than the default was chosen. */
    look: z.boolean(),
    /** The academy's own payment account is connected. */
    payments: z.boolean(),
    /** There is at least one course. */
    course: z.boolean(),
    /** At least one order was paid. */
    testPurchase: z.boolean(),
    /** The academy's link was copied or shared from the checklist. */
    share: z.boolean(),
  }),
  /** The academy was launched on the sign-up stage, so it can be replayed. */
  launchReplay: z.boolean(),
});

export type FirstMovesResponse = z.output<typeof firstMovesResponseSchema>;
export type FirstMoveKey = keyof FirstMovesResponse["moves"];

// ─── Sign-in hand-over ────────────────────────────────────────────────────

export const signInHandoffRequestSchema = z.strictObject({
  token: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .meta({ description: "The one-time token the person arrived with." }),
});

export type SignInHandoffRequest = z.input<typeof signInHandoffRequestSchema>;

// ─── Creator sign-up (cloud) ──────────────────────────────────────────────

export const ACADEMY_SLUG_MIN_LENGTH = 3;
export const ACADEMY_SLUG_MAX_LENGTH = 30;
export const ACADEMY_NAME_MAX_LENGTH = 60;

/** An academy's address: lowercase letters and numbers only. */
export const academySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(ACADEMY_SLUG_MIN_LENGTH, "At least 3 letters or numbers")
  .max(ACADEMY_SLUG_MAX_LENGTH, "At most 30 letters or numbers")
  .regex(/^[a-z0-9]+$/u, "Only letters and numbers");

export const academyNameSchema = z
  .string()
  .trim()
  .min(2, "At least 2 characters")
  .max(ACADEMY_NAME_MAX_LENGTH, "At most 60 characters");

export const onboardingAcademySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  /** Its address, such as `procodrr.veolms.app`. */
  host: z.string(),
  status: z.enum(["trial", "active", "suspended", "closed"]),
  trialEndsAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const onboardingDraftSchema = z.object({
  name: z.string(),
  slug: z.string(),
  agreed: z.boolean(),
});

export const onboardingStateResponseSchema = z.object({
  /** The suffix every academy address ends in, such as `veolms.app`. */
  academyDomain: z.string(),
  /** How many academies one creator may run. */
  maxAcademies: z.number().int().positive(),
  draft: onboardingDraftSchema.nullable(),
  academies: z.array(onboardingAcademySchema),
});

export const saveOnboardingDraftRequestSchema = z.strictObject({
  name: z.string().trim().max(ACADEMY_NAME_MAX_LENGTH),
  slug: z.string().trim().toLowerCase().max(ACADEMY_SLUG_MAX_LENGTH),
  agreed: z.boolean(),
});

export const academyAddressQuerySchema = z.object({
  slug: z.string().max(80),
});

export const academyAddressStateSchema = z.enum([
  "ok",
  "short",
  "invalid",
  "reserved",
  "taken",
]);

export const academyAddressResponseSchema = z.object({
  slug: z.string(),
  state: academyAddressStateSchema,
  /** Free addresses like the one asked for, when it is taken or reserved. */
  suggestions: z.array(z.string()),
});

export const launchAcademyRequestSchema = z.strictObject({
  name: academyNameSchema,
  slug: academySlugSchema,
  /** Terms, Acceptable use, Privacy and Data processing. */
  agreed: z.literal(true, "Agree to the policies to continue"),
});

export const launchAcademyResponseSchema = z.object({
  academy: onboardingAcademySchema,
});

export const academyHandoffResponseSchema = z.object({
  /** Opens the academy's admin home, signed in. Valid for a minute, once. */
  url: z.url(),
});

export type OnboardingAcademy = z.output<typeof onboardingAcademySchema>;
export type OnboardingDraft = z.output<typeof onboardingDraftSchema>;
export type OnboardingStateResponse = z.output<
  typeof onboardingStateResponseSchema
>;
export type SaveOnboardingDraftRequest = z.input<
  typeof saveOnboardingDraftRequestSchema
>;
export type AcademyAddressState = z.output<typeof academyAddressStateSchema>;
export type AcademyAddressResponse = z.output<
  typeof academyAddressResponseSchema
>;
export type LaunchAcademyRequest = z.input<typeof launchAcademyRequestSchema>;
export type LaunchAcademyResponse = z.output<
  typeof launchAcademyResponseSchema
>;
export type AcademyHandoffResponse = z.output<
  typeof academyHandoffResponseSchema
>;
