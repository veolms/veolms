import type { Generated } from "kysely";

/** One row: whether AI features are on, and how they reach the provider. */
export interface AiSettingsTable {
  id: Generated<boolean>;
  enabled: Generated<boolean>;
  provider: Generated<string>;
  model: Generated<string>;
  /** The provider key, encrypted with the server's secret key. */
  api_key_encrypted: string | null;
  api_key_last4: string | null;
  /** The provider workspace a key made outside one must name (Anthropic). */
  workspace_id: string | null;
  /** Numeric: read as a string. */
  monthly_budget_usd: string | null;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

export type AiUsageStatus = "ok" | "error" | "refused" | "cancelled";

/** One call to the AI provider. */
export interface AiUsageTable {
  id: Generated<string>;
  user_id: string | null;
  /** `coding.generate`, `coding.revise`, … */
  feature: string;
  provider: string;
  model: string;
  status: AiUsageStatus;
  error_code: string | null;
  /** What the call was for (an exercise id), when it has one. */
  subject_id: string | null;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  cache_read_tokens: Generated<number>;
  cache_write_tokens: Generated<number>;
  /** Numeric: read as a string. */
  cost_usd: Generated<string>;
  duration_ms: Generated<number>;
  created_at: Generated<Date>;
}
