import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { useState } from "react";
import {
  ChapterCountBadge,
  ChapterNowLabel,
  PopoverMenu,
  usePlayerTheme,
  type PlayerThemeDefinition,
} from "@veolms/video-player";
import { cn } from "../../../lib/utils";
import { LessonChapterRows } from "./LessonChapterRows";

/** Desktop trigger for the sliding chapters panel. */
export function LessonChaptersToggleButton({
  className,
  compact = false,
  onToggle,
  open,
  panelId,
}: {
  className?: string;
  /** Icon only, for a row with no room for the word and its arrow. */
  compact?: boolean;
  onToggle: () => void;
  open: boolean;
  panelId: string;
}) {
  const { chrome, icons } = usePlayerTheme();
  const ChaptersIcon = icons.chapters;
  // Themes with a chapter label say which chapter is playing here, in their
  // words ("> CH_07 MODULES 07/09"), instead of the word Chapters.
  const showsChapterNow = Boolean(chrome?.chapterLabel);

  return (
    <button
      type="button"
      aria-label={open ? "Close chapters" : "Open chapters"}
      aria-expanded={open}
      aria-controls={panelId}
      data-player-control=""
      data-player-control-hit-area="chapters"
      data-compact={compact ? "true" : undefined}
      title={compact ? "Chapters" : undefined}
      className={cn(
        "relative inline-flex items-center justify-center font-semibold leading-none tracking-[0.01em]",
        className,
        compact && "w-9.5 px-0",
      )}
      onClick={onToggle}
    >
      <span className="relative z-10 inline-flex items-center gap-2 leading-none">
        <ChaptersIcon size={17} active={open} />
        {compact ? null : (
          <>
            {showsChapterNow ? (
              <ChapterNowLabel className="max-w-72" />
            ) : (
              <>
                <span>Chapters</span>
                <ChapterCountBadge />
              </>
            )}
            <CaretRight size={14} aria-hidden="true" />
          </>
        )}
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
  sheetTheme,
  triggerClassName,
}: {
  getSheetHeight?: () => number | null;
  mobileSheetPanelClassName?: string;
  mobileSheetPortalTarget?: HTMLElement | null;
  /** The sheet in another theme than the key that opens it. */
  sheetTheme?: PlayerThemeDefinition;
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
      panelTheme={sheetTheme}
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
