import type { Generated } from "kysely";

/**
 * A legal or company page an administrator has rewritten. No row means the
 * page shows its default template (see `@veolms/contracts` legal pages).
 */
export interface LegalPageTable {
  slug: string;
  title: string;
  description: Generated<string>;
  heading: string;
  effective: string | null;
  markdown: string;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
