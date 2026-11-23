import { z } from "zod";

/**
 * AI features. One shared setting (Platform → AI) says whether AI is on and
 * how the server reaches the provider; every call is written to a usage
 * ledger. Features (coding question writing first; quizzes, a learner tutor
 * and course building later) use the same settings and ledger.
 *
 * The provider key never leaves the server: the page only sees whether one
 * is set and its last four characters.
 */

export const aiProviderSchema = z.enum(["anthropic"]);

/** The models an admin may pick, with the price used for cost estimates. */
export const AI_MODELS = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    note: "Best questions and tests. About $0.20 a question.",
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cacheReadUsdPerMillion: 0.2,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    note: "Fast and good. About $0.10 a question.",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.1,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    note: "Cheapest. Simpler questions; check the tests well.",
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cacheReadUsdPerMillion: 0.01,
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];
export const DEFAULT_AI_MODEL: AiModelId = "claude-opus-5-5";
export const aiModelIdSchema = z.enum(
  AI_MODELS.map((model) => model.id) as [AiModelId, ...AiModelId[]],
);

/** What a call was for. New features add their names here. */
export const aiFeatureSchema = z.enum(["coding.generate", "coding.revise"]);

export const aiSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  provider: aiProviderSchema,
  model: aiModelIdSchema,
  /** A key is stored in the settings (not only in the server's env). */
  hasApiKey: z.boolean(),
  apiKeyLast4: z.string().nullable(),
  /** The server has `ANTHROPIC_API_KEY` set, used when no key is stored. */
  hasEnvironmentKey: z.boolean(),
  /**
   * The provider workspace requests name (Anthropic `wrkspc_…`). Needed
   * only for a key made outside a workspace. Null: none stored (the
   * server's `ANTHROPIC_WORKSPACE_ID`, if set, is used).
   */
  workspaceId: z.string().nullable(),
  hasEnvironmentWorkspace: z.boolean(),
  monthlyBudgetUsd: z.number().nonnegative().nullable(),
  updatedAt: z.string().nullable(),
});

export const aiUsageSummarySchema = z.strictObject({
  /** Start of the current month (UTC). */
  since: z.string(),
  calls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  byFeature: z.array(
    z.strictObject({
      feature: z.string(),
      calls: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
    }),
  ),
  byPerson: z.array(
    z.strictObject({
      userId: z.uuid().nullable(),
      name: z.string(),
      calls: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
    }),
  ),
});

export const aiSettingsResponseSchema = z.strictObject({
  settings: aiSettingsSchema,
  usage: aiUsageSummarySchema,
});

export const updateAiSettingsRequestSchema = z.strictObject({
  enabled: z.boolean().optional(),
  provider: aiProviderSchema.optional(),
  model: aiModelIdSchema.optional(),
  /** A new key; `null` removes the stored one. Leave out to keep it. */
  apiKey: z.string().trim().min(20).max(400).nullable().optional(),
  /** `null` or an empty string removes it. */
  workspaceId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_-]*$/, "Letters, digits, - and _ only.")
    .nullable()
    .optional(),
  monthlyBudgetUsd: z.number().min(0).max(100_000).nullable().optional(),
});

export const testAiConnectionResponseSchema = z.strictObject({
  ok: z.boolean(),
  model: z.string(),
  message: z.string(),
  ms: z.number().int().nonnegative(),
});

/** Whether a staff member may use AI features now (shown before a button). */
export const aiAvailabilitySchema = z.strictObject({
  available: z.boolean(),
  /** Why not, in plain words, when unavailable. */
  reason: z.string().nullable(),
  model: z.string().nullable(),
});

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiFeature = z.infer<typeof aiFeatureSchema>;
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;
export type AiSettingsResponse = z.infer<typeof aiSettingsResponseSchema>;
export type UpdateAiSettingsRequest = z.infer<
  typeof updateAiSettingsRequestSchema
>;
export type TestAiConnectionResponse = z.infer<
  typeof testAiConnectionResponseSchema
>;
export type AiAvailability = z.infer<typeof aiAvailabilitySchema>;
