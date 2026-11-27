import { z } from "zod";
import { staticSiteRebuildStatusSchema } from "./platform-settings.ts";

/**
 * The legal and company pages an administrator may rewrite (Platform →
 * Legal pages). Each is a page of the web app with built-in text; a saved
 * version replaces that text on the next build of the public pages, and
 * removing it brings the built-in text back.
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
export const legalPageSlugSchema = z.enum(LEGAL_PAGE_SLUGS);
export type LegalPageSlug = z.infer<typeof legalPageSlugSchema>;

export const LEGAL_PAGE_LIMITS = {
  title: 120,
  description: 320,
  heading: 160,
  effective: 120,
  markdown: 200_000,
} as const;

/**
 * What an administrator writes for one page. The body is Markdown: each
 * `## Heading {#anchor}` starts a numbered section whose anchor the page's
 * "On this page" lists link to; raw HTML in it is not rendered.
 */
export const legalPageContentSchema = z.strictObject({
  /** The browser tab and search result title. */
  title: z.string().trim().min(1).max(LEGAL_PAGE_LIMITS.title),
  /** The meta description search engines show under the title. */
  description: z.string().trim().min(1).max(LEGAL_PAGE_LIMITS.description),
  /** The page's own heading. */
  heading: z.string().trim().min(1).max(LEGAL_PAGE_LIMITS.heading),
  /** "Effective date: …", or empty for none. */
  effective: z.string().trim().max(LEGAL_PAGE_LIMITS.effective),
  markdown: z.string().trim().min(1).max(LEGAL_PAGE_LIMITS.markdown),
});
export type LegalPageContent = z.infer<typeof legalPageContentSchema>;

export const legalPageSchema = legalPageContentSchema.extend({
  slug: legalPageSlugSchema,
  updatedAt: z.string(),
});
export type LegalPage = z.infer<typeof legalPageSchema>;
z.globalRegistry.add(legalPageSchema, { id: "LegalPage" });

export const legalPageParamsSchema = z.strictObject({
  slug: legalPageSlugSchema,
});

export const saveLegalPageRequestSchema = legalPageContentSchema;
export type SaveLegalPageRequest = LegalPageContent;

/** One page's saved text, or null while it uses its built-in text. */
export const publicLegalPageResponseSchema = z.strictObject({
  page: legalPageSchema.nullable(),
});
export type PublicLegalPageResponse = z.infer<
  typeof publicLegalPageResponseSchema
>;

/** Every page with saved text; a page not listed uses its built-in text. */
export const legalPagesResponseSchema = z.strictObject({
  pages: z.array(legalPageSchema),
});
export type LegalPagesResponse = z.infer<typeof legalPagesResponseSchema>;

/** After a save or a reset: the page as it now stands and the rebuild that publishes it. */
export const legalPageChangeResponseSchema = z.strictObject({
  page: legalPageSchema.nullable(),
  rebuild: staticSiteRebuildStatusSchema,
});
export type LegalPageChangeResponse = z.infer<
  typeof legalPageChangeResponseSchema
>;
