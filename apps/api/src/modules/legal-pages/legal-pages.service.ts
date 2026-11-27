import type { Database } from "@veolms/database";
import {
  legalPageSlugSchema,
  type LegalPage,
  type LegalPageChangeResponse,
  type LegalPageContent,
  type LegalPageSlug,
  type StaticSiteRebuildStatus,
} from "@veolms/contracts";
import type { Kysely } from "kysely";
import * as repository from "./legal-pages.repository.ts";

const REBUILD_NOT_CONFIGURED: StaticSiteRebuildStatus = {
  status: "failed",
  message:
    "Public page rebuilds are not configured on this server: the change shows after the next deployment.",
  updatedAt: new Date(0).toISOString(),
  runUrl: null,
};

function toLegalPage(
  slug: LegalPageSlug,
  row: repository.LegalPageRow,
): LegalPage {
  return {
    slug,
    title: row.title,
    description: row.description,
    heading: row.heading,
    effective: row.effective,
    markdown: row.markdown,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The legal and company pages as an administrator rewrote them. The public
 * pages are prerendered, so a change reaches visitors and search engines
 * when they are built again: every save and reset asks for that page alone
 * to be built again (`/terms`), not the whole site. No other page shows its
 * text.
 */
export function createLegalPagesService({
  database,
  staticPages,
}: {
  database: Kysely<Database>;
  staticPages?: {
    requestPagesRefresh(paths: readonly string[]): StaticSiteRebuildStatus;
  };
}) {
  function rebuild(slug: LegalPageSlug): StaticSiteRebuildStatus {
    return (
      staticPages?.requestPagesRefresh([`/${slug}`]) ?? REBUILD_NOT_CONFIGURED
    );
  }

  async function getPage(slug: LegalPageSlug): Promise<LegalPage | null> {
    const row = await repository.findLegalPage(database, slug);
    return row ? toLegalPage(slug, row) : null;
  }

  async function listPages(): Promise<LegalPage[]> {
    const rows = await repository.listLegalPages(database);
    // A row for a page the web app no longer has is left out.
    return rows.flatMap((row) => {
      const slug = legalPageSlugSchema.safeParse(row.slug);
      return slug.success ? [toLegalPage(slug.data, row)] : [];
    });
  }

  async function savePage(
    slug: LegalPageSlug,
    content: LegalPageContent,
    updatedBy: string | null,
  ): Promise<LegalPageChangeResponse> {
    const row = await repository.saveLegalPage(database, {
      slug,
      ...content,
      updatedBy,
    });
    return { page: toLegalPage(slug, row), rebuild: rebuild(slug) };
  }

  async function resetPage(
    slug: LegalPageSlug,
  ): Promise<LegalPageChangeResponse> {
    const removed = await repository.deleteLegalPage(database, slug);
    if (removed) return { page: null, rebuild: rebuild(slug) };
    // Nothing was saved, so the built pages already show the built-in text.
    return {
      page: null,
      rebuild: {
        status: "idle",
        message: null,
        updatedAt: new Date().toISOString(),
        runUrl: null,
      },
    };
  }

  return { getPage, listPages, savePage, resetPage };
}

export type LegalPagesService = ReturnType<typeof createLegalPagesService>;
