import {
  AI_MODELS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_TIER_MODELS,
  aiEffortSettingSchema,
  aiTierSchema,
  type AiAvailability,
  type AiCustomModelRequest,
  type AiEffort,
  type AiEffortSetting,
  type AiFeature,
  type AiModel,
  type AiModelInfo,
  type AiProvider as AiProviderId,
  type AiSettingsResponse,
  type AiTier,
  type SaveAiProviderRequest,
  type TestAiConnectionRequest,
  type TestAiConnectionResponse,
  type UpdateAiSettingsRequest,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import { decryptSecret, encryptSecret } from "../../lib/secret-crypto.ts";
import type { AuthService } from "../auth/index.ts";
import * as repo from "./ai.repository.ts";
import { createAnthropicProvider } from "./providers/anthropic.provider.ts";
import { createGeminiProvider } from "./providers/gemini.provider.ts";
import {
  createOpenAiProvider,
  createXaiProvider,
} from "./providers/openai.provider.ts";
import {
  AiProviderError,
  type AiCredentials,
  type AiJsonRequest,
  type AiProvider,
  type AiUsageCounts,
} from "./providers/provider.ts";

/** Calls one person may start in the window (all AI features together). */
const CALLS_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60_000;
/** Settings are read on every call; other servers see a save this late. */
const SETTINGS_TTL_MS = 30_000;

export interface AiServiceOptions {
  database: Kysely<Database>;
  authService: Pick<AuthService, "listUserDisplayNamesByIds">;
  /** Tests pass a fake provider. */
  makeProvider?: (provider: string, credentials: AiCredentials) => AiProvider;
}

export interface AiRunRequest extends Omit<
  AiJsonRequest,
  "model" | "signal" | "onProgress" | "effort"
> {
  feature: AiFeature;
  userId: string;
  subjectId?: string | null;
  signal?: AbortSignal;
  onProgress?: (chars: number) => void;
  /**
   * The feature's own effort (high for one careful question, medium for a
   * whole course). Platform → AI may fix one effort for every call.
   */
  effort: AiEffort;
  /**
   * The person chose this effort for this run (a course-wide run's
   * Effort choice): it wins over the platform's setting.
   */
  effortChosen?: boolean;
  /**
   * A background job the person started once (questions for a whole
   * course): it paces itself, one call at a time, so the per-person burst
   * limit does not apply. The monthly budget still does.
   */
  background?: boolean;
  /** One of the catalogue's models for this call. */
  model?: string;
  /** Or one of the tiers (economy / balanced / best) set in Platform → AI. */
  tier?: AiTier;
}

type SettingsRow = Awaited<ReturnType<typeof repo.findSettings>>;
type KeyRow = Awaited<ReturnType<typeof repo.listProviderKeys>>[number];
type CustomRow = Awaited<ReturnType<typeof repo.listCustomModels>>[number];

/** Everything a call needs, read together and cached briefly. */
interface AiState {
  row: SettingsRow;
  keys: Map<string, KeyRow>;
  custom: CustomRow[];
}

type ProviderFactory = (
  provider: string,
  credentials: AiCredentials,
) => AiProvider;

/**
 * Kept on `globalThis`, not in this module: the app loads its route files
 * by file URL, so a test that imports this module by path can get another
 * copy of it.
 */
const TEST_PROVIDER = Symbol.for("veolms.ai.testProvider");
const testProvider = () =>
  (globalThis as { [TEST_PROVIDER]?: ProviderFactory | null })[TEST_PROVIDER] ??
  null;

/**
 * Flow tests answer AI calls with a fake provider (no network, no cost).
 * The app never calls this; null puts the real providers back.
 */
export function setAiProviderForTests(factory: ProviderFactory | null) {
  (globalThis as { [TEST_PROVIDER]?: ProviderFactory | null })[TEST_PROVIDER] =
    factory;
}

let cached: { state: AiState; at: number } | null = null;

/** "wrkspc_016hBr…R7dQ" → "wrkspc_••••R7dQ": enough to recognise it. */
export function maskId(value: string): string {
  const prefix = /^[a-z]+_/i.exec(value)?.[0] ?? "";
  return `${prefix}••••${value.slice(-4)}`;
}

const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const providerLabel = (provider: string) =>
  AI_PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider;

/** The server's own key for a provider (env), used when none is stored. */
function environmentKey(provider: string): string | null {
  switch (provider) {
    case "anthropic":
      return config.ANTHROPIC_API_KEY ?? null;
    case "openai":
      return config.OPENAI_API_KEY ?? null;
    case "gemini":
      return config.GEMINI_API_KEY ?? null;
    case "xai":
      return config.XAI_API_KEY ?? null;
    default:
      return null;
  }
}

/** The real adapters. One line per provider. */
function realProvider(
  provider: string,
  credentials: AiCredentials,
): AiProvider {
  switch (provider) {
    case "anthropic":
      return createAnthropicProvider(credentials);
    case "openai":
      return createOpenAiProvider(credentials);
    case "gemini":
      return createGeminiProvider(credentials);
    case "xai":
      return createXaiProvider(credentials);
    default:
      throw new AppError(
        503,
        "AI_PROVIDER_UNKNOWN",
        `The AI provider "${provider}" is not supported.`,
      );
  }
}

/** Built-in models plus the ones an admin added (theirs win on the same id). */
function catalogueOf(custom: CustomRow[]): AiModelInfo[] {
  const added: AiModelInfo[] = custom.map((row) => ({
    id: row.id,
    provider: row.provider as AiProviderId,
    label: row.label,
    note: "Added in Platform → AI.",
    inputUsdPerMillion: Number(row.input_usd_per_million),
    outputUsdPerMillion: Number(row.output_usd_per_million),
    cacheReadUsdPerMillion: Number(row.cache_read_usd_per_million),
    effort: row.effort,
  }));
  const ids = new Set(added.map((entry) => entry.id));
  return [...AI_MODELS.filter((entry) => !ids.has(entry.id)), ...added];
}

/**
 * A model by id. Providers answer with a dated name
 * ("claude-opus-5-5-20261101"), so the longest catalogue id it starts with
 * counts too.
 */
function findModel(catalogue: AiModelInfo[], id: string) {
  return (
    catalogue.find((entry) => entry.id === id) ??
    catalogue
      .filter((entry) => id.startsWith(entry.id))
      .sort((a, b) => b.id.length - a.id.length)[0] ??
    null
  );
}

/** What a call cost at the model's list price, in US dollars. */
export function costOf(model: AiModelInfo, usage: AiUsageCounts): number {
  const perToken = (usdPerMillion: number) => usdPerMillion / 1_000_000;
  // Writing the cache costs 25% more than plain input (Anthropic; other
  // providers report no cache writes).
  return (
    usage.inputTokens * perToken(model.inputUsdPerMillion) +
    usage.cacheWriteTokens * perToken(model.inputUsdPerMillion) * 1.25 +
    usage.cacheReadTokens * perToken(model.cacheReadUsdPerMillion) +
    usage.outputTokens * perToken(model.outputUsdPerMillion)
  );
}

/** Estimated cost of a call of a built-in model, in US dollars. */
export function estimateCostUsd(model: string, usage: AiUsageCounts): number {
  return costOf(findModel([...AI_MODELS], model) ?? AI_MODELS[0], usage);
}

/**
 * The AI layer every feature uses: whether AI is on, which providers and
 * keys, which model does what, the effort, the budget and per-person
 * limit, and the usage ledger. Features bring their own instructions and
 * output schema and call `runJson`.
 */
export function createAiService(options: AiServiceOptions) {
  const { database, authService } = options;
  const makeProvider =
    options.makeProvider ??
    ((provider: string, credentials: AiCredentials): AiProvider => {
      const fake = testProvider();
      if (fake) return fake(provider, credentials);
      return realProvider(provider, credentials);
    });

  async function readState(fresh = false): Promise<AiState> {
    if (!fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS)
      return cached.state;
    const [row, keys, custom] = await Promise.all([
      repo.findSettings(database),
      repo.listProviderKeys(database),
      repo.listCustomModels(database),
    ]);
    const state: AiState = {
      row,
      keys: new Map(keys.map((key) => [key.provider, key])),
      custom,
    };
    cached = { state, at: Date.now() };
    return state;
  }

  function storedKey(state: AiState, provider: string): string | null {
    const encrypted = state.keys.get(provider)?.api_key_encrypted;
    if (!encrypted) return null;
    try {
      return decryptSecret(encrypted);
    } catch {
      // The server's secret key changed without a rotation: the stored key
      // is unreadable. The env key (if any) still works.
      return null;
    }
  }

  function credentialsFor(
    state: AiState,
    provider: string,
  ): AiCredentials | null {
    const apiKey = storedKey(state, provider) ?? environmentKey(provider);
    if (!apiKey) return null;
    const workspaceId =
      provider === "anthropic"
        ? state.keys.get(provider)?.workspace_id ||
          config.ANTHROPIC_WORKSPACE_ID ||
          null
        : null;
    return { apiKey, workspaceId };
  }

  const connected = (state: AiState, provider: string) =>
    Boolean(state.keys.get(provider)) || Boolean(environmentKey(provider));

  function defaultModel(state: AiState, catalogue: AiModelInfo[]) {
    return (
      (state.row?.model && findModel(catalogue, state.row.model)) ||
      findModel(catalogue, DEFAULT_AI_MODEL)!
    );
  }

  function tierModel(state: AiState, catalogue: AiModelInfo[], tier: AiTier) {
    const chosen = state.row?.tier_models?.[tier];
    return (
      (chosen && catalogue.find((entry) => entry.id === chosen)) ||
      findModel(catalogue, DEFAULT_AI_TIER_MODELS[tier])!
    );
  }

  function effortSetting(state: AiState): AiEffortSetting {
    const parsed = aiEffortSettingSchema.safeParse(state.row?.effort);
    return parsed.success ? parsed.data : "auto";
  }

  function present(state: AiState) {
    const catalogue = catalogueOf(state.custom);
    const model = defaultModel(state, catalogue);
    const anthropic = state.keys.get("anthropic");
    const customIds = new Set(state.custom.map((row) => row.id));
    const models: AiModel[] = catalogue.map((entry) => ({
      ...entry,
      custom: customIds.has(entry.id),
      available: connected(state, entry.provider),
    }));
    return {
      enabled: state.row?.enabled ?? false,
      provider: model.provider,
      model: model.id,
      tierModels: {
        economy: tierModel(state, catalogue, "economy").id,
        balanced: tierModel(state, catalogue, "balanced").id,
        best: tierModel(state, catalogue, "best").id,
      },
      effort: effortSetting(state),
      hasApiKey: Boolean(anthropic),
      apiKeyLast4: anthropic?.api_key_last4 ?? null,
      hasEnvironmentKey: Boolean(config.ANTHROPIC_API_KEY),
      hasWorkspaceId: Boolean(anthropic?.workspace_id),
      workspaceIdHint: anthropic?.workspace_id
        ? maskId(anthropic.workspace_id)
        : null,
      hasEnvironmentWorkspace: Boolean(config.ANTHROPIC_WORKSPACE_ID),
      providers: AI_PROVIDERS.map((provider) => {
        const key = state.keys.get(provider.id);
        return {
          id: provider.id,
          label: provider.label,
          company: provider.company,
          hasApiKey: Boolean(key),
          apiKeyLast4: key?.api_key_last4 ?? null,
          hasEnvironmentKey: Boolean(environmentKey(provider.id)),
          hasWorkspaceId: Boolean(key?.workspace_id),
          workspaceIdHint: key?.workspace_id ? maskId(key.workspace_id) : null,
          hasEnvironmentWorkspace:
            provider.id === "anthropic" &&
            Boolean(config.ANTHROPIC_WORKSPACE_ID),
          connected: connected(state, provider.id),
        };
      }),
      models,
      monthlyBudgetUsd:
        state.row?.monthly_budget_usd == null
          ? null
          : Number(state.row.monthly_budget_usd),
      updatedAt: state.row?.updated_at
        ? new Date(state.row.updated_at).toISOString()
        : null,
    };
  }

  async function usageSummary() {
    const since = monthStart();
    const usage = await repo.usageSince(database, since);
    const ids = usage.byPerson
      .map((row) => row.user_id)
      .filter((id): id is string => Boolean(id));
    const names = new Map(
      (ids.length ? await authService.listUserDisplayNamesByIds(ids) : []).map(
        (user) => [user.id, user.display_name] as const,
      ),
    );
    return {
      since: since.toISOString(),
      calls: Number(usage.total?.calls ?? 0),
      failedCalls: Number(usage.total?.failed ?? 0),
      inputTokens: Number(usage.total?.input_tokens ?? 0),
      outputTokens: Number(usage.total?.output_tokens ?? 0),
      costUsd: Number(usage.total?.cost ?? 0),
      byFeature: usage.byFeature.map((row) => ({
        feature: row.feature,
        calls: Number(row.calls),
        costUsd: Number(row.cost),
      })),
      byModel: usage.byModel.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: Number(row.calls),
        costUsd: Number(row.cost),
      })),
      byPerson: usage.byPerson.map((row) => ({
        userId: row.user_id,
        name: (row.user_id && names.get(row.user_id)) || "Removed account",
        calls: Number(row.calls),
        costUsd: Number(row.cost),
      })),
    };
  }

  async function getSettings(): Promise<AiSettingsResponse> {
    const state = await readState(true);
    return { settings: present(state), usage: await usageSummary() };
  }

  /** A model id an admin picked: it must be in the catalogue. */
  function requireModel(catalogue: AiModelInfo[], id: string) {
    const model = catalogue.find((entry) => entry.id === id);
    if (!model)
      throw new AppError(
        400,
        "AI_MODEL_UNKNOWN",
        `"${id}" is not one of the models. Add it under Models first.`,
      );
    return model;
  }

  async function updateSettings(
    actorId: string,
    request: UpdateAiSettingsRequest,
  ): Promise<AiSettingsResponse> {
    const state = await readState(true);
    const catalogue = catalogueOf(state.custom);
    const values: Parameters<typeof repo.saveSettings>[1] = {
      updated_by: actorId,
    };
    if (request.enabled !== undefined) values.enabled = request.enabled;
    if (request.model !== undefined) {
      const model = requireModel(catalogue, request.model);
      values.model = model.id;
      values.provider = model.provider;
    }
    if (request.tierModels) {
      const tiers = { ...(state.row?.tier_models ?? {}) };
      for (const tier of aiTierSchema.options) {
        const id = request.tierModels[tier];
        if (id !== undefined) tiers[tier] = requireModel(catalogue, id).id;
      }
      // The whole-course model changed and no Economy model was named:
      // the quick checks of a run (does this lecture teach code?) use the
      // cheapest model of the same provider.
      const course = request.tierModels.balanced;
      if (course !== undefined && request.tierModels.economy === undefined) {
        const provider = requireModel(catalogue, course).provider;
        const cheapest = catalogue
          .filter((entry) => entry.provider === provider)
          .sort((a, b) => a.outputUsdPerMillion - b.outputUsdPerMillion)[0];
        if (cheapest) tiers.economy = cheapest.id;
      }
      values.tier_models = tiers;
    }
    if (request.effort !== undefined) values.effort = request.effort;
    if (request.monthlyBudgetUsd !== undefined)
      values.monthly_budget_usd =
        request.monthlyBudgetUsd === null
          ? null
          : request.monthlyBudgetUsd.toFixed(2);
    await repo.saveSettings(database, values);
    // The key and workspace fields are Anthropic's (pages from before
    // there were providers).
    if (request.apiKey !== undefined || request.workspaceId !== undefined)
      await saveProvider(actorId, "anthropic", {
        apiKey: request.apiKey,
        workspaceId: request.workspaceId,
      });
    cached = null;
    return await getSettings();
  }

  /** Save, replace or remove one provider's key (and Anthropic's workspace). */
  async function saveProvider(
    actorId: string,
    provider: AiProviderId,
    request: SaveAiProviderRequest,
  ): Promise<AiSettingsResponse> {
    const workspace =
      provider === "anthropic" && request.workspaceId !== undefined
        ? request.workspaceId?.trim() || null
        : undefined;
    if (provider !== "anthropic" && request.workspaceId)
      throw new AppError(
        400,
        "AI_WORKSPACE_NOT_USED",
        `${providerLabel(provider)} keys do not use a workspace.`,
      );
    if (request.apiKey === null) {
      await repo.deleteProviderKey(database, provider);
    } else if (request.apiKey !== undefined) {
      await repo.saveProviderKey(database, {
        provider,
        api_key_encrypted: encryptSecret(request.apiKey),
        api_key_last4: request.apiKey.slice(-4),
        ...(workspace !== undefined ? { workspace_id: workspace } : {}),
        updated_by: actorId,
      });
      await adoptProvider(actorId, provider);
    } else if (workspace !== undefined) {
      const saved = await repo.updateProviderWorkspace(
        database,
        provider,
        workspace,
        actorId,
      );
      // A workspace with no stored key: kept in the settings row, where
      // the server's env key (if any) finds it.
      if (!saved && workspace !== null && !environmentKey(provider))
        throw new AppError(
          400,
          "AI_KEY_FIRST",
          "Save the Claude API key first, then its workspace.",
        );
    }
    if (provider === "anthropic") await mirrorAnthropic(actorId, workspace);
    cached = null;
    return await getSettings();
  }

  /**
   * A provider was just connected: every model slot (one lecture, Economy,
   * Balanced, Best) whose provider has no key moves to this provider's
   * models, cheapest to best. Connecting only Gemini makes Gemini do
   * everything; slots that already work are left alone.
   */
  async function adoptProvider(actorId: string, provider: AiProviderId) {
    const state = await readState(true);
    const catalogue = catalogueOf(state.custom);
    const own = catalogue
      .filter((entry) => entry.provider === provider)
      .sort((a, b) => a.outputUsdPerMillion - b.outputUsdPerMillion);
    if (!own.length) return;
    const picks: Record<AiTier, AiModelInfo> = {
      economy: own[0]!,
      balanced: own[Math.ceil((own.length - 1) / 2)]!,
      best: own.at(-1)!,
    };
    const values: Parameters<typeof repo.saveSettings>[1] = {
      updated_by: actorId,
    };
    if (!connected(state, defaultModel(state, catalogue).provider)) {
      values.model = picks.best.id;
      values.provider = provider;
    }
    const tiers = { ...(state.row?.tier_models ?? {}) };
    let moved = false;
    for (const tier of aiTierSchema.options) {
      if (connected(state, tierModel(state, catalogue, tier).provider))
        continue;
      tiers[tier] = picks[tier].id;
      moved = true;
    }
    if (moved) values.tier_models = tiers;
    if (values.model || moved) await repo.saveSettings(database, values);
  }

  /**
   * Anthropic's key and workspace are also kept in `ai_settings`, where an
   * older API (after a rollback) reads them.
   */
  async function mirrorAnthropic(
    actorId: string,
    workspace: string | null | undefined,
  ) {
    const key = (await repo.listProviderKeys(database)).find(
      (row) => row.provider === "anthropic",
    );
    await repo.saveSettings(database, {
      updated_by: actorId,
      api_key_encrypted: key?.api_key_encrypted ?? null,
      api_key_last4: key?.api_key_last4 ?? null,
      workspace_id:
        key?.workspace_id ?? (workspace === undefined ? undefined : workspace),
    });
  }

  async function addModel(
    actorId: string,
    request: AiCustomModelRequest,
  ): Promise<AiSettingsResponse> {
    await repo.saveCustomModel(database, {
      id: request.id,
      provider: request.provider,
      label: request.label,
      input_usd_per_million: String(request.inputUsdPerMillion),
      output_usd_per_million: String(request.outputUsdPerMillion),
      cache_read_usd_per_million: String(request.cacheReadUsdPerMillion ?? 0),
      effort: request.effort ?? true,
      created_by: actorId,
    });
    cached = null;
    return await getSettings();
  }

  /** Removes an added model; settings that used it go back to the defaults. */
  async function removeModel(id: string): Promise<AiSettingsResponse> {
    const removed = await repo.deleteCustomModel(database, id);
    if (!removed)
      throw new AppError(
        404,
        "AI_MODEL_NOT_FOUND",
        "That model is not one you added.",
      );
    cached = null;
    return await getSettings();
  }

  /** Why AI cannot be used with this model now, or null when it can. */
  function blocker(state: AiState, model: AiModelInfo): AppError | null {
    if (!state.row?.enabled)
      return new AppError(
        403,
        "AI_DISABLED",
        "AI features are off. An admin can turn them on in Platform → AI.",
      );
    if (!connected(state, model.provider))
      return new AppError(
        503,
        "AI_NOT_CONFIGURED",
        `${model.label} needs a ${providerLabel(model.provider)} API key. An admin can add one in Platform → AI, or pick another model there.`,
      );
    return null;
  }

  /** The model a call uses: the one named, the tier's, or the default. */
  function modelOf(
    state: AiState,
    request: Pick<AiRunRequest, "model" | "tier">,
  ) {
    const catalogue = catalogueOf(state.custom);
    if (request.model) {
      const named = findModel(catalogue, request.model);
      if (!named)
        throw new AppError(
          400,
          "AI_MODEL_UNKNOWN",
          `The model "${request.model}" is not set up in Platform → AI.`,
        );
      return named;
    }
    if (request.tier) return tierModel(state, catalogue, request.tier);
    return defaultModel(state, catalogue);
  }

  /** The effort a call runs at, and null when the model has no such setting. */
  function effortOf(
    state: AiState,
    model: AiModelInfo,
    request: Pick<AiRunRequest, "effort" | "effortChosen">,
  ): AiEffort | null {
    if (!model.effort) return null;
    if (request.effortChosen) return request.effort;
    const setting = effortSetting(state);
    return setting === "auto" ? request.effort : setting;
  }

  /**
   * A tier's model as features show it (a course-wide run's estimate):
   * its prices, whether it can be used, and the effort a call would get.
   */
  async function tierInfo(tier: AiTier, effort?: AiEffort) {
    const state = await readState();
    const model = modelOf(state, { tier });
    const problem = blocker(state, model);
    return {
      model,
      providerLabel: providerLabel(model.provider),
      effort: effortOf(state, model, {
        effort: effort ?? "medium",
        effortChosen: effort !== undefined,
      }),
      blocked: problem?.code === "AI_NOT_CONFIGURED" ? problem.message : null,
    };
  }

  async function availability(): Promise<AiAvailability> {
    const state = await readState();
    const catalogue = catalogueOf(state.custom);
    const model = defaultModel(state, catalogue);
    const problem = blocker(state, model);
    return {
      available: !problem,
      enabled: state.row?.enabled ?? false,
      reason: problem?.message ?? null,
      model: problem ? null : model.label,
      tiers: aiTierSchema.options.map((tier) => {
        const entry = tierModel(state, catalogue, tier);
        return {
          id: tier,
          model: entry.id,
          label: entry.label,
          available: connected(state, entry.provider),
        };
      }),
    };
  }

  async function record(
    request: Pick<AiRunRequest, "feature" | "userId" | "subjectId">,
    model: AiModelInfo,
    answeredBy: string,
    status: "ok" | "error" | "refused" | "cancelled",
    started: number,
    usage: AiUsageCounts | null,
    errorCode: string | null = null,
  ) {
    const counts = usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    await repo
      .insertUsage(database, {
        user_id: request.userId,
        feature: request.feature,
        provider: model.provider,
        model: answeredBy,
        status,
        error_code: errorCode,
        subject_id: request.subjectId ?? null,
        input_tokens: counts.inputTokens,
        output_tokens: counts.outputTokens,
        cache_read_tokens: counts.cacheReadTokens,
        cache_write_tokens: counts.cacheWriteTokens,
        cost_usd: costOf(model, counts).toFixed(6),
        duration_ms: Date.now() - started,
      })
      // The ledger must never turn a finished answer into a failure.
      .catch(() => undefined);
  }

  /**
   * One call: picks the model (named, tier or default) and its provider,
   * checks AI is on, that provider's key, the person's limit and the
   * month's budget, calls the provider, and writes the usage row whatever
   * happens. Returns the JSON text; the feature parses and validates it.
   */
  async function runJson(request: AiRunRequest) {
    const state = await readState();
    const model = modelOf(state, request);
    const problem = blocker(state, model);
    if (problem) throw problem;

    const recent = request.background
      ? 0
      : await repo.countCallsSince(
          database,
          request.userId,
          new Date(Date.now() - WINDOW_MS),
        );
    if (recent >= CALLS_PER_WINDOW)
      throw new AppError(
        429,
        "AI_RATE_LIMITED",
        "You have used AI a lot in the last few minutes. Try again in about ten minutes.",
      );
    const budget = present(state).monthlyBudgetUsd;
    if (budget !== null) {
      const spent = await repo.spendSince(database, monthStart());
      if (spent >= budget)
        throw new AppError(
          429,
          "AI_BUDGET_REACHED",
          "This month's AI budget is used up. An admin can raise it in Platform → AI.",
        );
    }

    const provider = makeProvider(
      model.provider,
      credentialsFor(state, model.provider)!,
    );
    const started = Date.now();
    try {
      const result = await provider.generateJson({
        model: model.id,
        system: request.system,
        user: request.user,
        schema: request.schema,
        maxTokens: request.maxTokens,
        effort: effortOf(state, model, request),
        signal: request.signal,
        onProgress: request.onProgress,
      });
      // Priced by the model asked for; the ledger keeps the name the
      // provider answered with (a dated or fallback model).
      const priced =
        findModel(catalogueOf(state.custom), result.model) ?? model;
      if (result.ending === "refused") {
        await record(
          request,
          priced,
          result.model,
          "refused",
          started,
          result.usage,
          "refused",
        );
        throw new AppError(
          422,
          "AI_REFUSED",
          "The AI declined this request. Try a different brief.",
        );
      }
      if (result.ending === "cut_off") {
        await record(
          request,
          priced,
          result.model,
          "error",
          started,
          result.usage,
          "cut_off",
        );
        throw new AppError(
          422,
          "AI_ANSWER_TOO_LONG",
          "The AI's answer was too long and got cut off. Try a smaller question.",
        );
      }
      await record(request, priced, result.model, "ok", started, result.usage);
      return { text: result.text, model: result.model };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError("unknown", "AI call failed.");
      await record(
        request,
        model,
        model.id,
        providerError.code === "cancelled" ? "cancelled" : "error",
        started,
        null,
        providerError.code,
      );
      throw new AppError(
        providerError.code === "rate_limited" ? 429 : 502,
        providerError.code === "cancelled"
          ? "AI_CANCELLED"
          : `AI_${providerError.code.toUpperCase()}`,
        providerError.message,
      );
    }
  }

  /**
   * A tiny call that proves a key and model work. Not counted. With a
   * provider: its key with the cheapest of its models (or the one named).
   */
  async function testConnection(
    request: TestAiConnectionRequest = {},
  ): Promise<TestAiConnectionResponse> {
    const state = await readState(true);
    const catalogue = catalogueOf(state.custom);
    const model = request.model
      ? requireModel(catalogue, request.model)
      : request.provider
        ? catalogue
            .filter((entry) => entry.provider === request.provider)
            .sort((a, b) => a.outputUsdPerMillion - b.outputUsdPerMillion)[0]
        : defaultModel(state, catalogue);
    if (!model)
      return {
        ok: false,
        model: "",
        message: "No model of this provider is set up.",
        ms: 0,
      };
    const credentials = credentialsFor(state, model.provider);
    if (!credentials)
      return {
        ok: false,
        model: model.id,
        message: `No ${providerLabel(model.provider)} API key is set.`,
        ms: 0,
      };
    const started = Date.now();
    try {
      const result = await makeProvider(
        model.provider,
        credentials,
      ).generateJson({
        model: model.id,
        system: "Answer with the JSON asked for.",
        user: 'Reply with {"ok": true}.',
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        maxTokens: 2_000,
        effort: model.effort ? "low" : null,
      });
      return {
        ok: true,
        model: result.model,
        message: "Connected.",
        ms: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        model: model.id,
        message:
          error instanceof Error ? error.message : "Could not reach the AI.",
        ms: Date.now() - started,
      };
    }
  }

  return {
    getSettings,
    updateSettings,
    saveProvider,
    addModel,
    removeModel,
    availability,
    tierInfo,
    testConnection,
    runJson,
  };
}

export type AiService = ReturnType<typeof createAiService>;
