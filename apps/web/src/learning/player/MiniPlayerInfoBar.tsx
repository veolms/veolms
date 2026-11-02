import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import type { RefObject } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { CurriculumSectionActionsMenuContent } from "../CurriculumSectionActionsMenu";

// The mini window's video carries the window's 12px corners itself. Safari
// on iPhone draws a video apart from the page, and the window's rounded
// `overflow` did not cut it (nor the black plane around it): the corners
// came out square. So the video's shell is clipped to the rounded shape
// (`MINI_PLAYER_VIDEO_SHELL_CLASS`, on the shell; the window's shadow stays
// outside it), and the shell, the player and the video are rounded as well
// (`MINI_PLAYER_VIDEO_CORNERS_CLASS`). The bottom corners meet the bar below
// where it is shown (641px and up); on a phone the video is the whole window.
export const MINI_PLAYER_VIDEO_CORNERS_CLASS =
  "!rounded-t-[12px] !rounded-b-none max-[641px]:!rounded-b-[12px]";
export const MINI_PLAYER_VIDEO_SHELL_CLASS = `${MINI_PLAYER_VIDEO_CORNERS_CLASS} [clip-path:inset(0_round_12px_12px_0_0)] max-[641px]:[clip-path:inset(0_round_12px)]`;

export interface MiniPlayerInfoBarProps {
  lessonTitle: string;
  courseTitle?: string;
  lessonIndex?: number;
  totalLessons?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onRestore?: () => void;
  sectionIds?: readonly number[];
  expandedSectionIds?: readonly number[];
  onExpandAllSections?: () => void;
  onCollapseAllSections?: () => void;
  contextMenuPortalHostRef?: RefObject<HTMLElement | null>;
}

export function MiniPlayerInfoBar({
  lessonTitle,
  courseTitle,
  lessonIndex,
  totalLessons,
  expanded = false,
  onToggleExpand,
  onRestore,
  sectionIds = [],
  expandedSectionIds = [],
  onExpandAllSections,
  onCollapseAllSections,
  contextMenuPortalHostRef,
}: MiniPlayerInfoBarProps) {
  const subtitleParts = [
    courseTitle,
    lessonIndex !== undefined && totalLessons
      ? `${lessonIndex} / ${totalLessons}`
      : undefined,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" • ");

  const handleAction = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else if (onRestore) {
      onRestore();
    }
  };

  const hasSectionActionsMenu =
    sectionIds.length > 0 && onExpandAllSections && onCollapseAllSections;

  const infoBar = (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        expanded ? "Collapse curriculum menu" : "Expand curriculum menu"
      }
      aria-expanded={expanded}
      onClick={handleAction}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleAction();
        }
      }}
      className="group/info hidden min-[641px]:flex h-[52px] w-full shrink-0 items-center justify-between px-3.5 py-1.5 border-t select-none cursor-pointer group-data-[mini-player-mode=dragging]/mini-player-shell:cursor-grabbing transition-colors"
      data-learning-mini-player-expand-trigger=""
      data-learning-mini-player-info-bar=""
    >
      <div className="flex-1 min-w-0 pr-2 text-left">
        <p
          className="truncate text-sm font-semibold text-white leading-tight"
          title={lessonTitle}
        >
          {lessonTitle}
        </p>
        {subtitle ? (
          <p
            className="truncate text-[13px] leading-tight mt-0.5"
            title={subtitle}
            data-learning-mini-player-info-subtitle=""
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {expanded ? (
        <CaretUp
          size={18}
          weight="bold"
          className="shrink-0"
          data-learning-mini-player-info-caret=""
        />
      ) : (
        <CaretDown
          size={18}
          weight="bold"
          className="shrink-0"
          data-learning-mini-player-info-caret=""
        />
      )}
    </div>
  );

  if (!hasSectionActionsMenu) {
    return infoBar;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={infoBar} />
      <CurriculumSectionActionsMenuContent
        sectionIds={sectionIds}
        expandedSectionIds={expandedSectionIds}
        onExpandAllSections={onExpandAllSections}
        onCollapseAllSections={onCollapseAllSections}
        portalContainer={contextMenuPortalHostRef}
        ariaLabel="Mini player curriculum actions"
      />
    </ContextMenu>
  );
}
