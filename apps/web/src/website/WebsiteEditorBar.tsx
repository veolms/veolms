import type { SitePageSummary } from "@veolms/contracts";
import { ArrowArcLeftIcon as ArrowArcLeft } from "@phosphor-icons/react/ArrowArcLeft";
import { ArrowArcRightIcon as ArrowArcRight } from "@phosphor-icons/react/ArrowArcRight";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { DesktopIcon as Desktop } from "@phosphor-icons/react/Desktop";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { DeviceTabletIcon as DeviceTablet } from "@phosphor-icons/react/DeviceTablet";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";
import type { ReactNode } from "react";
import { Button } from "../components/Button";
import { cn } from "../lib/utils";
import type { EditorDevice } from "./editor/EditorCanvas";
import { pageStatusClass, pageStatusLabel } from "./websiteHelpers";

/** What the bar shows and does. */
export interface WebsiteEditorBarState {
  title: string;
  slug: string;
  status: SitePageSummary["status"];
  saveLabel: string;
  previewMode: "light" | "dark";
  device: EditorDevice;
  canUndo: boolean;
  canRedo: boolean;
  liveUrl: string | null;
  publishLabel: string;
  publishDisabled: boolean;
  /** A problem to show under the bar: unsaved fields, a conflict. */
  notice: ReactNode;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDevice: (device: EditorDevice) => void;
  onTogglePreviewMode: () => void;
  onOpenVersions: () => void;
  onPublish: () => void;
}

const iconButtonClass =
  "inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        iconButtonClass,
        pressed &&
          "bg-(--accent)/12 text-(--accent) hover:bg-(--accent)/16 hover:text-(--accent)",
      )}
    >
      {children}
    </button>
  );
}

const DEVICES: ReadonlyArray<{
  device: EditorDevice;
  label: string;
  Icon: typeof Desktop;
}> = [
  { device: "phone", label: "Phone", Icon: DeviceMobile },
  { device: "tablet", label: "Tablet", Icon: DeviceTablet },
  { device: "desktop", label: "Computer", Icon: Desktop },
];

/** The editor's top bar: the page, its save state, the preview controls and Publish. */
export function WebsiteEditorBar({ bar }: { bar: WebsiteEditorBarState }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) px-2 py-2 sm:px-3">
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
      <div
        role="group"
        aria-label="Preview size"
        className="hidden items-center gap-0.5 rounded-[10px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] p-0.5 md:flex"
      >
        {DEVICES.map(({ device, label, Icon }) => (
          <IconButton
            key={device}
            label={label}
            pressed={bar.device === device}
            onClick={() => bar.onDevice(device)}
          >
            <Icon size={17} />
          </IconButton>
        ))}
      </div>
      <div className="flex items-center justify-end gap-0.5 sm:gap-1">
        <IconButton
          label="Undo (Ctrl+Z)"
          onClick={bar.onUndo}
          disabled={!bar.canUndo}
        >
          <ArrowArcLeft size={18} />
        </IconButton>
        <IconButton
          label="Redo (Ctrl+Shift+Z)"
          onClick={bar.onRedo}
          disabled={!bar.canRedo}
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
        <Button
          onClick={bar.onPublish}
          disabled={bar.publishDisabled}
          className="ml-1"
        >
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
