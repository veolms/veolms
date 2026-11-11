import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { ShortLink, ShortLinkMode } from "@veolms/contracts";
import { useState, type ComponentType, type FormEvent } from "react";

import { Button } from "../../components/Button";
import {
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../../components/FilterBar";
import { useDebounce } from "../../hooks/useDebounce";
import { getApiError } from "../../lib/api-error";
import {
  useCreateShortLink,
  useShortLinkPathCheck,
  useUpdateShortLink,
} from "../../services/links";
import { ThemedSelect } from "../../ThemedSelect";
import { linkInputClass, siteHost } from "./linkStyles";

const MODES: readonly {
  value: ShortLinkMode;
  label: string;
  note: string;
  Icon: ComponentType<{ size?: number; weight?: "duotone" }>;
}[] = [
  {
    value: "redirect",
    label: "Redirect",
    note: "Visitors are sent on to the destination.",
    Icon: ArrowSquareOut,
  },
  {
    value: "rewrite",
    label: "Show at this address",
    note: "The destination's page is shown here, the address stays ours. For plain pages (syllabus, docs); pages that sign in or web apps need a redirect.",
    Icon: Eye,
  },
];

const STATUS_OPTIONS = [
  ["302", "302 · Temporary (recommended)"],
  ["301", "301 · Permanent"],
] as const;

const fieldLabel = "mb-1.5 block text-xs font-semibold text-(--text-secondary)";

/**
 * Creates a link, or edits one (`link`), inside the Links drawer. The path
 * is checked as it is typed: a page of the app, a reserved address, a
 * profile or another link is refused, with a free path to use instead.
 */
export function LinkForm({
  link,
  onCancel,
  onSaved,
}: {
  link?: ShortLink;
  onCancel: () => void;
  onSaved: (link: ShortLink) => void;
}) {
  const [path, setPath] = useState(link?.path.slice(1) ?? "");
  const [destination, setDestination] = useState(link?.destination ?? "");
  const [mode, setMode] = useState<ShortLinkMode>(link?.mode ?? "redirect");
  const [status, setStatus] = useState<"301" | "302">(
    link?.redirectStatus === 301 ? "301" : "302",
  );
  const [error, setError] = useState<string | null>(null);
  const create = useCreateShortLink();
  const update = useUpdateShortLink();
  const saving = create.isPending || update.isPending;

  const debouncedPath = useDebounce(path.trim(), 300);
  const check = useShortLinkPathCheck(debouncedPath, { linkId: link?.id });
  const result = check.data;
  const pathIsEmpty = path.trim() === "";
  const checkIsCurrent = Boolean(result) && debouncedPath === path.trim();
  const pathRefused =
    !pathIsEmpty && checkIsCurrent && result?.available === false;
  const idSuffix = link?.id ?? "new";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const body = {
      path: pathIsEmpty ? (result?.suggestion ?? "") : path,
      destination,
      mode,
      redirectStatus: status === "301" ? (301 as const) : (302 as const),
    };
    try {
      const saved = link
        ? await update.mutateAsync({ id: link.id, body })
        : await create.mutateAsync(body);
      onSaved(saved);
    } catch (caught) {
      setError(getApiError(caught).message);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col"
      aria-label={link ? `Edit ${link.path}` : "New link"}
    >
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
        <div>
          <label htmlFor={`link-path-${idSuffix}`} className={fieldLabel}>
            Short address
          </label>
          <div className="flex items-stretch">
            <span className="flex items-center rounded-l-[10px] border border-r-0 border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface-strong) px-2.5 text-sm text-(--muted)">
              {siteHost()}/
            </span>
            <input
              id={`link-path-${idSuffix}`}
              className={`${linkInputClass} rounded-l-none`}
              value={path}
              onChange={(event) =>
                setPath(event.target.value.replace(/^\/+/u, ""))
              }
              placeholder={
                pathIsEmpty && result?.suggestion
                  ? `${result.suggestion.slice(1)} (suggested)`
                  : "nodejs"
              }
              autoComplete="off"
              spellCheck={false}
              aria-invalid={pathRefused}
              aria-describedby={`link-path-note-${idSuffix}`}
            />
          </div>
          <p
            id={`link-path-note-${idSuffix}`}
            className="mt-1.5 min-h-5 text-xs text-(--muted)"
            aria-live="polite"
          >
            {pathIsEmpty ? (
              "Leave empty to use the suggested short path. Capitals don't matter."
            ) : checkIsCurrent && result ? (
              result.available ? (
                <span className="inline-flex items-center gap-1 text-(--success)">
                  <CheckCircle size={14} weight="fill" aria-hidden />
                  {result.path} is free
                </span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1 text-rose-500">
                  <WarningCircle size={14} weight="fill" aria-hidden />
                  {result.reason}
                  {result.suggestion && (
                    <button
                      type="button"
                      className="font-semibold text-(--accent) underline-offset-2 hover:underline"
                      onClick={() => setPath(result.suggestion!.slice(1))}
                    >
                      Use {result.suggestion}
                    </button>
                  )}
                </span>
              )
            ) : (
              "Checking…"
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor={`link-destination-${idSuffix}`}
            className={fieldLabel}
          >
            Destination
          </label>
          <input
            id={`link-destination-${idSuffix}`}
            className={linkInputClass}
            type="url"
            inputMode="url"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="https://example.com/page"
            required
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1.5 text-xs text-(--muted)">
            An https address on another site.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={fieldLabel}>When someone opens it</legend>
          {MODES.map(({ value, label, note, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                mode === value
                  ? "border-(--accent) bg-(--accent)/8"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:bg-(--hover)"
              }`}
            >
              <input
                type="radio"
                name={`link-mode-${idSuffix}`}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                aria-label={label}
                aria-describedby={`link-mode-note-${value}-${idSuffix}`}
                className="mt-1 accent-(--accent)"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-(--text)">
                  <Icon size={16} weight="duotone" />
                  {label}
                </span>
                <span
                  id={`link-mode-note-${value}-${idSuffix}`}
                  className="mt-0.5 block text-xs text-(--muted)"
                >
                  {note}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === "redirect" && (
          <div>
            <span className={fieldLabel} id={`link-status-${idSuffix}`}>
              Redirect type
            </span>
            <div className={filterControlClasses}>
              <ThemedSelect
                value={status}
                onValueChange={(value) => setStatus(value)}
                options={STATUS_OPTIONS}
                ariaLabel="Redirect type"
                triggerClassName={`${filterSelectTriggerClasses} w-full`}
              />
            </div>
            {status === "301" && (
              <p className="mt-1.5 text-xs text-amber-500">
                Browsers remember a 301 for good: a later edit or pause will not
                reach people who already opened it.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-rose-500">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-4 sm:px-6">
        <Button
          variant="quiet"
          className="h-10 rounded-[10px] px-4 text-sm font-semibold"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving || pathRefused}
          className="h-10 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Saving…" : link ? "Save changes" : "Create link"}
        </Button>
      </div>
    </form>
  );
}
