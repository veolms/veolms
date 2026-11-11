import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { ShortLink, ShortLinkMode } from "@veolms/contracts";
import { useState, type FormEvent } from "react";

import { Button } from "../../components/Button";
import { useDebounce } from "../../hooks/useDebounce";
import { getApiError } from "../../lib/api-error";
import {
  useCreateShortLink,
  useShortLinkPathCheck,
  useUpdateShortLink,
} from "../../services/links";
import { ThemedSelect } from "../../ThemedSelect";
import { linkCardClass, linkInputClass, siteOrigin } from "./linkStyles";

const MODE_NOTES: Record<ShortLinkMode, string> = {
  redirect: "Visitors are sent to the destination.",
  rewrite:
    "The destination's page is shown at this address. Works for plain pages (docs, syllabus pages); pages that sign in or are web apps need a redirect.",
};

const STATUS_OPTIONS = [
  ["302", "302 · Temporary"],
  ["301", "301 · Permanent"],
] as const;

/**
 * Creates a link, or edits one (`link`). The path is checked as it is typed:
 * a page of the app, a reserved address, a profile or another link is
 * refused, with a free path to use instead.
 */
export function LinkForm({
  link,
  onDone,
}: {
  link?: ShortLink;
  onDone?: () => void;
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
  const host = siteOrigin().replace(/^https?:\/\//u, "");

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
      if (link) await update.mutateAsync({ id: link.id, body });
      else await create.mutateAsync(body);
      if (!link) {
        setPath("");
        setDestination("");
      }
      onDone?.();
    } catch (caught) {
      setError(getApiError(caught).message);
    }
  };

  const fieldLabel =
    "mb-1.5 block text-xs font-semibold text-(--text-secondary)";

  return (
    <form
      onSubmit={submit}
      className={`${linkCardClass} flex flex-col gap-4 p-4 sm:p-5`}
      aria-label={link ? `Edit ${link.path}` : "New link"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor={`link-path-${link?.id ?? "new"}`}
            className={fieldLabel}
          >
            Short address
          </label>
          <div className="flex items-stretch">
            <span className="flex items-center rounded-l-[10px] border border-r-0 border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface-strong) px-2.5 text-sm text-(--muted)">
              {host}/
            </span>
            <input
              id={`link-path-${link?.id ?? "new"}`}
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
              aria-describedby={`link-path-note-${link?.id ?? "new"}`}
            />
          </div>
          <p
            id={`link-path-note-${link?.id ?? "new"}`}
            className="mt-1.5 min-h-5 text-xs text-(--muted)"
            aria-live="polite"
          >
            {pathIsEmpty ? (
              "Leave empty to use the suggested short path."
            ) : result && debouncedPath === path.trim() ? (
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
            htmlFor={`link-destination-${link?.id ?? "new"}`}
            className={fieldLabel}
          >
            Destination
          </label>
          <input
            id={`link-destination-${link?.id ?? "new"}`}
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
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={fieldLabel}>When someone opens it</legend>
        <div className="flex flex-wrap gap-2">
          {(["redirect", "rewrite"] as const).map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-semibold transition-colors ${
                mode === option
                  ? "border-(--accent) bg-(--accent)/10 text-(--text)"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--text-secondary) hover:bg-(--hover)"
              }`}
            >
              <input
                type="radio"
                name={`link-mode-${link?.id ?? "new"}`}
                value={option}
                checked={mode === option}
                onChange={() => setMode(option)}
                className="accent-(--accent)"
              />
              {option === "redirect" ? "Redirect" : "Show at this address"}
            </label>
          ))}
          {mode === "redirect" && (
            <div className="w-48 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-1">
              <ThemedSelect
                value={status}
                onValueChange={(value) => setStatus(value)}
                options={STATUS_OPTIONS}
                ariaLabel="Redirect type"
              />
            </div>
          )}
        </div>
        <p className="text-xs text-(--muted)">
          {MODE_NOTES[mode]}
          {mode === "redirect" &&
            status === "301" &&
            " Browsers remember a 301 for good: a later edit or pause will not reach people who already opened it."}
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-semibold text-rose-500">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onDone && link && (
          <Button
            variant="quiet"
            className="h-10 rounded-[10px] px-4 text-sm font-semibold"
            onClick={onDone}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={
            saving ||
            (!pathIsEmpty &&
              result?.available === false &&
              debouncedPath === path.trim())
          }
          className="h-10 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Saving…" : link ? "Save link" : "Create link"}
        </Button>
      </div>
    </form>
  );
}
