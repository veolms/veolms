import { useState } from "react";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { BuildingsIcon as Buildings } from "@phosphor-icons/react/Buildings";
import { CoinsIcon as Coins } from "@phosphor-icons/react/Coins";
import { KeyIcon as Key } from "@phosphor-icons/react/Key";
import { PlugsConnectedIcon as PlugsConnected } from "@phosphor-icons/react/PlugsConnected";
import { PowerIcon as Power } from "@phosphor-icons/react/Power";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { AI_MODELS, type UpdateAiSettingsRequest } from "@veolms/contracts";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { inputClass } from "../coupons/couponHelpers";
import { getApiError } from "../lib/api-error";
import {
  useAiSettings,
  useTestAiConnection,
  useUpdateAiSettings,
} from "../services/ai";
import {
  SettingRow,
  SettingsToggle,
  StatusNote,
  SETTINGS_SELECT_TRIGGER,
} from "../settings/SettingsControls";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { PlatformSettingsStatus } from "./PlatformSettingsStatus";

const ROW_CLASS =
  "max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2";
const FIELD = `${inputClass} w-full sm:w-64`;

const MODEL_OPTIONS: readonly ThemedSelectOption[] = AI_MODELS.map((model) => [
  model.id,
  model.label,
]);

const FEATURE_NAMES: Record<string, string> = {
  "coding.generate": "Coding questions written",
  "coding.revise": "Coding questions changed",
};

const usd = (value: number) =>
  value < 0.01 && value > 0 ? "< $0.01" : `$${value.toFixed(2)}`;

/**
 * Platform → AI: whether AI features are on, the provider key and model,
 * a monthly budget, and what was spent this month. The key is write-only:
 * the page never sees it again after it is saved.
 */
export function PlatformAiTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const query = useAiSettings();
  const update = useUpdateAiSettings();
  const test = useTestAiConnection();
  const [key, setKey] = useState("");
  const [budget, setBudget] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);

  if (!query.data) {
    return (
      <PlatformSettingsStatus
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const { settings, usage } = query.data;
  const model = AI_MODELS.find((entry) => entry.id === settings.model);
  const keyReady = settings.hasApiKey || settings.hasEnvironmentKey;

  const save = (payload: UpdateAiSettingsRequest, message: string) =>
    update.mutate(payload, {
      onSuccess: () => setNotice?.(message),
      onError: (error) => setNotice?.(getApiError(error).message),
    });

  const budgetValue =
    budget ??
    (settings.monthlyBudgetUsd === null
      ? ""
      : String(settings.monthlyBudgetUsd));

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>AI</h2>
          <p>
            AI that helps your team write course content. First feature: coding
            practice questions written from a lecture, checked by you before
            learners see them.
          </p>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="ai-on-heading">
        <header className="settings-section__heading mb-3">
          <Sparkle size={20} weight="duotone" />
          <div>
            <h3 id="ai-on-heading">AI features</h3>
            <p>
              When on, the titles and text of a course are sent to the AI
              provider when someone on your team asks AI to write for it.
              Learners&rsquo; data is never sent.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Power}
            label="Use AI"
            note={
              keyReady
                ? "Admins and instructors see “Create with AI” in a lecture's Practice tab."
                : "Add an API key below first."
            }
          >
            <SettingsToggle
              checked={settings.enabled}
              disabled={!keyReady && !settings.enabled}
              label="Use AI features"
              onChange={(enabled) =>
                save(
                  { enabled },
                  enabled ? "AI features are on." : "AI features are off.",
                )
              }
            />
          </SettingRow>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="ai-provider-heading"
      >
        <header className="settings-section__heading mb-3">
          <Brain size={20} weight="duotone" />
          <div>
            <h3 id="ai-provider-heading">Provider and model</h3>
            <p>Anthropic&rsquo;s Claude. Other providers can be added later.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Brain}
            label="Model"
            note={model?.note ?? ""}
          >
            <ThemedSelect
              triggerClassName={SETTINGS_SELECT_TRIGGER}
              id="platform-ai-model"
              ariaLabel="AI model"
              value={settings.model}
              options={MODEL_OPTIONS}
              onValueChange={(value) =>
                save(
                  { model: value as (typeof AI_MODELS)[number]["id"] },
                  `AI now uses ${AI_MODELS.find((entry) => entry.id === value)?.label ?? value}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Key}
            label="API key"
            note={
              settings.hasApiKey
                ? `Saved, ending in ${settings.apiKeyLast4 ?? "····"}. Paste a new one to replace it.`
                : settings.hasEnvironmentKey
                  ? "Using the key set on the server. Paste one here to use another."
                  : "From console.anthropic.com → API keys. Stored encrypted; never shown again."
            }
          >
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!key.trim()) return;
                save({ apiKey: key.trim() }, "API key saved.");
                setKey("");
              }}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label="API key"
                placeholder={
                  settings.hasApiKey ? "Paste a new key" : "sk-ant-…"
                }
                value={key}
                onChange={(event) => setKey(event.target.value)}
                className={FIELD}
              />
              <Button
                type="submit"
                variant="quiet"
                elevation="flat"
                disabled={key.trim().length < 20 || update.isPending}
              >
                Save key
              </Button>
              {settings.hasApiKey ? (
                <Button
                  type="button"
                  variant="quiet"
                  elevation="flat"
                  disabled={update.isPending}
                  onClick={() => save({ apiKey: null }, "API key removed.")}
                >
                  Remove
                </Button>
              ) : null}
            </form>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Buildings}
            label="Workspace ID"
            note={
              settings.workspaceId
                ? "Requests name this Anthropic workspace. Needed only for a key made outside a workspace."
                : settings.hasEnvironmentWorkspace
                  ? "Using the workspace set on the server."
                  : "Only for a key made at the organisation level: Console → Settings → Workspaces → the workspace's ID (wrkspc_…). Leave empty for a key made inside a workspace."
            }
          >
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = (workspace ?? "").trim();
                save(
                  { workspaceId: value || null },
                  value ? "Workspace ID saved." : "Workspace ID removed.",
                );
                setWorkspace(null);
              }}
            >
              <input
                autoComplete="off"
                spellCheck={false}
                aria-label="Workspace ID"
                placeholder="wrkspc_…"
                value={workspace ?? settings.workspaceId ?? ""}
                onChange={(event) =>
                  setWorkspace(
                    event.target.value.replace(/[^A-Za-z0-9_-]/g, ""),
                  )
                }
                maxLength={100}
                className={FIELD}
              />
              <Button
                type="submit"
                variant="quiet"
                elevation="flat"
                disabled={workspace === null || update.isPending}
              >
                Save
              </Button>
            </form>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={PlugsConnected}
            label="Check the connection"
            note={
              test.data
                ? test.data.ok
                  ? `Connected to ${test.data.model} in ${(test.data.ms / 1000).toFixed(1)} s.`
                  : test.data.message
                : "Makes one tiny call with the saved key and model."
            }
          >
            <Button
              variant="quiet"
              elevation="flat"
              disabled={!keyReady || test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? <LoadingSpinnerIcon size={16} /> : null}
              Test
            </Button>
          </SettingRow>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="ai-spend-heading">
        <header className="settings-section__heading mb-3">
          <Coins size={20} weight="duotone" />
          <div>
            <h3 id="ai-spend-heading">Spending</h3>
            <p>
              Estimated from the model&rsquo;s list price. Your provider&rsquo;s
              bill is the exact amount.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Coins}
            label="Monthly budget"
            note="AI stops for everyone this month once it is spent. Empty: no limit."
          >
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = budgetValue.trim();
                const amount = value === "" ? null : Number(value);
                if (amount !== null && (!Number.isFinite(amount) || amount < 0))
                  return;
                save(
                  { monthlyBudgetUsd: amount },
                  amount === null
                    ? "No monthly AI budget."
                    : `Monthly AI budget: $${amount.toFixed(2)}.`,
                );
                setBudget(null);
              }}
            >
              <span className="text-sm text-(--muted)">$</span>
              <input
                inputMode="decimal"
                aria-label="Monthly budget in US dollars"
                placeholder="No limit"
                value={budgetValue}
                onChange={(event) =>
                  setBudget(event.target.value.replace(/[^0-9.]/g, ""))
                }
                className={`${inputClass} w-28`}
              />
              <Button
                type="submit"
                variant="quiet"
                elevation="flat"
                disabled={budget === null || update.isPending}
              >
                Save
              </Button>
            </form>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Sparkle}
            label="This month"
            note={
              usage.calls === 0
                ? "No AI calls yet this month."
                : `${usage.calls} call${usage.calls === 1 ? "" : "s"}${usage.failedCalls ? ` (${usage.failedCalls} failed)` : ""} · ${(usage.inputTokens / 1000).toFixed(0)}k tokens in, ${(usage.outputTokens / 1000).toFixed(0)}k out`
            }
          >
            <StatusNote>{usd(usage.costUsd)}</StatusNote>
          </SettingRow>
        </div>
        {usage.byFeature.length > 0 || usage.byPerson.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <UsageList
              title="By feature"
              rows={usage.byFeature.map((row) => ({
                key: row.feature,
                name: FEATURE_NAMES[row.feature] ?? row.feature,
                calls: row.calls,
                costUsd: row.costUsd,
              }))}
            />
            <UsageList
              title="By person"
              rows={usage.byPerson.map((row) => ({
                key: row.userId ?? row.name,
                name: row.name,
                calls: row.calls,
                costUsd: row.costUsd,
              }))}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UsageList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; calls: number; costUsd: number }[];
}) {
  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-3">
      <h4 className="mb-2 text-xs font-bold tracking-wide text-(--muted) uppercase">
        {title}
      </h4>
      <ul className="grid gap-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-(--text)">
              {row.name}
            </span>
            <span className="text-(--muted) tabular-nums">{row.calls}</span>
            <span className="w-16 text-right font-semibold text-(--text) tabular-nums">
              {usd(row.costUsd)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
