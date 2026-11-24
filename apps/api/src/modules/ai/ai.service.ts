import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  type AiAvailability,
  type AiFeature,
  type AiSettingsResponse,
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
  "model" | "signal" | "onProgress"
> {
  feature: AiFeature;
  userId: string;
  subjectId?: string | null;
  signal?: AbortSignal;
  onProgress?: (chars: number) => void;
}

type SettingsRow = Awaited<ReturnType<typeof repo.findSettings>>;

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

let cached: { row: SettingsRow; at: number } | null = null;

/** "wrkspc_016hBr…R7dQ" → "wrkspc_••••R7dQ": enough to recognise it. */
export function maskId(value: string): string {
  const prefix = /^[a-z]+_/i.exec(value)?.[0] ?? "";
  return `${prefix}••••${value.slice(-4)}`;
}

const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Estimated cost of a call from the model's list price, in US dollars. */
export function estimateCostUsd(model: string, usage: AiUsageCounts): number {
  const price =
    AI_MODELS.find((entry) => entry.id === model) ??
    AI_MODELS.find((entry) => model.startsWith(entry.id)) ??
    AI_MODELS[0];
  const perToken = (usdPerMillion: number) => usdPerMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.inputUsdPerMillion) +
    usage.cacheWriteTokens * perToken(price.inputUsdPerMillion) * 1.25 +
    usage.cacheReadTokens * perToken(price.cacheReadUsdPerMillion) +
    usage.outputTokens * perToken(price.outputUsdPerMillion)
  );
}

/**
 * The AI layer every feature uses: whether AI is on, which provider and
 * key, the budget and per-person limit, and the usage ledger. Features
 * bring their own instructions and output schema and call `runJson`.
 */
export function createAiService(options: AiServiceOptions) {
  const { database, authService } = options;
  const makeProvider =
    options.makeProvider ??
    ((provider: string, credentials: AiCredentials): AiProvider => {
      const fake = testProvider();
      if (fake) return fake(provider, credentials);
      if (provider === "anthropic") return createAnthropicProvider(credentials);
      throw new AppError(
        503,
        "AI_PROVIDER_UNKNOWN",
        `The AI provider "${provider}" is not supported.`,
      );
    });

  async function readSettings(fresh = false): Promise<SettingsRow> {
    if (!fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS)
      return cached.row;
    const row = await repo.findSettings(database);
    cached = { row, at: Date.now() };
    return row;
  }

  function storedKey(row: SettingsRow): string | null {
    if (!row?.api_key_encrypted) return null;
    try {
      return decryptSecret(row.api_key_encrypted);
    } catch {
      // The server's secret key changed without a rotation: the stored key
      // is unreadable. The env key (if any) still works.
      return null;
    }
  }

  function resolveKey(row: SettingsRow): string | null {
    return storedKey(row) ?? config.ANTHROPIC_API_KEY ?? null;
  }

  /** The workspace stored in the settings, else the server's, else none. */
  function resolveWorkspace(row: SettingsRow): string | null {
    return row?.workspace_id || config.ANTHROPIC_WORKSPACE_ID || null;
  }

  function present(row: SettingsRow) {
    return {
      enabled: row?.enabled ?? false,
      provider: "anthropic" as const,
      model: (AI_MODELS.find((entry) => entry.id === row?.model)?.id ??
        DEFAULT_AI_MODEL) as (typeof AI_MODELS)[number]["id"],
      hasApiKey: Boolean(row?.api_key_encrypted),
      apiKeyLast4: row?.api_key_last4 ?? null,
      hasEnvironmentKey: Boolean(config.ANTHROPIC_API_KEY),
      hasWorkspaceId: Boolean(row?.workspace_id),
      workspaceIdHint: row?.workspace_id ? maskId(row.workspace_id) : null,
      hasEnvironmentWorkspace: Boolean(config.ANTHROPIC_WORKSPACE_ID),
      monthlyBudgetUsd:
        row?.monthly_budget_usd == null ? null : Number(row.monthly_budget_usd),
      updatedAt: row?.updated_at
        ? new Date(row.updated_at).toISOString()
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
      byPerson: usage.byPerson.map((row) => ({
        userId: row.user_id,
        name: (row.user_id && names.get(row.user_id)) || "Removed account",
        calls: Number(row.calls),
        costUsd: Number(row.cost),
      })),
    };
  }

  async function getSettings(): Promise<AiSettingsResponse> {
    const row = await readSettings(true);
    return { settings: present(row), usage: await usageSummary() };
  }

  async function updateSettings(
    actorId: string,
    request: UpdateAiSettingsRequest,
  ): Promise<AiSettingsResponse> {
    const values: Parameters<typeof repo.saveSettings>[1] = {
      updated_by: actorId,
    };
    if (request.enabled !== undefined) values.enabled = request.enabled;
    if (request.provider !== undefined) values.provider = request.provider;
    if (request.model !== undefined) values.model = request.model;
    if (request.monthlyBudgetUsd !== undefined)
      values.monthly_budget_usd =
        request.monthlyBudgetUsd === null
          ? null
          : request.monthlyBudgetUsd.toFixed(2);
    if (request.apiKey === null) {
      values.api_key_encrypted = null;
      values.api_key_last4 = null;
    } else if (request.apiKey !== undefined) {
      values.api_key_encrypted = encryptSecret(request.apiKey);
      values.api_key_last4 = request.apiKey.slice(-4);
    }
    if (request.workspaceId !== undefined)
      values.workspace_id = request.workspaceId?.trim() || null;
    await repo.saveSettings(database, values);
    cached = null;
    return await getSettings();
  }

  /** Why AI cannot be used now, or null when it can. */
  function blocker(row: SettingsRow): AppError | null {
    if (!row?.enabled)
      return new AppError(
        403,
        "AI_DISABLED",
        "AI features are off. An admin can turn them on in Platform → AI.",
      );
    if (!resolveKey(row))
      return new AppError(
        503,
        "AI_NOT_CONFIGURED",
        "No AI provider key is set. An admin can add one in Platform → AI.",
      );
    return null;
  }

  async function availability(): Promise<AiAvailability> {
    const row = await readSettings();
    const problem = blocker(row);
    return {
      available: !problem,
      reason: problem?.message ?? null,
      model: problem ? null : present(row).model,
    };
  }

  async function record(
    request: Pick<AiRunRequest, "feature" | "userId" | "subjectId">,
    provider: string,
    model: string,
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
        provider,
        model,
        status,
        error_code: errorCode,
        subject_id: request.subjectId ?? null,
        input_tokens: counts.inputTokens,
        output_tokens: counts.outputTokens,
        cache_read_tokens: counts.cacheReadTokens,
        cache_write_tokens: counts.cacheWriteTokens,
        cost_usd: estimateCostUsd(model, counts).toFixed(6),
        duration_ms: Date.now() - started,
      })
      // The ledger must never turn a finished answer into a failure.
      .catch(() => undefined);
  }

  /**
   * One call: checks AI is on, the person's limit and the month's budget,
   * calls the provider, and writes the usage row whatever happens.
   * Returns the JSON text; the feature parses and validates it.
   */
  async function runJson(request: AiRunRequest) {
    const row = await readSettings();
    const problem = blocker(row);
    if (problem) throw problem;
    const settings = present(row);

    const recent = await repo.countCallsSince(
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
    if (settings.monthlyBudgetUsd !== null) {
      const spent = await repo.spendSince(database, monthStart());
      if (spent >= settings.monthlyBudgetUsd)
        throw new AppError(
          429,
          "AI_BUDGET_REACHED",
          "This month's AI budget is used up. An admin can raise it in Platform → AI.",
        );
    }

    const provider = makeProvider(settings.provider, {
      apiKey: resolveKey(row)!,
      workspaceId: resolveWorkspace(row),
    });
    const started = Date.now();
    try {
      const result = await provider.generateJson({
        model: settings.model,
        system: request.system,
        user: request.user,
        schema: request.schema,
        maxTokens: request.maxTokens,
        effort: request.effort,
        signal: request.signal,
        onProgress: request.onProgress,
      });
      if (result.ending === "refused") {
        await record(
          request,
          settings.provider,
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
          settings.provider,
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
      await record(
        request,
        settings.provider,
        result.model,
        "ok",
        started,
        result.usage,
      );
      return { text: result.text, model: result.model };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError("unknown", "AI call failed.");
      await record(
        request,
        settings.provider,
        settings.model,
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

  /** A tiny call that proves the key and model work. Not counted. */
  async function testConnection(): Promise<TestAiConnectionResponse> {
    const row = await readSettings(true);
    const settings = present(row);
    const key = resolveKey(row);
    if (!key)
      return {
        ok: false,
        model: settings.model,
        message: "No API key is set.",
        ms: 0,
      };
    const started = Date.now();
    try {
      const result = await makeProvider(settings.provider, {
        apiKey: key,
        workspaceId: resolveWorkspace(row),
      }).generateJson({
        model: settings.model,
        system: "Answer with the JSON asked for.",
        user: 'Reply with {"ok": true}.',
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        maxTokens: 2_000,
        effort: "low",
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
        model: settings.model,
        message:
          error instanceof Error ? error.message : "Could not reach the AI.",
        ms: Date.now() - started,
      };
    }
  }

  return {
    getSettings,
    updateSettings,
    availability,
    testConnection,
    runJson,
  };
}

export type AiService = ReturnType<typeof createAiService>;
