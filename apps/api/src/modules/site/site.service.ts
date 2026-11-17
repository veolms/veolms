import { createCache, invalidateCache } from "@veolms/api-core";
import {
  DEFAULT_SITE_LOOK,
  siteLookSchema,
  sitePageDocumentSchema,
  type CreateSitePageRequest,
  type SaveSitePageDraftRequest,
  type SiteCourseCardsResponse,
  type SiteLook,
  type SiteOverviewResponse,
  type SitePageDocument,
  type SitePageResponse,
  type SitePageSummary,
  type UpdateSitePageRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { pageTemplate, renderSitePage } from "@veolms/site-render";
import type { Kysely } from "kysely";
import { httpError } from "../../lib/errors.ts";
import type { AppServices } from "../../services/index.ts";
import {
  createSiteRenderContextBuilder,
  type SiteRenderContextBuilder,
} from "./site-render-context.ts";
import * as repository from "./site.repository.ts";

/** How many published courses the editor offers to pick from. */
const EDITOR_COURSES = 60;

/** Clears every visitor copy of the live pages. */
const SITE_PAGES_TAG = "site-pages";

const cachedHtml = createCache<string | null>({
  name: "site.live-html",
  ttlMs: 5 * 60_000,
  maxBytes: 16 * 1024 * 1024,
});

function notFound(): never {
  throw httpError(404, "SITE_PAGE_NOT_FOUND", "There is no such page.");
}

function slugTaken(): never {
  throw httpError(
    409,
    "SITE_PAGE_SLUG_TAKEN",
    "Another page already uses this address.",
  );
}

/** Where the API serves a live page, relative to its base (`/v1`). */
export function livePathFor(slug: string): string {
  return `/site/p/${slug}`;
}

export function pageStatus(
  row: Pick<repository.SitePageRow, "liveVersionId" | "draftIsLive">,
): SitePageSummary["status"] {
  if (!row.liveVersionId) return "draft";
  return row.draftIsLive ? "published" : "changed";
}

function toSummary(row: repository.SitePageRow): SitePageSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    status: pageStatus(row),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.livePublishedAt?.toISOString() ?? null,
    livePath: row.liveVersionId ? livePathFor(row.slug) : null,
  };
}

/** Course ids a document picks by hand, which the newest list may lack. */
export function pickedCourseIds(document: SitePageDocument): string[] {
  const ids = new Set<string>();
  for (const section of document.sections) {
    if (section.type === "courses" && section.settings.source === "picked") {
      section.settings.courseIds.forEach((id) => ids.add(id));
    }
    const buttons =
      section.type === "hero"
        ? [section.settings.primary, section.settings.secondary]
        : section.type === "cta"
          ? [section.settings.button]
          : section.type === "links"
            ? section.settings.items
            : section.type === "footer"
              ? section.settings.links
              : [];
    for (const item of buttons) {
      if (item.link.kind === "course") ids.add(item.link.courseId);
    }
  }
  return [...ids];
}

export function createSiteService({
  database,
  services,
  contextBuilder = createSiteRenderContextBuilder({ database, services }),
}: {
  database: Kysely<Database>;
  services: AppServices;
  contextBuilder?: SiteRenderContextBuilder;
}) {
  async function getLook(): Promise<SiteLook> {
    const saved = await repository.findLook(database);
    const parsed = siteLookSchema.safeParse(saved);
    return parsed.success ? parsed.data : DEFAULT_SITE_LOOK;
  }

  async function findPageOrThrow(pageId: string) {
    const row = await repository.findPage(database, pageId);
    if (!row) notFound();
    return row;
  }

  async function render(document: SitePageDocument, look: SiteLook) {
    const context = await contextBuilder.build(pickedCourseIds(document));
    return renderSitePage({ document, look, context });
  }

  async function getOverview(): Promise<SiteOverviewResponse> {
    const [look, pages] = await Promise.all([
      getLook(),
      repository.listPages(database),
    ]);
    return { look, pages: pages.map(toSummary) };
  }

  async function toPageResponse(
    row: repository.SitePageRow,
  ): Promise<SitePageResponse> {
    const versions = await repository.listVersions(database, row.id);
    return {
      page: toSummary(row),
      document: sitePageDocumentSchema.parse(row.draft),
      draftUpdatedAt: row.draftUpdatedAt.toISOString(),
      versions: versions.map((version) => ({
        id: version.id,
        number: version.number,
        publishedAt: version.publishedAt.toISOString(),
        isLive: version.id === row.liveVersionId,
      })),
    };
  }

  async function getPage(pageId: string): Promise<SitePageResponse> {
    return await toPageResponse(await findPageOrThrow(pageId));
  }

  async function createPage(
    input: CreateSitePageRequest,
    createdBy: string | null,
  ): Promise<SitePageResponse> {
    const look = await getLook();
    const draft = pageTemplate(input.type, input.title, look.themeId);
    let pageId: string;
    try {
      pageId = await repository.insertPage(database, {
        ...input,
        draft,
        createdBy,
      });
    } catch (error) {
      if (repository.isDuplicateSlug(error)) slugTaken();
      throw error;
    }
    return await getPage(pageId);
  }

  async function updatePage(
    pageId: string,
    input: UpdateSitePageRequest,
  ): Promise<SitePageResponse> {
    const before = await findPageOrThrow(pageId);
    try {
      await repository.updatePageMeta(database, pageId, input);
    } catch (error) {
      if (repository.isDuplicateSlug(error)) slugTaken();
      throw error;
    }
    // A new address moves the live page, and links to it on other pages.
    if (input.slug !== undefined && input.slug !== before.slug) {
      await rerenderLivePages();
    }
    return await getPage(pageId);
  }

  async function saveDraft(
    pageId: string,
    input: SaveSitePageDraftRequest,
  ): Promise<SitePageResponse> {
    await findPageOrThrow(pageId);
    const saved = await repository.saveDraft(database, pageId, {
      draft: input.document,
      baseUpdatedAt: input.baseUpdatedAt ? new Date(input.baseUpdatedAt) : null,
    });
    if (!saved) {
      throw httpError(
        409,
        "SITE_DRAFT_CONFLICT",
        "This page was changed in another tab. Reload to see the latest version.",
      );
    }
    return await getPage(pageId);
  }

  /** Freezes the draft as a new version and makes it the live page. */
  async function publishPage(
    pageId: string,
    publishedBy: string | null,
  ): Promise<SitePageResponse> {
    const look = await getLook();
    const row = await findPageOrThrow(pageId);
    const document = sitePageDocumentSchema.parse(row.draft);
    const rendered = await render(document, look);
    await database.transaction().execute(async (transaction) => {
      const locked = await repository.lockPage(transaction, pageId);
      if (!locked) notFound();
      // The draft may have been saved again since it was rendered.
      if (JSON.stringify(locked.draft) !== JSON.stringify(row.draft)) {
        throw httpError(
          409,
          "SITE_DRAFT_CONFLICT",
          "The page changed while publishing. Publish again.",
        );
      }
      const version = await repository.insertVersion(transaction, {
        pageId,
        document,
        publishedBy,
      });
      await repository.setLive(transaction, pageId, {
        versionId: version.id,
        html: rendered.html,
        courseIds: rendered.courseIds,
        draftIsLive: true,
      });
    });
    invalidateCache([SITE_PAGES_TAG]);
    return await getPage(pageId);
  }

  /** Puts an earlier version live again. The draft is left as it is. */
  async function restoreVersion(
    pageId: string,
    versionId: string,
  ): Promise<SitePageResponse> {
    const look = await getLook();
    const row = await findPageOrThrow(pageId);
    const version = await repository.findVersion(database, pageId, versionId);
    if (!version) {
      throw httpError(
        404,
        "SITE_VERSION_NOT_FOUND",
        "There is no such version.",
      );
    }
    const document = sitePageDocumentSchema.parse(version.document);
    const rendered = await render(document, look);
    await repository.setLive(database, pageId, {
      versionId: version.id,
      html: rendered.html,
      courseIds: rendered.courseIds,
      draftIsLive: JSON.stringify(document) === JSON.stringify(row.draft),
    });
    invalidateCache([SITE_PAGES_TAG]);
    return await getPage(pageId);
  }

  /** Takes the page off the site. Its versions are kept. */
  async function unpublishPage(pageId: string): Promise<SitePageResponse> {
    await findPageOrThrow(pageId);
    await repository.setLive(database, pageId, {
      versionId: null,
      html: null,
      courseIds: [],
      draftIsLive: false,
    });
    invalidateCache([SITE_PAGES_TAG]);
    return await getPage(pageId);
  }

  async function deletePage(pageId: string): Promise<void> {
    if (!(await repository.deletePage(database, pageId))) notFound();
    invalidateCache([SITE_PAGES_TAG]);
    // Links to it on other live pages now go nowhere.
    await rerenderLivePages();
  }

  /** Renders every live page again, from its live version. */
  async function rerenderLivePages(): Promise<void> {
    const look = await getLook();
    const live = await repository.listLivePages(database);
    for (const page of live) {
      const document = sitePageDocumentSchema.safeParse(page.document);
      if (!document.success) continue;
      const rendered = await render(document.data, look);
      await repository.updateLiveHtml(database, page.pageId, rendered);
    }
    invalidateCache([SITE_PAGES_TAG]);
  }

  /** A new theme or colour mode, applied to every live page at once. */
  async function saveLook(
    look: SiteLook,
    updatedBy: string | null,
  ): Promise<SiteOverviewResponse> {
    await repository.saveLook(database, { look, updatedBy });
    await rerenderLivePages();
    return await getOverview();
  }

  /** A live page's HTML as published, or null. */
  async function getLiveHtml(slug: string): Promise<string | null> {
    return await cachedHtml.fetch(
      slug,
      () => repository.findLiveHtmlBySlug(database, slug),
      { tags: [SITE_PAGES_TAG] },
    );
  }

  async function listCourseCards(): Promise<SiteCourseCardsResponse> {
    return { courses: await contextBuilder.listCourseCards(EDITOR_COURSES) };
  }

  return {
    getLook,
    getOverview,
    saveLook,
    getPage,
    createPage,
    updatePage,
    saveDraft,
    publishPage,
    restoreVersion,
    unpublishPage,
    deletePage,
    rerenderLivePages,
    getLiveHtml,
    listCourseCards,
  };
}

export type SiteService = ReturnType<typeof createSiteService>;
