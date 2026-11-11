import type { ColumnType, Generated } from "kysely";

/**
 * A short address on the site's own domain (docs/short-links.md). `path` is
 * normalised: lowercase, leading slash, no trailing slash.
 */
export interface ShortLinkTable {
  id: Generated<string>;
  path: string;
  destination: string;
  mode: Generated<"redirect" | "rewrite">;
  redirect_status: Generated<301 | 302>;
  is_active: Generated<boolean>;
  visit_count: ColumnType<string, string | undefined, string>;
  last_visited_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
