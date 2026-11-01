import { z } from "zod";

/**
 * The academy's name and logo as its emails and pages present them. Set
 * during setup and changed later by an administrator.
 */
export const academyBrandResponseSchema = z.object({
  name: z.string().max(255).meta({ example: "ProCodrr" }),
  logoUrl: z
    .string()
    .nullable()
    .meta({ example: "https://www.procodrr.dev/static/email-logo.png" }),
});

/** Changes the academy's name. The logo is uploaded or removed on its own. */
export const updateAcademyBrandRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter the academy's name").max(255),
});

/**
 * The image types a logo may be: the ones every mail app shows and an
 * invoice PDF can draw.
 */
export const ACADEMY_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
export type AcademyLogoContentType =
  (typeof ACADEMY_LOGO_CONTENT_TYPES)[number];
export const ACADEMY_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const academyLogoContentTypeSchema = z.enum(ACADEMY_LOGO_CONTENT_TYPES, {
  message: "Upload a PNG or JPEG image",
});

/** Asks for an address the browser uploads a new logo to. */
export const academyLogoPresignRequestSchema = z.strictObject({
  contentType: academyLogoContentTypeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(ACADEMY_LOGO_MAX_BYTES, "The logo must be 2 MB or smaller"),
});

export const academyLogoPresignResponseSchema = z.strictObject({
  uploadId: z.uuid(),
  uploadUrl: z.string(),
});

/** Makes an uploaded logo the academy's logo. */
export const academyLogoCompleteRequestSchema = z.strictObject({
  uploadId: z.uuid(),
  contentType: academyLogoContentTypeSchema,
});

export type AcademyBrandResponse = z.output<typeof academyBrandResponseSchema>;
export type UpdateAcademyBrandRequest = z.input<
  typeof updateAcademyBrandRequestSchema
>;
export type AcademyLogoPresignRequest = z.input<
  typeof academyLogoPresignRequestSchema
>;
export type AcademyLogoPresignResponse = z.output<
  typeof academyLogoPresignResponseSchema
>;
export type AcademyLogoCompleteRequest = z.input<
  typeof academyLogoCompleteRequestSchema
>;
