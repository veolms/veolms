import type { Generated } from "kysely";

/**
 * The academy's signed-out home page settings: a single row whose `settings`
 * document follows `homePageSettingsSchema` from `@veolms/contracts`. No row
 * means the built-in defaults apply.
 */
export interface HomePageSettingsTable {
  id: Generated<boolean>;
  settings: unknown;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
