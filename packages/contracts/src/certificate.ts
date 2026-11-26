import { z } from "zod";

/**
 * Course certificates. A learner who reaches a course's completion
 * threshold (90% unless the course asks for another) unlocks a certificate,
 * confirms the name to print and claims it. The certificate is a snapshot:
 * later course or name changes do not alter it. Anyone can check it at
 * `/certificate/<code>`.
 */

/** Crockford base32: digits and capitals without I, L, O and U. */
export const CERTIFICATE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 16 characters carry 80 random bits. */
export const CERTIFICATE_CODE_LENGTH = 16;
/** What a course asks for when neither it nor the academy sets a share. */
export const CERTIFICATE_DEFAULT_THRESHOLD_PERCENT = 95;
export const CERTIFICATE_MIN_THRESHOLD_PERCENT = 50;
export const CERTIFICATE_NAME_MIN_LENGTH = 2;
export const CERTIFICATE_NAME_MAX_LENGTH = 80;
/**
 * How many times a learner may update the printed name from their profile
 * after the certificate is issued.
 */
export const CERTIFICATE_NAME_CORRECTIONS_ALLOWED = 2;

/**
 * The stored form of a code someone typed or followed: upper case, without
 * spaces or dashes, with the letters people confuse read as Crockford does
 * (O as 0, I and L as 1). Null when it cannot be a certificate code.
 */
export function normalizeCertificateCode(value: string): string | null {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, "")
    .replace(/O/gu, "0")
    .replace(/[IL]/gu, "1");
  if (code.length < CERTIFICATE_CODE_LENGTH || code.length > 32) return null;
  for (const character of code) {
    if (!CERTIFICATE_CODE_ALPHABET.includes(character)) return null;
  }
  return code;
}

/** "7P5S1588Z9M04ASG" is shown as "7P5S-1588-Z9M0-4ASG". */
export function formatCertificateCode(code: string): string {
  return code.match(/.{1,4}/gu)?.join("-") ?? code;
}

/**
 * The name as it will be printed: Unicode-normalised, trimmed, with single
 * spaces.
 */
export function normalizeCertificateName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/**
 * English letters (accented ones included: Zoë, Ñandú), spaces, and the
 * punctuation names use (. ' ’ -). Names are printed in English in the
 * certificate's script font, so other alphabets are refused. No digits,
 * links, emoji or symbols: the name is also shown on a public page.
 */
const CERTIFICATE_NAME_PATTERN =
  /^\p{Script=Latin}[\p{Script=Latin}\p{M} .'’-]*$/u;

/** Why a name cannot be printed, or null when it can. */
export function certificateNameProblem(value: string): string | null {
  const name = normalizeCertificateName(value);
  const length = [...name].length;
  if (length < CERTIFICATE_NAME_MIN_LENGTH) {
    return "Enter your full name.";
  }
  if (length > CERTIFICATE_NAME_MAX_LENGTH) {
    return `Keep the name under ${CERTIFICATE_NAME_MAX_LENGTH + 1} characters.`;
  }
  if (!CERTIFICATE_NAME_PATTERN.test(name)) {
    // Letters of another alphabet (Hindi, say): ask for English ones.
    const onlyLetters = /^[\p{L}\p{M} .'’-]+$/u.test(name);
    return onlyLetters
      ? "Write your name in English letters."
      : "Use letters, spaces and . ' - only.";
  }
  return null;
}

export const certificateStatusSchema = z.enum(["active", "revoked"]);
export type CertificateStatus = z.output<typeof certificateStatusSchema>;

/** A certificate as its owner sees it. */
export const myCertificateSchema = z.object({
  code: z.string(),
  displayCode: z.string(),
  courseId: z.uuid().nullable(),
  courseSlug: z.string().nullable(),
  courseTitle: z.string(),
  recipientName: z.string(),
  academyName: z.string(),
  /** YYYY-MM-DD in the academy's time zone. */
  issuedOn: z.string(),
  issuedAt: z.iso.datetime(),
  status: certificateStatusSchema,
  revision: z.number().int(),
  verifyUrl: z.string(),
  nameCorrectionsLeft: z.number().int().min(0),
});
export type MyCertificate = z.output<typeof myCertificateSchema>;

export const myCertificatesResponseSchema = z.object({
  items: z.array(myCertificateSchema),
});
export type MyCertificatesResponse = z.output<
  typeof myCertificatesResponseSchema
>;

/**
 * Where a learner stands with one course's certificate:
 * - `disabled`: the course gives none;
 * - `locked`: not at the threshold yet;
 * - `unlocked`: ready to claim;
 * - `issued`: claimed (`certificate` is set).
 */
export const courseCertificateStateSchema = z.enum([
  "disabled",
  "locked",
  "unlocked",
  "issued",
]);
export type CourseCertificateState = z.output<
  typeof courseCertificateStateSchema
>;

export const courseCertificateStatusSchema = z.object({
  state: courseCertificateStateSchema,
  courseId: z.uuid(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  thresholdPercent: z.number().int(),
  /** Share of the course's lessons completed, 0–100, one decimal. */
  progressPercent: z.number(),
  completedLessons: z.number().int(),
  totalLessons: z.number().int(),
  /**
   * The name the certificate will carry: the learner's profile name, never
   * typed at claim time. To change it, the learner edits their profile.
   */
  recipientName: z.string(),
  /**
   * Why the profile name cannot be printed (another alphabet, digits…), or
   * null. The claim is refused until the profile is fixed.
   */
  nameProblem: z.string().nullable(),
  certificate: myCertificateSchema.nullable(),
});
export type CourseCertificateStatus = z.output<
  typeof courseCertificateStatusSchema
>;

/**
 * What anyone may see at `/certificate/<code>`. Never the learner's email,
 * progress, scores or payment. `recipientName` is null when the learner's
 * account was deleted.
 */
export const publicCertificateSchema = z.object({
  code: z.string(),
  displayCode: z.string(),
  status: z.enum(["valid", "revoked"]),
  recipientName: z.string().nullable(),
  courseTitle: z.string(),
  courseSlug: z.string().nullable(),
  academyName: z.string(),
  issuedOn: z.string(),
  revokedOn: z.string().nullable(),
  verifyUrl: z.string(),
  /** The academy's LinkedIn company page id, for "Add to profile". */
  linkedInOrganizationId: z.string().nullable(),
});
export type PublicCertificate = z.output<typeof publicCertificateSchema>;

/** A certificate in a course's staff list. */
export const staffCertificateSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  displayCode: z.string(),
  learner: z
    .object({
      id: z.uuid(),
      name: z.string(),
      email: z.string().nullable(),
    })
    .nullable(),
  recipientName: z.string(),
  issuedOn: z.string(),
  issuedAt: z.iso.datetime(),
  status: certificateStatusSchema,
  revision: z.number().int(),
  revokedAt: z.iso.datetime().nullable(),
  revokeReason: z.string().nullable(),
});
export type StaffCertificate = z.output<typeof staffCertificateSchema>;

export const courseCertificatesQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(120).optional(),
});
export type CourseCertificatesQuery = z.input<
  typeof courseCertificatesQuerySchema
>;

export const CERTIFICATE_COURSE_NOTE_MAX_LENGTH = 160;

export const courseCertificatesResponseSchema = z.object({
  thresholdPercent: z.number().int(),
  /** Whether the course sets its own share, or uses the academy's. */
  thresholdSource: z.enum(["course", "academy"]),
  /** The course's own line under its title on the certificate, or null. */
  courseNote: z.string().nullable(),
  /** The line written from the course's length, used without its own. */
  autoCourseNote: z.string().nullable(),
  issuedCount: z.number().int(),
  items: z.array(staffCertificateSchema),
  nextCursor: z.string().nullable(),
});
export type CourseCertificatesResponse = z.output<
  typeof courseCertificatesResponseSchema
>;

export const updateCourseCertificateSettingsRequestSchema = z.object({
  /** Null: the course uses the academy's share (Platform > Certificates). */
  thresholdPercent: z
    .number()
    .int()
    .min(CERTIFICATE_MIN_THRESHOLD_PERCENT)
    .max(100)
    .nullable()
    .optional(),
  /**
   * The line under the course title on the certificate. Null or empty:
   * written from the course's length.
   */
  courseNote: z
    .string()
    .trim()
    .max(CERTIFICATE_COURSE_NOTE_MAX_LENGTH)
    .nullable()
    .optional()
    .transform((value) =>
      value ? value : value === undefined ? undefined : null,
    ),
});
export type UpdateCourseCertificateSettingsRequest = z.input<
  typeof updateCourseCertificateSettingsRequestSchema
>;

export const courseCertificateSettingsSchema = z.object({
  thresholdPercent: z.number().int(),
  thresholdSource: z.enum(["course", "academy"]),
  courseNote: z.string().nullable(),
  autoCourseNote: z.string().nullable(),
});
export type CourseCertificateSettings = z.output<
  typeof courseCertificateSettingsSchema
>;

export const revokeCertificateRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RevokeCertificateRequest = z.input<
  typeof revokeCertificateRequestSchema
>;

/**
 * The academy's certificate settings (Platform > Certificates), for staff
 * with `certificate.issue`.
 */
export const certificateAcademySettingsSchema = z.object({
  /** The share of lessons a course asks for unless it sets its own. */
  thresholdPercent: z.number().int(),
  /**
   * Issue the certificate, and email it, as soon as a learner reaches the
   * share (with a printable profile name). Off: learners claim it.
   */
  autoIssue: z.boolean(),
  /** The uploaded signature printed on certificates, or none. */
  signature: z
    .object({
      contentType: z.enum(["image/png", "image/jpeg"]),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
});
export type CertificateAcademySettings = z.output<
  typeof certificateAcademySettingsSchema
>;

export const updateCertificateAcademySettingsRequestSchema = z.strictObject({
  thresholdPercent: z
    .number()
    .int()
    .min(CERTIFICATE_MIN_THRESHOLD_PERCENT)
    .max(100)
    .optional(),
  autoIssue: z.boolean().optional(),
});
export type UpdateCertificateAcademySettingsRequest = z.input<
  typeof updateCertificateAcademySettingsRequestSchema
>;

export const CERTIFICATE_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
export const CERTIFICATE_SIGNATURE_MIN_WIDTH = 300;

export const certificateSignaturePresignRequestSchema = z.strictObject({
  contentType: z.enum(["image/png", "image/jpeg"]),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(
      CERTIFICATE_SIGNATURE_MAX_BYTES,
      "The signature must be 2 MB or smaller",
    ),
});
export type CertificateSignaturePresignRequest = z.input<
  typeof certificateSignaturePresignRequestSchema
>;

export const certificateSignatureCompleteRequestSchema = z.strictObject({
  uploadId: z.uuid(),
  contentType: z.enum(["image/png", "image/jpeg"]),
});
export type CertificateSignatureCompleteRequest = z.input<
  typeof certificateSignatureCompleteRequestSchema
>;

/** A learner staff may issue a course's certificate to by hand. */
export const certificateCandidateSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  /** Share of the course's lessons finished, 0–100. */
  progressPercent: z.number(),
  /** The learner holds an active certificate for the course already. */
  hasCertificate: z.boolean(),
  /** Why their profile name cannot be printed, or null. */
  nameProblem: z.string().nullable(),
});
export type CertificateCandidate = z.output<typeof certificateCandidateSchema>;

export const certificateCandidatesResponseSchema = z.object({
  items: z.array(certificateCandidateSchema),
});
export type CertificateCandidatesResponse = z.output<
  typeof certificateCandidatesResponseSchema
>;

export const certificateCandidatesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});

/** Issue a course's certificate to a learner, whatever their progress. */
export const issueCertificateRequestSchema = z.strictObject({
  userId: z.uuid(),
});
export type IssueCertificateRequest = z.input<
  typeof issueCertificateRequestSchema
>;
