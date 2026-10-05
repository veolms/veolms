import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { useState } from "react";
import { PopoverMenu, usePlayerTheme } from "@veolms/video-player";
import { cn } from "../../../lib/utils";
import { LessonChapterRows } from "./LessonChapterRows";

/** Desktop trigger for the sliding chapters panel. */
export function LessonChaptersToggleButton({
  className,
  onToggle,
  open,
  panelId,
}: {
  className?: string;
  onToggle: () => void;
  open: boolean;
  panelId: string;
}) {
  const ChaptersIcon = usePlayerTheme().icons.chapters;

  return (
    <button
      type="button"
      aria-label={open ? "Close chapters" : "Open chapters"}
      aria-expanded={open}
      aria-controls={panelId}
      data-player-control=""
      data-player-control-hit-area="chapters"
      className={cn(
        "relative inline-flex items-center justify-center font-semibold leading-none tracking-[0.01em]",
        className,
      )}
      onClick={onToggle}
    >
      <span className="relative z-10 inline-flex items-center gap-2 leading-none">
        <ChaptersIcon size={17} active={open} />
        <span>Chapters</span>
        <CaretRight
          size={14}
          aria-hidden="true"
          className={cn(
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Touch trigger: chapters open in a bottom sheet. Like the course content
 * drawer, the sheet runs edge to edge and its top lands just above the
 * bottom of the video; `getSheetHeight` measures that height when the sheet
 * opens (fullscreen passes none and keeps the sheet's own size).
 */
export function LessonChaptersSheetMenu({
  getSheetHeight,
  mobileSheetPanelClassName,
  mobileSheetPortalTarget,
  triggerClassName,
}: {
  getSheetHeight?: () => number | null;
  mobileSheetPanelClassName?: string;
  mobileSheetPortalTarget?: HTMLElement | null;
  triggerClassName?: string;
}) {
  const ChaptersIcon = usePlayerTheme().icons.chapters;
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  return (
    <PopoverMenu
      label="Chapters"
      mobilePresentation="sheet"
      mobileSheetPanelClassName={mobileSheetPanelClassName}
      mobileSheetPortalTarget={mobileSheetPortalTarget}
      mobileSheetExpandable={sheetHeight !== null}
      mobileSheetStyle={
        sheetHeight !== null
          ? { height: sheetHeight, maxHeight: "calc(100dvh - 12px)" }
          : undefined
      }
      side="bottom"
      align="end"
      triggerClassName={cn(
        "player-control !w-auto !min-h-0 !border-0 !py-0",
        triggerClassName,
      )}
      trigger={<ChaptersIcon size={20} />}
      onOpenChange={(open) => {
        if (open) setSheetHeight(getSheetHeight?.() ?? null);
      }}
    >
      <div className="flex flex-col gap-1">
        <LessonChapterRows tone="player" asMenuItems />
      </div>
    </PopoverMenu>
  );
}
