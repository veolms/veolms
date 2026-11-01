import type { Generated } from "kysely";

/**
 * A quote the learner's home page can show. `is_active` false keeps the row
 * but takes it out of the daily rotation.
 */
export interface QuoteTable {
  id: Generated<number>;
  text: string;
  author: string;
  source: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}
