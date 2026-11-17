import { createUsePuck } from "@puckeditor/core";
import type { SitePageSummary } from "@veolms/contracts";
import { ArrowArcLeftIcon as ArrowArcLeft } from "@phosphor-icons/react/ArrowArcLeft";
import { ArrowArcRightIcon as ArrowArcRight } from "@phosphor-icons/react/ArrowArcRight";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";
import { createContext, useContext, type ReactNode } from "react";
import { Button } from "../components/Button";
import { pageStatusClass, pageStatusLabel } from "./websiteHelpers";

/** What the bar shows and does; provided by the editor around Puck. */
export interface WebsiteEditorBarState {
  title: string;
  slug: string;
  status: SitePageSummary["status"];
  saveLabel: string;
  previewMode: "light" | "dark";
  liveUrl: string | null;
  publishLabel: string;
  publishDisabled: boolean;
  /** A problem to show under the bar: unsaved fields, a conflict. */
  notice: ReactNode;
  onBack: () => void;
  onTogglePreviewMode: () => void;
  onOpenVersions: () => void;
  onPublish: () => void;
}

export const WebsiteEditorBarContext =
  createContext<WebsiteEditorBarState | null>(null);

const usePuck = createUsePuck();

const iconButtonClass =
  "inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={iconButtonClass}
    >
      {children}
    </button>
  );
}

/**
 * The editor's top bar, rendered as Puck's header so it can reach Puck's
 * undo history. A stable component: its state comes from context.
 */
export function WebsiteEditorBar() {
  const bar = useContext(WebsiteEditorBarContext);
  const history = usePuck((state) => state.history);
  if (!bar) return <></>;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) px-2 py-2 sm:px-4">
      <IconButton label="Back to Website" onClick={bar.onBack}>
        <ArrowLeft size={18} />
      </IconButton>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="m-0 truncate text-sm font-bold text-(--text) sm:text-base">
            {bar.title}
          </h1>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${pageStatusClass(bar.status)}`}
          >
            {pageStatusLabel(bar.status)}
          </span>
        </div>
        <p
          className="m-0 truncate text-xs text-(--muted)"
          role="status"
          aria-live="polite"
        >
          /{bar.slug} · {bar.saveLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
        <IconButton
          label="Undo"
          onClick={history.back}
          disabled={!history.hasPast}
        >
          <ArrowArcLeft size={18} />
        </IconButton>
        <IconButton
          label="Redo"
          onClick={history.forward}
          disabled={!history.hasFuture}
        >
          <ArrowArcRight size={18} />
        </IconButton>
        <IconButton
          label={
            bar.previewMode === "light"
              ? "Preview in dark mode"
              : "Preview in light mode"
          }
          onClick={bar.onTogglePreviewMode}
        >
          {bar.previewMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </IconButton>
        <IconButton
          label="Page details and versions"
          onClick={bar.onOpenVersions}
        >
          <ClockCounterClockwise size={18} />
        </IconButton>
        {bar.liveUrl ? (
          <a
            href={bar.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View the live page"
            title="View the live page"
            className={iconButtonClass}
          >
            <ArrowSquareOut size={18} />
          </a>
        ) : null}
        <Button onClick={bar.onPublish} disabled={bar.publishDisabled}>
          {bar.publishLabel}
        </Button>
      </div>
      {bar.notice ? (
        <div
          role="alert"
          className="basis-full rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-sm text-rose-600 dark:text-rose-400"
        >
          {bar.notice}
        </div>
      ) : null}
    </div>
  );
}
