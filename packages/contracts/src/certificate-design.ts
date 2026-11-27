import { z } from "zod";

/**
 * Certificate designs (Platform > Certificates): blank certificate sheets
 * staff upload, each with where the certificate's details are printed on
 * it. One is active at a time; every certificate PDF is drawn on it.
 *
 * Positions are fractions of the page (0 = left or top, 1 = right or
 * bottom), so a layout fits a sheet of any size. A text field's `y` is its
 * baseline; the QR code's is its top edge. Font sizes are points on an A4
 * landscape page (842 pt wide) and scale with the sheet's width.
 */

export const CERTIFICATE_DESIGN_MAX_BYTES = 15 * 1024 * 1024;
/** An image must be this wide (or tall) at least, to print sharply. */
export const CERTIFICATE_DESIGN_MIN_IMAGE_SIDE = 1600;
/** The id the built-in design (shipped with the API) is known by. */
export const BUILTIN_CERTIFICATE_DESIGN_ID = "builtin";

export const certificateDesignContentTypeSchema = z.enum([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
export type CertificateDesignContentType = z.output<
  typeof certificateDesignContentTypeSchema
>;

/** The fonts bundled with the API that a field can use. */
export const certificateFontSchema = z.enum([
  "lobster",
  "arimo",
  "oswald",
  "montserrat",
]);
export type CertificateFont = z.output<typeof certificateFontSchema>;

export const CERTIFICATE_FONT_LABELS: Record<CertificateFont, string> = {
  lobster: "Lobster (script)",
  arimo: "Arimo (plain)",
  oswald: "Oswald (bold, narrow)",
  montserrat: "Montserrat (modern)",
};

const fraction = z.number().min(0).max(1);
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/u, "A colour like #B8861F");

const textFieldSchema = z.strictObject({
  enabled: z.boolean(),
  x: fraction,
  y: fraction,
  /** The widest the text may run, as a share of the page's width. */
  width: z.number().min(0.05).max(1),
  size: z.number().min(4).max(120),
  font: certificateFontSchema,
  color: colorSchema,
  align: z.enum(["left", "center", "right"]),
});
export type CertificateTextField = z.output<typeof textFieldSchema>;

export const certificateDesignLayoutSchema = z.strictObject({
  name: textFieldSchema.extend({
    /** A dotted line under the name. */
    underline: z.boolean(),
  }),
  course: textFieldSchema.extend({
    /** The sentence printed, with `{course}` where the course title goes. */
    text: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => value.includes("{course}"), {
        message: "The sentence must contain {course}",
      }),
  }),
  date: textFieldSchema,
  code: textFieldSchema,
  verifyText: textFieldSchema,
  /**
   * The academy's uploaded signature (Platform > Certificates): centre
   * across, bottom edge, width. Absent in layouts saved before signatures:
   * not printed.
   */
  signature: z
    .strictObject({
      enabled: z.boolean(),
      x: fraction,
      y: fraction,
      width: z.number().min(0.03).max(0.6),
    })
    .optional(),
  qr: z.strictObject({
    enabled: z.boolean(),
    /** Centre of the code, across. */
    x: fraction,
    /** Top edge of the code. */
    y: fraction,
    /** Its side, as a share of the page's width. */
    size: z.number().min(0.03).max(0.3),
    color: colorSchema,
  }),
});
export type CertificateDesignLayout = z.output<
  typeof certificateDesignLayoutSchema
>;

const A4_WIDTH = 841.89;
const A4_HEIGHT = 595.28;

/**
 * Where the built-in design prints each detail; also where a new upload
 * starts, ready to be moved to fit its sheet.
 */
export const DEFAULT_CERTIFICATE_LAYOUT: CertificateDesignLayout = {
  name: {
    enabled: true,
    x: 0.5,
    y: 360 / A4_HEIGHT,
    width: 520 / A4_WIDTH,
    size: 40,
    font: "lobster",
    color: "#B8861F",
    align: "center",
    underline: true,
  },
  course: {
    enabled: true,
    x: 0.5,
    y: 392 / A4_HEIGHT,
    width: 300 / A4_WIDTH,
    size: 10.2,
    font: "arimo",
    color: "#0B0B0B",
    align: "center",
    text: "Congratulations! You've successfully completed {course}.",
  },
  date: {
    enabled: true,
    x: 703.75 / A4_WIDTH,
    y: 522 / A4_HEIGHT,
    width: 160 / A4_WIDTH,
    size: 11,
    font: "arimo",
    color: "#0B0B0B",
    align: "center",
  },
  code: {
    enabled: true,
    x: 800 / A4_WIDTH,
    y: 66 / A4_HEIGHT,
    width: 200 / A4_WIDTH,
    size: 7.6,
    font: "arimo",
    color: "#6B6B6B",
    align: "right",
  },
  verifyText: {
    enabled: true,
    x: 0.5,
    y: 524 / A4_HEIGHT,
    width: 340 / A4_WIDTH,
    size: 6.4,
    font: "arimo",
    color: "#6B6B6B",
    align: "center",
  },
  signature: {
    enabled: true,
    x: 138 / A4_WIDTH,
    y: 523.3 / A4_HEIGHT,
    width: 124 / A4_WIDTH,
  },
  qr: {
    enabled: true,
    x: 0.5,
    y: 466 / A4_HEIGHT,
    size: 46 / A4_WIDTH,
    color: "#2B2B2B",
  },
};

export const certificateDesignSchema = z.object({
  /** A uuid, or `builtin` for the design that ships with the API. */
  id: z.string(),
  name: z.string(),
  kind: z.enum(["builtin", "upload"]),
  contentType: certificateDesignContentTypeSchema.nullable(),
  fileSize: z.number().int().nullable(),
  /** Page size in points. */
  pageWidth: z.number(),
  pageHeight: z.number(),
  isActive: z.boolean(),
  layout: certificateDesignLayoutSchema,
  createdAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type CertificateDesign = z.output<typeof certificateDesignSchema>;

export const certificateDesignsResponseSchema = z.object({
  items: z.array(certificateDesignSchema),
});
export type CertificateDesignsResponse = z.output<
  typeof certificateDesignsResponseSchema
>;

export const certificateDesignPresignRequestSchema = z.strictObject({
  contentType: certificateDesignContentTypeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(CERTIFICATE_DESIGN_MAX_BYTES, "The design must be 15 MB or smaller"),
});
export type CertificateDesignPresignRequest = z.input<
  typeof certificateDesignPresignRequestSchema
>;

export const certificateDesignPresignResponseSchema = z.strictObject({
  uploadId: z.uuid(),
  uploadUrl: z.string(),
});
export type CertificateDesignPresignResponse = z.output<
  typeof certificateDesignPresignResponseSchema
>;

export const createCertificateDesignRequestSchema = z.strictObject({
  uploadId: z.uuid(),
  contentType: certificateDesignContentTypeSchema,
  name: z.string().trim().min(1).max(80),
});
export type CreateCertificateDesignRequest = z.input<
  typeof createCertificateDesignRequestSchema
>;

export const updateCertificateDesignRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  layout: certificateDesignLayoutSchema.optional(),
});
export type UpdateCertificateDesignRequest = z.input<
  typeof updateCertificateDesignRequestSchema
>;

/** A sample PDF of a design, with unsaved layout changes if given. */
export const previewCertificateDesignRequestSchema = z.strictObject({
  layout: certificateDesignLayoutSchema.optional(),
});
export type PreviewCertificateDesignRequest = z.input<
  typeof previewCertificateDesignRequestSchema
>;
