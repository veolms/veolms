import { cacheTags, createCache, invalidateCache } from "@veolms/api-core";
import { siteSettings } from "@veolms/config";
import {
  emptyLegalPlaceholders,
  fillLegalTemplate,
  LEGAL_PAGE_SLUGS,
  type AdminLegalPageListResponse,
  type AdminLegalPageResponse,
  type LegalPageContent,
  type LegalPageResponse,
  type LegalPageSlug,
  type LegalPageValues,
} from "@veolms/contracts";
import { LEGAL_PAGE_TEMPLATES } from "@veolms/contracts/legal-page-defaults/index";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { config } from "../../config.ts";
import { httpError } from "../../lib/errors.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { createPlatformSettingsService } from "../platform/index.ts";
import * as repository from "./legal-pages.repository.ts";

/** Clears every visitor copy of the legal pages. */
const LEGAL_PAGES_TAG = "legal-pages";
const PAGE_CACHE_MS = 10 * 60_000;

// One copy per process: public pages are read on every visit.
const cachedPages = createCache<LegalPageResponse>({
  name: "legal-pages.public",
  ttlMs: PAGE_CACHE_MS,
  maxBytes: 4 * 1024 * 1024,
});

function defaultContent(slug: LegalPageSlug): LegalPageContent {
  const template = LEGAL_PAGE_TEMPLATES[slug];
  return {
    title: template.title,
    description: template.description,
    heading: template.heading,
    effective: template.effective,
    markdown: template.markdown,
  };
}

function fillContent(
  content: LegalPageContent,
  values: LegalPageValues,
): LegalPageContent {
  return {
    title: fillLegalTemplate(content.title, values),
    description: fillLegalTemplate(content.description, values),
    heading: fillLegalTemplate(content.heading, values),
    effective:
      content.effective === null
        ? null
        : fillLegalTemplate(content.effective, values),
    // An address keeps its lines: Markdown joins lines without a hard break.
    markdown: fillLegalTemplate(content.markdown, {
      ...values,
      postalAddress: values.postalAddress.replace(/\r?\n/gu, "  \n"),
    }),
  };
}

/** Every text of a page, joined, to find the placeholders it uses. */
function allText(content: LegalPageContent): string {
  return [
    content.title,
    content.description,
    content.heading,
    content.effective ?? "",
    content.markdown,
  ].join("\n");
}

function notFound(): never {
  throw httpError(404, "LEGAL_PAGE_NOT_FOUND", "There is no such page.");
}

export function isLegalPageSlug(value: string): value is LegalPageSlug {
  return (LEGAL_PAGE_SLUGS as readonly string[]).includes(value);
}

export function createLegalPagesService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const brand = createAcademyBrandService({ database });
  const platform = createPlatformSettingsService({ database });

  /**
   * What the placeholders read as now. A legal detail left empty falls back
   * to the invoice details, then (for the company) the academy's name.
   */
  async function readValues(): Promise<LegalPageValues> {
    const [academy, settings] = await Promise.all([
      brand.getBrand(),
      platform.getSettings(),
    ]);
    const { legal, invoice } = settings.settings;
    const companyName =
      legal.companyName || invoice.companyName || academy.name;
    return {
      academyName: academy.name,
      companyName,
      contactEmail: legal.contactEmail || invoice.email,
      postalAddress: legal.postalAddress || invoice.address,
      grievanceOfficer: legal.grievanceOfficer,
      siteUrl: siteSettings(config).webUrl.replace(/\/+$/u, ""),
    };
  }

  async function findSaved(
    slug: LegalPageSlug,
  ): Promise<repository.SavedLegalPage | null> {
    try {
      return await repository.findLegalPage(database, slug);
    } catch (error) {
      // Before the migration has run, every page is its default.
      if (repository.isMissingLegalPagesTable(error)) return null;
      throw error;
    }
  }

  async function loadPublicPage(
    slug: LegalPageSlug,
  ): Promise<LegalPageResponse> {
    const [saved, values] = await Promise.all([findSaved(slug), readValues()]);
    return {
      slug,
      ...fillContent(saved?.content ?? defaultContent(slug), values),
      customized: saved !== null,
      updatedAt: saved?.updatedAt.toISOString() ?? null,
      details: {
        academyName: values.academyName,
        companyName: values.companyName,
        contactEmail: values.contactEmail,
      },
    };
  }

  /** A page as visitors read it. */
  async function getPublicPage(slug: string): Promise<LegalPageResponse> {
    if (!isLegalPageSlug(slug)) notFound();
    // The details come from the brand (`academy`) and the platform settings
    // (`site`), so a change to either reaches the pages.
    return await cachedPages.fetch(slug, () => loadPublicPage(slug), {
      tags: [LEGAL_PAGES_TAG, cacheTags.site, cacheTags.academy],
    });
  }

  async function toAdminPage(
    slug: LegalPageSlug,
    saved: repository.SavedLegalPage | null,
  ): Promise<AdminLegalPageResponse> {
    return {
      slug,
      content: saved?.content ?? defaultContent(slug),
      defaultContent: defaultContent(slug),
      customized: saved !== null,
      updatedAt: saved?.updatedAt.toISOString() ?? null,
      values: await readValues(),
    };
  }

  /** Every page, with what it is missing, for the Platform page's list. */
  async function listAdminPages(): Promise<AdminLegalPageListResponse> {
    let saved: repository.SavedLegalPage[] = [];
    try {
      saved = await repository.listLegalPages(database);
    } catch (error) {
      if (!repository.isMissingLegalPagesTable(error)) throw error;
    }
    const bySlug = new Map(saved.map((page) => [page.slug, page]));
    const values = await readValues();
    return {
      pages: LEGAL_PAGE_SLUGS.map((slug) => {
        const page = bySlug.get(slug);
        const content = page?.content ?? defaultContent(slug);
        return {
          slug,
          // The page's heading names it best in a list ("Privacy Policy").
          title: fillLegalTemplate(content.heading, values),
          customized: page !== undefined,
          updatedAt: page?.updatedAt.toISOString() ?? null,
          missing: emptyLegalPlaceholders(allText(content), values),
        };
      }),
      values,
    };
  }

  async function getAdminPage(slug: string): Promise<AdminLegalPageResponse> {
    if (!isLegalPageSlug(slug)) notFound();
    return await toAdminPage(slug, await findSaved(slug));
  }

  async function savePage(
    slug: string,
    content: LegalPageContent,
    updatedBy: string | null,
  ): Promise<AdminLegalPageResponse> {
    if (!isLegalPageSlug(slug)) notFound();
    let saved: repository.SavedLegalPage;
    try {
      saved = await repository.saveLegalPage(database, {
        slug,
        content,
        updatedBy,
      });
    } catch (error) {
      if (!repository.isMissingLegalPagesTable(error)) throw error;
      throw httpError(
        503,
        "LEGAL_PAGES_UNAVAILABLE",
        "Legal pages cannot be saved until the database is updated.",
      );
    }
    invalidateCache([LEGAL_PAGES_TAG]);
    return await toAdminPage(slug, saved);
  }

  /** Back to the default template. */
  async function resetPage(slug: string): Promise<AdminLegalPageResponse> {
    if (!isLegalPageSlug(slug)) notFound();
    try {
      await repository.deleteLegalPage(database, slug);
    } catch (error) {
      if (!repository.isMissingLegalPagesTable(error)) throw error;
    }
    invalidateCache([LEGAL_PAGES_TAG]);
    return await toAdminPage(slug, null);
  }

  return {
    readValues,
    getPublicPage,
    listAdminPages,
    getAdminPage,
    savePage,
    resetPage,
  };
}

export type LegalPagesService = ReturnType<typeof createLegalPagesService>;
