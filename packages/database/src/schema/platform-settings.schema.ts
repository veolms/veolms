import type { Generated } from "kysely";

/**
 * The academy's Platform settings: a single row whose `settings` document
 * follows `platformSettingsSchema` from `@veolms/contracts`. No row means the
 * built-in defaults apply.
 */
export interface PlatformSettingsTable {
  id: Generated<boolean>;
  settings: unknown;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
