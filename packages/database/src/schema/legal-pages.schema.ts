import type { Generated } from "kysely";

/**
 * A legal or company page as an administrator rewrote it (Platform → Legal
 * pages). A page with no row shows the web app's built-in text.
 */
export interface LegalPageTable {
  slug: string;
  title: string;
  description: string;
  heading: string;
  effective: Generated<string>;
  markdown: string;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
