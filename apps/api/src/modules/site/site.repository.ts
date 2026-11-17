import type { Database, SitePageType } from "@veolms/database";
import { sql, type Kysely } from "kysely";

/**
 * The website builder's tables: `sites` (the look), `site_pages` (address,
 * draft, live HTML) and `site_page_versions` (content frozen at publish).
 */

/** PostgreSQL "unique_violation". */
const UNIQUE_VIOLATION = "23505";

export function isDuplicateSlug(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNIQUE_VIOLATION &&
    "constraint" in error &&
    error.constraint === "site_pages_slug_key"
  );
}

export interface SitePageRow {
  id: string;
  slug: string;
  title: string;
  type: SitePageType;
  draft: Record<string, unknown>;
  draftUpdatedAt: Date;
  draftIsLive: boolean;
  liveVersionId: string | null;
  livePublishedAt: Date | null;
  updatedAt: Date;
}

export interface SitePageVersionRow {
  id: string;
  number: number;
  document: Record<string, unknown>;
  publishedAt: Date;
}

const PAGE_COLUMNS = [
  "site_pages.id",
  "site_pages.slug",
  "site_pages.title",
  "site_pages.type",
  "site_pages.draft",
  "site_pages.draft_updated_at",
  "site_pages.draft_is_live",
  "site_pages.live_version_id",
  "site_pages.updated_at",
] as const;

type PageSelect = {
  id: string;
  slug: string;
  title: string;
  type: SitePageType;
  draft: Record<string, unknown>;
  draft_updated_at: Date;
  draft_is_live: boolean;
  live_version_id: string | null;
  updated_at: Date;
  live_published_at: Date | null;
};

function toPage(row: PageSelect): SitePageRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    draft: row.draft,
    draftUpdatedAt: row.draft_updated_at,
    draftIsLive: row.draft_is_live,
    liveVersionId: row.live_version_id,
    livePublishedAt: row.live_published_at,
    updatedAt: row.updated_at,
  };
}

function selectPages(database: Kysely<Database>) {
  return database
    .selectFrom("site_pages")
    .leftJoin(
      "site_page_versions as live",
      "live.id",
      "site_pages.live_version_id",
    )
    .select([...PAGE_COLUMNS, "live.published_at as live_published_at"]);
}

// --- The look -------------------------------------------------------------

export async function findLook(
  database: Kysely<Database>,
): Promise<Record<string, unknown> | null> {
  const row = await database
    .selectFrom("sites")
    .select("look")
    .executeTakeFirst();
  return row?.look ?? null;
}

export async function saveLook(
  database: Kysely<Database>,
  input: { look: unknown; updatedBy: string | null },
): Promise<void> {
  const look = JSON.stringify(input.look);
  await database
    .insertInto("sites")
    .values({ id: true, look, updated_by: input.updatedBy })
    // By primary key name, not column: see platform-settings.repository.ts.
    .onConflict((conflict) =>
      conflict.constraint("sites_pkey").doUpdateSet({
        look,
        updated_by: input.updatedBy,
        updated_at: sql`current_timestamp`,
      }),
    )
    .execute();
}

// --- Pages ----------------------------------------------------------------

export async function listPages(
  database: Kysely<Database>,
): Promise<SitePageRow[]> {
  const rows = await selectPages(database)
    .orderBy("site_pages.created_at", "asc")
    .execute();
  return rows.map(toPage);
}

export async function findPage(
  database: Kysely<Database>,
  pageId: string,
): Promise<SitePageRow | null> {
  const row = await selectPages(database)
    .where("site_pages.id", "=", pageId)
    .executeTakeFirst();
  return row ? toPage(row) : null;
}

/** Every page's slug by id, for links between pages. */
export async function listPageSlugs(
  database: Kysely<Database>,
): Promise<Map<string, string>> {
  const rows = await database
    .selectFrom("site_pages")
    .select(["id", "slug"])
    .execute();
  return new Map(rows.map((row) => [row.id, row.slug]));
}

export async function insertPage(
  database: Kysely<Database>,
  input: {
    slug: string;
    title: string;
    type: SitePageType;
    draft: unknown;
    createdBy: string | null;
  },
): Promise<string> {
  const row = await database
    .insertInto("site_pages")
    .values({
      slug: input.slug,
      title: input.title,
      type: input.type,
      draft: JSON.stringify(input.draft),
      created_by: input.createdBy,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function updatePageMeta(
  database: Kysely<Database>,
  pageId: string,
  input: { slug?: string; title?: string },
): Promise<boolean> {
  const result = await database
    .updateTable("site_pages")
    .set({
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.title === undefined ? {} : { title: input.title }),
      updated_at: sql`current_timestamp`,
    })
    .where("id", "=", pageId)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/**
 * Saves the draft unless it changed since `baseUpdatedAt` (another tab
 * saved). Returns the new save time, or null when refused.
 */
export async function saveDraft(
  database: Kysely<Database>,
  pageId: string,
  input: { draft: unknown; baseUpdatedAt: Date | null },
): Promise<Date | null> {
  let query = database
    .updateTable("site_pages")
    .set({
      draft: JSON.stringify(input.draft),
      draft_updated_at: sql`clock_timestamp()`,
      draft_is_live: false,
      updated_at: sql`current_timestamp`,
    })
    .where("id", "=", pageId);
  if (input.baseUpdatedAt) {
    // Microseconds are lost on the way through JSON; compare at ms.
    query = query.where(
      sql<boolean>`date_trunc('milliseconds', draft_updated_at) = ${input.baseUpdatedAt}`,
    );
  }
  const row = await query.returning("draft_updated_at").executeTakeFirst();
  return row?.draft_updated_at ?? null;
}

export async function deletePage(
  database: Kysely<Database>,
  pageId: string,
): Promise<boolean> {
  const result = await database
    .deleteFrom("site_pages")
    .where("id", "=", pageId)
    .executeTakeFirst();
  return result.numDeletedRows > 0n;
}

// --- Versions and the live page -------------------------------------------

export async function listVersions(
  database: Kysely<Database>,
  pageId: string,
): Promise<SitePageVersionRow[]> {
  const rows = await database
    .selectFrom("site_page_versions")
    .select(["id", "number", "document", "published_at"])
    .where("page_id", "=", pageId)
    .orderBy("number", "desc")
    .limit(50)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    document: row.document,
    publishedAt: row.published_at,
  }));
}

export async function findVersion(
  database: Kysely<Database>,
  pageId: string,
  versionId: string,
): Promise<SitePageVersionRow | null> {
  const row = await database
    .selectFrom("site_page_versions")
    .select(["id", "number", "document", "published_at"])
    .where("page_id", "=", pageId)
    .where("id", "=", versionId)
    .executeTakeFirst();
  return row
    ? {
        id: row.id,
        number: row.number,
        document: row.document,
        publishedAt: row.published_at,
      }
    : null;
}

/** Locks the page row for a publish, so two publishes number in turn. */
export async function lockPage(
  database: Kysely<Database>,
  pageId: string,
): Promise<{ draft: Record<string, unknown> } | null> {
  const row = await database
    .selectFrom("site_pages")
    .select("draft")
    .where("id", "=", pageId)
    .forUpdate()
    .executeTakeFirst();
  return row ?? null;
}

export async function insertVersion(
  database: Kysely<Database>,
  input: { pageId: string; document: unknown; publishedBy: string | null },
): Promise<{ id: string; number: number }> {
  return await database
    .insertInto("site_page_versions")
    .values({
      page_id: input.pageId,
      number: sql<number>`coalesce((select max(number) from site_page_versions where page_id = ${input.pageId}), 0) + 1`,
      document: JSON.stringify(input.document),
      published_by: input.publishedBy,
    })
    .returning(["id", "number"])
    .executeTakeFirstOrThrow();
}

export async function setLive(
  database: Kysely<Database>,
  pageId: string,
  input: {
    versionId: string | null;
    html: string | null;
    courseIds: string[];
    draftIsLive: boolean;
  },
): Promise<void> {
  await database
    .updateTable("site_pages")
    .set({
      live_version_id: input.versionId,
      live_html: input.html,
      live_course_ids: input.courseIds,
      draft_is_live: input.draftIsLive,
      updated_at: sql`current_timestamp`,
    })
    .where("id", "=", pageId)
    .execute();
}

/** Writes freshly rendered HTML for a live page (a new look, say). */
export async function updateLiveHtml(
  database: Kysely<Database>,
  pageId: string,
  input: { html: string; courseIds: string[] },
): Promise<void> {
  await database
    .updateTable("site_pages")
    .set({ live_html: input.html, live_course_ids: input.courseIds })
    .where("id", "=", pageId)
    .where("live_version_id", "is not", null)
    .execute();
}

/** Every live page with its live content, to render them again. */
export async function listLivePages(
  database: Kysely<Database>,
): Promise<
  Array<{ pageId: string; slug: string; document: Record<string, unknown> }>
> {
  const rows = await database
    .selectFrom("site_pages")
    .innerJoin(
      "site_page_versions",
      "site_page_versions.id",
      "site_pages.live_version_id",
    )
    .select([
      "site_pages.id as page_id",
      "site_pages.slug",
      "site_page_versions.document",
    ])
    .execute();
  return rows.map((row) => ({
    pageId: row.page_id,
    slug: row.slug,
    document: row.document,
  }));
}

export async function findLiveHtmlBySlug(
  database: Kysely<Database>,
  slug: string,
): Promise<string | null> {
  const row = await database
    .selectFrom("site_pages")
    .select("live_html")
    .where("slug", "=", slug)
    .where("live_version_id", "is not", null)
    .executeTakeFirst();
  return row?.live_html ?? null;
}
