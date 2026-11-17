import type { ColumnType, Generated, JSONColumnType } from "kysely";

/**
 * The website builder's tables (see the create-site-pages migration). Page
 * content is checked by `@veolms/contracts` on the way in.
 */
export interface SiteTable {
  id: Generated<boolean>;
  look: JSONColumnType<Record<string, unknown>, string, string>;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type SitePageType = "home" | "landing" | "link_in_bio" | "blank";

export interface SitePageTable {
  id: Generated<string>;
  slug: string;
  title: string;
  type: SitePageType;
  draft: JSONColumnType<Record<string, unknown>, string, string>;
  draft_updated_at: Generated<Date>;
  draft_is_live: Generated<boolean>;
  live_version_id: string | null;
  live_html: string | null;
  live_course_ids: ColumnType<string[], string[] | undefined, string[]>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SitePageVersionTable {
  id: Generated<string>;
  page_id: string;
  number: number;
  document: JSONColumnType<Record<string, unknown>, string, string>;
  published_by: string | null;
  published_at: Generated<Date>;
}
