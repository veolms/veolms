import { useState } from "react";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { BuildingsIcon as Buildings } from "@phosphor-icons/react/Buildings";
import { CoinsIcon as Coins } from "@phosphor-icons/react/Coins";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/Gauge";
import { KeyIcon as Key } from "@phosphor-icons/react/Key";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PowerIcon as Power } from "@phosphor-icons/react/Power";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import {
  AI_EFFORTS,
  AI_PROVIDERS,
  type AiEffortSetting,
  type AiModel,
  type AiProvider,
  type AiProviderStatus,
  type UpdateAiSettingsRequest,
} from "@veolms/contracts";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { inputClass } from "../coupons/couponHelpers";
import { getApiError } from "../lib/api-error";
import {
  useAddAiModel,
  useAiSettings,
  useRemoveAiModel,
  useSaveAiProvider,
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

/**
 * Rows with a form or a picker: on phones the control drops under the
 * words. "!" because the settings rows' own (unlayered) grid rule would
 * win over a plain utility.
 */
const ROW_CLASS =
  "max-[760px]:grid-cols-[34px_minmax(0,1fr)]! max-[760px]:gap-y-2! max-[760px]:[&>.settings-row__control]:col-start-2! max-[760px]:[&>.settings-row__control]:justify-start! max-[760px]:[&>.settings-row__control]:min-w-0!";
const FIELD = `${inputClass} w-full sm:w-64`;

const FEATURE_NAMES: Record<string, string> = {
  "coding.generate": "Coding questions written",
  "coding.revise": "Coding questions changed",
  "quiz.generate": "Quiz questions written",
  "quiz.revise": "Quiz questions changed",
  "course.questions": "Course-wide question runs",
};

const EFFORT_OPTIONS: readonly ThemedSelectOption<AiEffortSetting>[] = [
  [
    "auto",
    "Auto (suggested)",
    { subtitle: "High for one question, medium for a whole course" },
  ],
  ...AI_EFFORTS.map(
    (entry) =>
      [
        entry.id,
        entry.label,
        { subtitle: entry.note },
      ] as ThemedSelectOption<AiEffortSetting>,
  ),
];

const usd = (value: number) =>
  value < 0.01 && value > 0 ? "< $0.01" : `$${value.toFixed(2)}`;

const price = (value: number) =>
  `$${value < 1 ? value.toFixed(2).replace(/0$/, "") : value.toFixed(value % 1 ? 2 : 0)}`;

const providerName = (id: string) =>
  AI_PROVIDERS.find((entry) => entry.id === id)?.label ?? id;

/** A model in a picker: its name, provider and price, and whether it has a key. */
function modelOptions(models: AiModel[]): ThemedSelectOption[] {
  return models.map((model) => [
    model.id,
    model.label,
    {
      subtitle: `${providerName(model.provider)} · ${price(model.inputUsdPerMillion)} / ${price(model.outputUsdPerMillion)} per M tokens${model.available ? "" : " · needs a key"}`,
      searchKeywords: `${model.id} ${model.provider} ${providerName(model.provider)}`,
    },
  ]);
}

/**
 * Platform → AI: whether AI features are on, each provider's key (Claude,
 * ChatGPT, Gemini, Grok), which model does what, how hard it thinks,
 * models an admin added, a monthly budget, and what was spent this month.
 * Keys are write-only: the page never sees one again after it is saved.
 */
export function PlatformAiTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const query = useAiSettings();
  const update = useUpdateAiSettings();
  const [budget, setBudget] = useState<string | null>(null);

  if (!query.data) {
    return (
      <PlatformSettingsStatus
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const { settings, usage } = query.data;
  const models = settings.models;
  const model = models.find((entry) => entry.id === settings.model);
  const anyKey = settings.providers.some((provider) => provider.connected);
  const options = modelOptions(models);

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

  const courseModel = models.find(
    (entry) => entry.id === settings.tierModels.balanced,
  );
  const modelNote = (entry: AiModel | undefined) =>
    entry && !entry.available
      ? `Needs a ${providerName(entry.provider)} key above.`
      : (entry?.note ?? "");

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>AI</h2>
          <p>
            AI that helps your team write course content: quizzes and coding
            questions written from a lecture, checked by you before learners see
            them. Connect one provider or several.
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
              provider of the model in use when someone on your team asks AI to
              write for it. Learners&rsquo; data is never sent.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            icon={Power}
            label="Use AI"
            note={
              anyKey
                ? "Admins and instructors see the AI buttons in quizzes, Practice and the curriculum."
                : "Add a provider's API key below first."
            }
          >
            <SettingsToggle
              checked={settings.enabled}
              disabled={!anyKey && !settings.enabled}
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
        aria-labelledby="ai-providers-heading"
      >
        <header className="settings-section__heading mb-3">
          <Key size={20} weight="duotone" />
          <div>
            <h3 id="ai-providers-heading">Providers</h3>
            <p>
              Each provider bills you for what its models use. Add the key of
              every provider whose models you want to choose from.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          {settings.providers.map((provider) => (
            <ProviderRows
              key={provider.id}
              provider={provider}
              setNotice={setNotice}
            />
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="ai-models-heading">
        <header className="settings-section__heading mb-3">
          <Brain size={20} weight="duotone" />
          <div>
            <h3 id="ai-models-heading">Models</h3>
            <p>
              Which model writes, and how hard it thinks. Your team only sees
              the questions, never these choices.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Brain}
            label="For one lecture"
            note={
              model && !model.available
                ? modelNote(model)
                : "Writes or changes one lecture's quiz or coding question."
            }
          >
            <ThemedSelect
              triggerClassName={SETTINGS_SELECT_TRIGGER}
              id="platform-ai-model"
              ariaLabel="Model for one lecture"
              value={settings.model}
              options={options}
              onValueChange={(value) =>
                save(
                  { model: value },
                  `One-lecture AI now uses ${models.find((entry) => entry.id === value)?.label ?? value}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Stack}
            label="For a whole course"
            note={
              courseModel && !courseModel.available
                ? modelNote(courseModel)
                : "Writes questions for every lecture of a course at once."
            }
          >
            <ThemedSelect
              triggerClassName={SETTINGS_SELECT_TRIGGER}
              id="platform-ai-course-model"
              ariaLabel="Model for a whole course"
              value={settings.tierModels.balanced}
              options={options}
              onValueChange={(value) =>
                save(
                  { tierModels: { balanced: value } },
                  `Whole-course AI now uses ${models.find((entry) => entry.id === value)?.label ?? value}.`,
                )
              }
            />
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Gauge}
            label="Effort"
            note="How hard the model thinks before it answers. More effort is slower and costs more."
          >
            <ThemedSelect<AiEffortSetting>
              triggerClassName={SETTINGS_SELECT_TRIGGER}
              id="platform-ai-effort"
              ariaLabel="AI effort"
              value={settings.effort}
              options={EFFORT_OPTIONS}
              onValueChange={(value) =>
                save(
                  { effort: value },
                  value === "auto"
                    ? "Each AI feature picks its own effort."
                    : `AI now thinks with ${value} effort.`,
                )
              }
            />
          </SettingRow>
        </div>
        <AddedModels models={models} setNotice={setNotice} />
      </section>

      <section className="settings-section" aria-labelledby="ai-spend-heading">
        <header className="settings-section__heading mb-3">
          <Coins size={20} weight="duotone" />
          <div>
            <h3 id="ai-spend-heading">Spending</h3>
            <p>
              Estimated from each model&rsquo;s list price. Your
              providers&rsquo; bills are the exact amounts.
            </p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Coins}
            label="Monthly budget"
            note="All providers together. AI stops for everyone this month once it is spent. Empty: no limit."
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
        {usage.calls > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              title="By model"
              rows={usage.byModel.map((row) => ({
                key: `${row.provider}:${row.model}`,
                name:
                  models.find((entry) => row.model.startsWith(entry.id))
                    ?.label ?? row.model,
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

/**
 * One provider: its key (write-only), a test call, and for Claude the
 * workspace an organisation-level key must name.
 */
function ProviderRows({
  provider,
  setNotice,
}: {
  provider: AiProviderStatus;
  setNotice?: (message: string) => void;
}) {
  const meta = AI_PROVIDERS.find((entry) => entry.id === provider.id)!;
  const saveProvider = useSaveAiProvider();
  const test = useTestAiConnection();
  const [key, setKey] = useState("");
  const [workspace, setWorkspace] = useState("");
  const id = provider.id as AiProvider;

  const save = (
    payload: { apiKey?: string | null; workspaceId?: string | null },
    message: string,
  ) =>
    saveProvider.mutate(
      { provider: id, ...payload },
      {
        onSuccess: () => {
          test.reset();
          setNotice?.(message);
        },
        onError: (error) => setNotice?.(getApiError(error).message),
      },
    );

  const status = test.data
    ? test.data.ok
      ? `Connected to ${test.data.model} in ${(test.data.ms / 1000).toFixed(1)} s.`
      : test.data.message
    : provider.hasApiKey
      ? `Saved, ending in ${provider.apiKeyLast4 ?? "····"}. Paste a new one to replace it.`
      : provider.hasEnvironmentKey
        ? "Using the key set on the server. Paste one here to use another."
        : `Not connected. Key from ${meta.keyHelp}. Stored encrypted; never shown again.`;

  return (
    <>
      <SettingRow
        className={ROW_CLASS}
        icon={Key}
        label={`${meta.label} · ${meta.company}`}
        note={status}
      >
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!key.trim()) return;
            save({ apiKey: key.trim() }, `${meta.label} key saved.`);
            setKey("");
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label={`${meta.label} API key`}
            placeholder={
              provider.hasApiKey ? "Paste a new key" : meta.keyPlaceholder
            }
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className={FIELD}
          />
          <Button
            type="submit"
            variant="quiet"
            elevation="flat"
            disabled={key.trim().length < 20 || saveProvider.isPending}
          >
            Save key
          </Button>
          {provider.connected ? (
            <Button
              type="button"
              variant="quiet"
              elevation="flat"
              disabled={test.isPending}
              onClick={() => test.mutate({ provider: id })}
            >
              {test.isPending ? <LoadingSpinnerIcon size={16} /> : null}
              Test
            </Button>
          ) : null}
          {provider.hasApiKey ? (
            <Button
              type="button"
              variant="quiet"
              elevation="flat"
              disabled={saveProvider.isPending}
              onClick={() =>
                save({ apiKey: null }, `${meta.label} key removed.`)
              }
            >
              Remove
            </Button>
          ) : null}
        </form>
      </SettingRow>
      {meta.hasWorkspace && provider.connected ? (
        <SettingRow
          className={ROW_CLASS}
          icon={Buildings}
          label={`${meta.label} workspace ID`}
          note={
            provider.hasWorkspaceId
              ? `Saved: ${provider.workspaceIdHint ?? "••••"}. Needed only for a key made outside a workspace.`
              : provider.hasEnvironmentWorkspace
                ? "Using the workspace set on the server."
                : "Only for a key made at the organisation level: Console → Settings → Workspaces → its ID (wrkspc_…). Leave empty otherwise."
          }
        >
          <form
            className="flex w-full flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!workspace.trim()) return;
              save({ workspaceId: workspace.trim() }, "Workspace ID saved.");
              setWorkspace("");
            }}
          >
            <input
              autoComplete="off"
              spellCheck={false}
              aria-label={`${meta.label} workspace ID`}
              placeholder={
                provider.hasWorkspaceId ? "Paste a new ID" : "wrkspc_…"
              }
              value={workspace}
              onChange={(event) =>
                setWorkspace(event.target.value.replace(/[^A-Za-z0-9_-]/g, ""))
              }
              maxLength={100}
              className={FIELD}
            />
            <Button
              type="submit"
              variant="quiet"
              elevation="flat"
              disabled={!workspace.trim() || saveProvider.isPending}
            >
              Save
            </Button>
            {provider.hasWorkspaceId ? (
              <Button
                type="button"
                variant="quiet"
                elevation="flat"
                disabled={saveProvider.isPending}
                onClick={() =>
                  save({ workspaceId: null }, "Workspace ID removed.")
                }
              >
                Remove
              </Button>
            ) : null}
          </form>
        </SettingRow>
      ) : null}
    </>
  );
}

const PROVIDER_OPTIONS: readonly ThemedSelectOption<AiProvider>[] =
  AI_PROVIDERS.map((entry) => [entry.id, entry.label]);

const EMPTY_MODEL = {
  provider: "gemini" as AiProvider,
  id: "",
  label: "",
  input: "",
  output: "",
  cached: "",
  effort: true,
};

/**
 * Models an admin added: a newer model than the built-in list, or the same
 * id with a newer price. Each needs its provider's exact model id and list
 * price (per million tokens) from the provider's pricing page.
 */
function AddedModels({
  models,
  setNotice,
}: {
  models: AiModel[];
  setNotice?: (message: string) => void;
}) {
  const add = useAddAiModel();
  const remove = useRemoveAiModel();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_MODEL);
  const added = models.filter((model) => model.custom);
  const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const ready =
    draft.id.trim().length >= 2 &&
    draft.label.trim().length > 0 &&
    Number.isFinite(number(draft.input)) &&
    Number.isFinite(number(draft.output));
  const priceField = (
    key: "input" | "output" | "cached",
    label: string,
    placeholder: string,
  ) => (
    <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
      {label}
      <input
        inputMode="decimal"
        value={draft[key]}
        placeholder={placeholder}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            [key]: event.target.value.replace(/[^0-9.]/g, ""),
          }))
        }
        className={`${inputClass} w-full`}
      />
    </label>
  );

  return (
    <div className="mt-4 grid gap-3">
      {added.length ? (
        <ul className="grid gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-3 text-sm">
          {added.map((model) => (
            <li key={model.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-(--text)">
                  {model.label}
                </span>
                <span className="block truncate text-xs text-(--muted)">
                  {providerName(model.provider)} · {model.id} ·{" "}
                  {price(model.inputUsdPerMillion)} in /{" "}
                  {price(model.outputUsdPerMillion)} out
                </span>
              </span>
              <Button
                variant="quiet"
                elevation="flat"
                aria-label={`Remove ${model.label}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(model.id, {
                    onSuccess: () => setNotice?.(`${model.label} removed.`),
                    onError: (error) => setNotice?.(getApiError(error).message),
                  })
                }
              >
                <Trash size={16} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form
          className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            add.mutate(
              {
                provider: draft.provider,
                id: draft.id.trim(),
                label: draft.label.trim(),
                inputUsdPerMillion: number(draft.input),
                outputUsdPerMillion: number(draft.output),
                cacheReadUsdPerMillion: Number.isFinite(number(draft.cached))
                  ? number(draft.cached)
                  : 0,
                effort: draft.effort,
              },
              {
                onSuccess: () => {
                  setNotice?.(`${draft.label.trim()} added.`);
                  setDraft(EMPTY_MODEL);
                  setOpen(false);
                },
                onError: (error) => setNotice?.(getApiError(error).message),
              },
            );
          }}
        >
          <p className="text-xs text-(--muted)">
            Copy the exact model id and its price per million tokens from the
            provider&rsquo;s models and pricing pages. The same id as a built-in
            model replaces its price.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
              Provider
              <ThemedSelect<AiProvider>
                triggerClassName={SETTINGS_SELECT_TRIGGER}
                ariaLabel="Provider"
                value={draft.provider}
                options={PROVIDER_OPTIONS}
                onValueChange={(provider) =>
                  setDraft((current) => ({ ...current, provider }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
              Model id
              <input
                value={draft.id}
                spellCheck={false}
                autoComplete="off"
                maxLength={80}
                placeholder="e.g. gemini-3.5-flash-lite"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    id: event.target.value.replace(/[^A-Za-z0-9._:/-]/g, ""),
                  }))
                }
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-(--text-secondary) sm:col-span-2">
              Name shown to your team
              <input
                value={draft.label}
                maxLength={60}
                placeholder="e.g. Gemini 3.5 Flash-Lite"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                className={`${inputClass} w-full`}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {priceField("input", "Input $ / million", "0.30")}
            {priceField("output", "Output $ / million", "2.50")}
            {priceField("cached", "Cached input $", "0.03")}
          </div>
          <Checkbox
            checked={draft.effort}
            onCheckedChange={(effort) =>
              setDraft((current) => ({ ...current, effort }))
            }
            label="It has a thinking / effort setting"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!ready || add.isPending}>
              {add.isPending ? <LoadingSpinnerIcon size={15} /> : null}
              Add model
            </Button>
            <Button
              type="button"
              variant="quiet"
              elevation="flat"
              onClick={() => {
                setOpen(false);
                setDraft(EMPTY_MODEL);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            variant="quiet"
            elevation="flat"
            onClick={() => setOpen(true)}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
            Add a model
          </Button>
        </div>
      )}
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
