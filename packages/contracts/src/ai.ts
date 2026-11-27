import { z } from "zod";

/**
 * AI features. Platform → AI says whether AI is on, which providers the
 * server may reach (each with its own key), which model does what, how hard
 * it thinks (effort), and a monthly budget. Every call is written to one
 * usage ledger, whatever the provider.
 *
 * Provider keys never leave the server: the page only sees whether one is
 * set and its last four characters.
 *
 * Adding a provider: its id here and in AI_PROVIDERS, a few models in
 * AI_MODELS, and one adapter file in the API (modules/ai/providers). Adding a
 * model of a known provider needs no code: an admin adds it in Platform → AI
 * with its price.
 */

export const aiProviderSchema = z.enum([
  "anthropic",
  "openai",
  "gemini",
  "xai",
]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** The providers an admin can connect, and where their keys come from. */
export const AI_PROVIDERS = [
  {
    id: "anthropic",
    label: "Claude",
    company: "Anthropic",
    keyPlaceholder: "sk-ant-…",
    keyHelp: "console.anthropic.com → API keys",
    /** Anthropic keys made outside a workspace must name one. */
    hasWorkspace: true,
  },
  {
    id: "openai",
    label: "ChatGPT",
    company: "OpenAI",
    keyPlaceholder: "sk-…",
    keyHelp: "platform.openai.com → API keys",
    hasWorkspace: false,
  },
  {
    id: "gemini",
    label: "Gemini",
    company: "Google",
    keyPlaceholder: "AIza…",
    keyHelp: "aistudio.google.com → Get API key",
    hasWorkspace: false,
  },
  {
    id: "xai",
    label: "Grok",
    company: "xAI",
    keyPlaceholder: "xai-…",
    keyHelp: "console.x.ai → API keys",
    hasWorkspace: false,
  },
] as const satisfies readonly {
  id: AiProvider;
  label: string;
  company: string;
  keyPlaceholder: string;
  keyHelp: string;
  hasWorkspace: boolean;
}[];

/**
 * How hard the model thinks before it answers. Higher is slower, costs
 * more (thinking is billed as output) and is more careful. Models without
 * a thinking setting ignore it.
 */
export const aiEffortSchema = z.enum(["low", "medium", "high"]);
export type AiEffort = z.infer<typeof aiEffortSchema>;
export const AI_EFFORTS = [
  {
    id: "low",
    label: "Low",
    note: "Fastest and cheapest. Fine for simple quizzes.",
  },
  {
    id: "medium",
    label: "Medium",
    note: "Good balance. The default for course-wide runs.",
  },
  { id: "high", label: "High", note: "Most careful, slowest; costs the most." },
] as const satisfies readonly { id: AiEffort; label: string; note: string }[];
/** Platform-wide: "auto" lets each feature pick (high for one question, medium for a whole course). */
export const aiEffortSettingSchema = z.enum(["auto", "low", "medium", "high"]);
export type AiEffortSetting = z.infer<typeof aiEffortSettingSchema>;

/** Three model slots features choose between (cheap, middle, best). */
export const aiTierSchema = z.enum(["economy", "balanced", "best"]);
export type AiTier = z.infer<typeof aiTierSchema>;

/** A model id as the provider names it ("claude-sonnet-5-5", "gpt-…"). */
export const aiModelIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
    "Letters, digits and . _ : / - only.",
  );
export type AiModelId = z.infer<typeof aiModelIdSchema>;

export interface AiModelInfo {
  id: string;
  provider: AiProvider;
  label: string;
  note: string;
  /** List price, US dollars per million tokens. */
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
  /** The model takes an effort / thinking setting. */
  effort: boolean;
}

/**
 * Models offered without setup, with the list price used for estimates.
 * Prices change: an admin can add a model (or the same id again with a
 * newer price) in Platform → AI, and that entry wins.
 */
export const AI_MODELS = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    note: "Best questions and tests. The most expensive.",
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cacheReadUsdPerMillion: 0.2,
    effort: true,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    note: "Fast and good; about half the price of Opus.",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.1,
    effort: true,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    note: "Cheapest Claude. Simpler questions; check the tests well.",
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cacheReadUsdPerMillion: 0.01,
    effort: true,
  },
  {
    id: "gpt-6.2-astra",
    provider: "openai",
    label: "GPT-6.2 Astra",
    note: "OpenAI's best. About twice the price of Claude Opus.",
    inputUsdPerMillion: 8,
    outputUsdPerMillion: 40,
    cacheReadUsdPerMillion: 0.4,
    effort: true,
  },
  {
    id: "gpt-6.2-sol",
    provider: "openai",
    label: "GPT-6.2 Sol",
    note: "OpenAI's everyday model; priced like Claude Sonnet.",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.1,
    effort: true,
  },
  {
    id: "gpt-6.1-terra",
    provider: "openai",
    label: "GPT-6.1 Terra",
    note: "Fast and cheaper; simpler questions.",
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    cacheReadUsdPerMillion: 0.05,
    effort: true,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    note: "OpenAI's cheapest; priced like Claude Haiku.",
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cacheReadUsdPerMillion: 0.01,
    effort: true,
  },
  {
    id: "gemini-4-carbon",
    provider: "gemini",
    label: "Gemini 4 Carbon",
    // List price from 1 Dec 2026 (half before), so estimates are not low.
    note: "Google's best.",
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cacheReadUsdPerMillion: 0.2,
    effort: true,
  },
  {
    id: "gemini-4-hydrogen",
    provider: "gemini",
    label: "Gemini 4 Hydrogen",
    note: "Good and cheaper than Carbon.",
    inputUsdPerMillion: 1.5,
    outputUsdPerMillion: 7.5,
    cacheReadUsdPerMillion: 0.075,
    effort: true,
  },
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    label: "Gemini 3.8 Flash",
    // List price from 1 Jan 2027 (half before).
    note: "Fast and low cost.",
    inputUsdPerMillion: 1.5,
    outputUsdPerMillion: 7.5,
    cacheReadUsdPerMillion: 0.15,
    effort: true,
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    label: "Gemini 3.1 Flash-Lite",
    note: "Very cheap; plain questions.",
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 1.5,
    cacheReadUsdPerMillion: 0.025,
    effort: true,
  },
  {
    id: "grok-4.7",
    provider: "xai",
    label: "Grok 4.7",
    note: "xAI's best. Cheap output; slower, always thinks.",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 6,
    cacheReadUsdPerMillion: 0.5,
    effort: true,
  },
  {
    id: "grok-4.3",
    provider: "xai",
    label: "Grok 4.3",
    note: "Cheaper Grok.",
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 2.5,
    cacheReadUsdPerMillion: 0.2,
    effort: false,
  },
] as const satisfies readonly AiModelInfo[];

export const DEFAULT_AI_MODEL = "claude-opus-5-5";
/** The models each tier starts with, until an admin picks others. */
export const DEFAULT_AI_TIER_MODELS: Record<AiTier, string> = {
  economy: "claude-haiku-5-5",
  balanced: "claude-sonnet-5-5",
  best: "claude-opus-5-5",
};

/** A model an admin added (a newer model, or another price). */
export const aiCustomModelRequestSchema = z.strictObject({
  id: aiModelIdSchema,
  provider: aiProviderSchema,
  label: z.string().trim().min(1).max(60),
  inputUsdPerMillion: z.number().min(0).max(1_000),
  outputUsdPerMillion: z.number().min(0).max(1_000),
  cacheReadUsdPerMillion: z.number().min(0).max(1_000).default(0),
  effort: z.boolean().default(true),
});
export type AiCustomModelRequest = z.input<typeof aiCustomModelRequestSchema>;

export const aiModelSchema = z.strictObject({
  id: z.string(),
  provider: aiProviderSchema,
  label: z.string(),
  note: z.string(),
  inputUsdPerMillion: z.number(),
  outputUsdPerMillion: z.number(),
  cacheReadUsdPerMillion: z.number(),
  effort: z.boolean(),
  /** Added by an admin (can be removed). */
  custom: z.boolean(),
  /** Its provider has a key, so it can be used now. */
  available: z.boolean(),
});
export type AiModel = z.infer<typeof aiModelSchema>;

export const aiProviderStatusSchema = z.strictObject({
  id: aiProviderSchema,
  label: z.string(),
  company: z.string(),
  /** A key is stored in the settings. */
  hasApiKey: z.boolean(),
  apiKeyLast4: z.string().nullable(),
  /** The server's env has a key for it (used when none is stored). */
  hasEnvironmentKey: z.boolean(),
  /** Anthropic only: the workspace a key made outside one must name. */
  hasWorkspaceId: z.boolean(),
  workspaceIdHint: z.string().nullable(),
  hasEnvironmentWorkspace: z.boolean(),
  /** Has a key one way or the other. */
  connected: z.boolean(),
});
export type AiProviderStatus = z.infer<typeof aiProviderStatusSchema>;

/** Save, replace or remove one provider's key. */
export const saveAiProviderRequestSchema = z.strictObject({
  /** A new key; `null` removes the stored one. Leave out to keep it. */
  apiKey: z.string().trim().min(20).max(400).nullable().optional(),
  /** Anthropic only. `null` or an empty string removes it. */
  workspaceId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_-]*$/, "Letters, digits, - and _ only.")
    .nullable()
    .optional(),
});
export type SaveAiProviderRequest = z.infer<typeof saveAiProviderRequestSchema>;

/** What a call was for. New features add their names here. */
export const aiFeatureSchema = z.enum([
  "coding.generate",
  "coding.revise",
  "quiz.generate",
  "quiz.revise",
  "course.questions",
]);

export const aiSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  /** The default model's provider. */
  provider: aiProviderSchema,
  /** The model one-off AI help uses (a lecture's quiz or coding question). */
  model: z.string(),
  /** The models behind Economy / Balanced / Best (course-wide runs). */
  tierModels: z.strictObject({
    economy: z.string(),
    balanced: z.string(),
    best: z.string(),
  }),
  /** Thinking effort for every call, or "auto" (each feature decides). */
  effort: aiEffortSettingSchema,
  /**
   * Anthropic's key and workspace, as before providers were added. Kept so
   * older pages keep working; `providers` has every provider's status.
   */
  hasApiKey: z.boolean(),
  apiKeyLast4: z.string().nullable(),
  hasEnvironmentKey: z.boolean(),
  hasWorkspaceId: z.boolean(),
  workspaceIdHint: z.string().nullable(),
  hasEnvironmentWorkspace: z.boolean(),
  providers: z.array(aiProviderStatusSchema),
  /** Built-in and admin-added models, each marked usable or not. */
  models: z.array(aiModelSchema),
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
  byModel: z.array(
    z.strictObject({
      provider: z.string(),
      model: z.string(),
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
  /** Ignored: the provider follows the chosen model. Kept for old pages. */
  provider: aiProviderSchema.optional(),
  model: aiModelIdSchema.optional(),
  tierModels: z
    .strictObject({
      economy: aiModelIdSchema.optional(),
      balanced: aiModelIdSchema.optional(),
      best: aiModelIdSchema.optional(),
    })
    .optional(),
  effort: aiEffortSettingSchema.optional(),
  /** Anthropic's key (as before). `null` removes it; leave out to keep it. */
  apiKey: z.string().trim().min(20).max(400).nullable().optional(),
  /** Anthropic's workspace. `null` or an empty string removes it. */
  workspaceId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_-]*$/, "Letters, digits, - and _ only.")
    .nullable()
    .optional(),
  monthlyBudgetUsd: z.number().min(0).max(100_000).nullable().optional(),
});

/** Test one provider (its key with one of its models), or the default model. */
export const testAiConnectionRequestSchema = z.strictObject({
  provider: aiProviderSchema.optional(),
  model: aiModelIdSchema.optional(),
});

export const testAiConnectionResponseSchema = z.strictObject({
  ok: z.boolean(),
  model: z.string(),
  message: z.string(),
  ms: z.number().int().nonnegative(),
});

/** Whether a staff member may use AI features now (shown before a button). */
export const aiAvailabilitySchema = z.strictObject({
  /** The default (one-lecture) model can be used now. */
  available: z.boolean(),
  /** AI is switched on in Platform → AI (whichever models have keys). */
  enabled: z.boolean().default(false),
  /** Why not, in plain words, when unavailable. */
  reason: z.string().nullable(),
  model: z.string().nullable(),
  /** The label of each tier's model, for choices like Economy / Best. */
  tiers: z
    .array(
      z.strictObject({
        id: aiTierSchema,
        model: z.string(),
        label: z.string(),
        available: z.boolean(),
      }),
    )
    .default([]),
});

export type AiFeature = z.infer<typeof aiFeatureSchema>;
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;
export type AiSettingsResponse = z.infer<typeof aiSettingsResponseSchema>;
export type UpdateAiSettingsRequest = z.infer<
  typeof updateAiSettingsRequestSchema
>;
export type TestAiConnectionRequest = z.infer<
  typeof testAiConnectionRequestSchema
>;
export type TestAiConnectionResponse = z.infer<
  typeof testAiConnectionResponseSchema
>;
export type AiAvailability = z.infer<typeof aiAvailabilitySchema>;
