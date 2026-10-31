import { z } from "zod";
import {
  DEFAULT_PLATFORM_APPEARANCE_SETTINGS,
  MAX_MAX_DEVICES_PER_STUDENT,
  MAX_MAX_SIMULTANEOUS_STREAMS,
  MIN_MAX_DEVICES_PER_STUDENT,
  MIN_MAX_SIMULTANEOUS_STREAMS,
  PLATFORM_DISPLAY_MODES,
  type PlatformAppearanceSettings,
  type PlatformInvoiceSettings,
  type PlatformSecuritySettings,
  type PlatformSettings,
  type PublicPlatformSettings,
} from "./platform-settings-defaults.ts";

export * from "./platform-settings-defaults.ts";

export const platformAppearanceSettingsSchema = z.strictObject({
  defaultDisplayMode: z
    .enum(PLATFORM_DISPLAY_MODES)
    .default(DEFAULT_PLATFORM_APPEARANCE_SETTINGS.defaultDisplayMode),
  // The theme list belongs to the web app; the API only checks the id's form.
  defaultColorTheme: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,39}$/, "Choose one of the colour themes")
    .default(DEFAULT_PLATFORM_APPEARANCE_SETTINGS.defaultColorTheme)
    .meta({ example: "ocean" }),
}) satisfies z.ZodType<PlatformAppearanceSettings>;

export const platformSecuritySettingsSchema = z.strictObject({
  requireVerifiedPhoneForEnrollment: z.boolean(),
  maxDevicesPerStudent: z
    .number()
    .int()
    .min(MIN_MAX_DEVICES_PER_STUDENT)
    .max(MAX_MAX_DEVICES_PER_STUDENT)
    .nullable(),
  maxSimultaneousStreams: z
    .number()
    .int()
    .min(MIN_MAX_SIMULTANEOUS_STREAMS)
    .max(MAX_MAX_SIMULTANEOUS_STREAMS)
    .nullable(),
}) satisfies z.ZodType<PlatformSecuritySettings>;

/** A GSTIN: state code, PAN, entity number, "Z", check character. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * The invoice details, field by field. Every text field may be empty, which
 * leaves that line off the invoice.
 */
export const platformInvoiceSettingsSchema = z.strictObject({
  companyName: z.string().trim().max(120),
  address: z.string().trim().max(400),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === "" || GSTIN_PATTERN.test(value),
      "Enter a 15-character GSTIN, such as 29ABCDE1234F1Z5",
    ),
  email: z.union([z.literal(""), z.email("Enter an email address").max(254)]),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, "Use digits, spaces, +, - and brackets only"),
  numberPrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{0,12}$/, "Use up to 12 letters, digits or hyphens")
    .meta({ example: "2e50" }),
  signatoryLabel: z.string().trim().max(60),
  footerNote: z.string().trim().max(200),
  showLogo: z.boolean(),
}) satisfies z.ZodType<PlatformInvoiceSettings>;

export const platformSettingsSchema = z.strictObject({
  appearance: platformAppearanceSettingsSchema,
  security: platformSecuritySettingsSchema,
  invoice: platformInvoiceSettingsSchema,
}) satisfies z.ZodType<PlatformSettings>;

export const platformSettingsResponseSchema = z.strictObject({
  settings: platformSettingsSchema,
  /** Null until an admin saves for the first time (the defaults apply). */
  updatedAt: z.string().nullable(),
});
export type PlatformSettingsResponse = z.infer<
  typeof platformSettingsResponseSchema
>;

/**
 * Changes one or more settings; what is left out keeps its saved value. Each
 * control on the Platform page saves on its own, as the Settings page does.
 */
export const updatePlatformSettingsRequestSchema = z
  .strictObject({
    appearance: z
      .strictObject({
        defaultDisplayMode: z.enum(PLATFORM_DISPLAY_MODES),
        defaultColorTheme: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,39}$/, "Choose one of the colour themes"),
      })
      .partial()
      .optional(),
    security: platformSecuritySettingsSchema.partial().optional(),
    invoice: platformInvoiceSettingsSchema.partial().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value.appearance ?? {}).length > 0 ||
      Object.keys(value.security ?? {}).length > 0 ||
      Object.keys(value.invoice ?? {}).length > 0,
    "Nothing to change",
  );
export type UpdatePlatformSettingsRequest = z.input<
  typeof updatePlatformSettingsRequestSchema
>;

/**
 * What every visitor's browser needs before it shows a page: the default look
 * and the student rules the screens follow. Nothing in it is private; the
 * invoice details are not part of it.
 */
export const publicPlatformSettingsResponseSchema = platformSettingsSchema.omit(
  { invoice: true },
) satisfies z.ZodType<PublicPlatformSettings>;
export type PublicPlatformSettingsResponse = PublicPlatformSettings;

/**
 * The last "Rebuild all public pages" of the API process that answers: every
 * course page, lesson page and the home page built again and deployed.
 */
export const staticSiteRebuildStatusSchema = z.strictObject({
  status: z.enum(["idle", "queued", "running", "succeeded", "failed"]),
  message: z.string().nullable(),
  updatedAt: z.string(),
  runUrl: z.string().url().nullable(),
});
export type StaticSiteRebuildStatus = z.infer<
  typeof staticSiteRebuildStatusSchema
>;
z.globalRegistry.add(staticSiteRebuildStatusSchema, {
  id: "StaticSiteRebuildStatus",
});
