import { z } from "zod";

/**
 * The academy's legal and company pages (Terms, Privacy, Refunds, ...).
 * Each starts as a default template (`legal-page-defaults/`) with
 * placeholders filled from the academy's details, and an administrator may
 * replace its words on the Platform page. A saved page keeps placeholders,
 * so a later change to the details shows on it too.
 */

export const LEGAL_PAGE_SLUGS = [
  "terms",
  "privacy",
  "policies",
  "community-guidelines",
  "about",
  "contact",
  "delete-account",
] as const;
export type LegalPageSlug = (typeof LEGAL_PAGE_SLUGS)[number];

export const legalPageSlugSchema = z.enum(LEGAL_PAGE_SLUGS);

/** The words a template may contain, each replaced on every page. */
export const LEGAL_PAGE_PLACEHOLDERS = [
  "academyName",
  "companyName",
  "contactEmail",
  "postalAddress",
  "grievanceOfficer",
  "siteUrl",
] as const;
export type LegalPagePlaceholder = (typeof LEGAL_PAGE_PLACEHOLDERS)[number];
export type LegalPageValues = Record<LegalPagePlaceholder, string>;

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/**
 * `text` with each `{{placeholder}}` replaced by its value. An unknown name
 * is left as written, so a typo shows on the page instead of vanishing.
 */
export function fillLegalTemplate(
  text: string,
  values: LegalPageValues,
): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    (LEGAL_PAGE_PLACEHOLDERS as readonly string[]).includes(name)
      ? values[name as LegalPagePlaceholder]
      : match,
  );
}

/** The placeholders `text` uses whose value is empty. */
export function emptyLegalPlaceholders(
  text: string,
  values: LegalPageValues,
): LegalPagePlaceholder[] {
  const empty = new Set<LegalPagePlaceholder>();
  for (const [, name] of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (
      (LEGAL_PAGE_PLACEHOLDERS as readonly string[]).includes(name!) &&
      !values[name as LegalPagePlaceholder].trim()
    ) {
      empty.add(name as LegalPagePlaceholder);
    }
  }
  return [...empty];
}

/** The words of a page, with or without its placeholders filled. */
export const legalPageContentSchema = z.strictObject({
  /** The browser tab's title. */
  title: z.string().trim().min(1, "Enter a title").max(160),
  /** What search engines and link previews show. */
  description: z.string().trim().max(300),
  /** The heading at the top of the page. */
  heading: z.string().trim().min(1, "Enter a heading").max(160),
  /** "Effective date: ...", as the page states it; null for none. */
  effective: z.string().trim().max(160).nullable(),
  /**
   * The page in Markdown: its opening paragraphs, then one `## ` heading
   * per section, which the page numbers and lists under "On this page".
   */
  markdown: z.string().max(100_000),
});
export type LegalPageContent = z.infer<typeof legalPageContentSchema>;

/** A page as visitors read it: placeholders filled. */
export const legalPageResponseSchema = legalPageContentSchema.extend({
  slug: legalPageSlugSchema,
  /** Whether an administrator replaced the default words. */
  customized: z.boolean(),
  updatedAt: z.string().nullable(),
  /** Who the page is from, for its header, footer and contact box. */
  details: z.strictObject({
    academyName: z.string(),
    companyName: z.string(),
    contactEmail: z.string(),
  }),
});
export type LegalPageResponse = z.infer<typeof legalPageResponseSchema>;

const legalPageValuesSchema = z.strictObject({
  academyName: z.string(),
  companyName: z.string(),
  contactEmail: z.string(),
  postalAddress: z.string(),
  grievanceOfficer: z.string(),
  siteUrl: z.string(),
}) satisfies z.ZodType<LegalPageValues>;

/** A page as the Platform page edits it: placeholders kept. */
export const adminLegalPageResponseSchema = z.strictObject({
  slug: legalPageSlugSchema,
  /** The words in force: the saved ones, or the default template. */
  content: legalPageContentSchema,
  /** The default template, for "Restore the default". */
  defaultContent: legalPageContentSchema,
  customized: z.boolean(),
  updatedAt: z.string().nullable(),
  /** What each placeholder reads as now, for the preview. */
  values: legalPageValuesSchema,
});
export type AdminLegalPageResponse = z.infer<
  typeof adminLegalPageResponseSchema
>;

export const adminLegalPageListResponseSchema = z.strictObject({
  pages: z.array(
    z.strictObject({
      slug: legalPageSlugSchema,
      title: z.string(),
      customized: z.boolean(),
      updatedAt: z.string().nullable(),
      /** Placeholders the page uses that have no value yet. */
      missing: z.array(z.enum(LEGAL_PAGE_PLACEHOLDERS)),
    }),
  ),
  values: legalPageValuesSchema,
});
export type AdminLegalPageListResponse = z.infer<
  typeof adminLegalPageListResponseSchema
>;

export const updateLegalPageRequestSchema = legalPageContentSchema;
export type UpdateLegalPageRequest = z.infer<
  typeof updateLegalPageRequestSchema
>;

z.globalRegistry.add(legalPageResponseSchema, { id: "LegalPage" });
z.globalRegistry.add(adminLegalPageResponseSchema, { id: "AdminLegalPage" });
