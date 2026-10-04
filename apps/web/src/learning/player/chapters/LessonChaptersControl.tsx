import { PopoverMenu, usePlayerTheme } from "@veolms/video-player";

import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";

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
        "relative inline-flex items-center justify-center leading-none font-semibold tracking-[0.01em]",
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

/** Touch trigger: chapters open in the same bottom sheet settings use. */
export function LessonChaptersSheetMenu({
  mobileSheetPanelClassName,
  mobileSheetPortalTarget,
  triggerClassName,
}: {
  mobileSheetPanelClassName?: string;
  mobileSheetPortalTarget?: HTMLElement | null;
  triggerClassName?: string;
}) {
  const ChaptersIcon = usePlayerTheme().icons.chapters;

  return (
    <PopoverMenu
      label="Chapters"
      mobilePresentation="sheet"
      mobileSheetPanelClassName={mobileSheetPanelClassName}
      mobileSheetPortalTarget={mobileSheetPortalTarget}
      panelClassName="!w-[min(22rem,calc(100vw-1.5rem))]"
      side="bottom"
      align="end"
      triggerClassName={cn("player-control !min-h-0 !w-auto !border-0 !py-0", triggerClassName)}
      trigger={<ChaptersIcon size={20} />}
    >
      <div className="flex flex-col gap-1">
        <LessonChapterRows tone="player" asMenuItems />
      </div>
    </PopoverMenu>
  );
}
