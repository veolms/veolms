import { formatMediaTime } from "../../accessibility/formatMediaTime";
import { usePlayerController } from "../../react/context";
import { useChapters } from "../../react/usePlayerState";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";
import { MenuTriggerContent } from "./MenuTriggerContent";
import { PlayerMenuItem } from "./PlayerMenuItem";
import { PopoverMenu } from "./PopoverMenu";
import type { PlayerMenuCommonProps } from "./menuTypes";

export interface ChaptersMenuProps extends PlayerMenuCommonProps {
  onChapterSelect?: (chapterId: string, startTime: number) => void;
}

export function ChaptersMenu({
  align,
  className,
  defaultOpen,
  disabled,
  onChapterSelect,
  onOpenChange,
  open,
  panelClassName,
  side,
  trigger,
  triggerClassName,
}: ChaptersMenuProps) {
  const controller = usePlayerController();
  const ChaptersIcon = usePlayerTheme().icons.chapters;
  const { activeChapterId, chapters } = useChapters();
  const activeChapter = chapters.find(
    (chapter) => chapter.id === activeChapterId,
  );
  const currentLabel = activeChapter?.title ?? "Chapters";

  return (
    <PopoverMenu
      label={`Chapters, ${currentLabel}`}
      menuLabel="Chapters"
      trigger={
        trigger ?? (
          <MenuTriggerContent
            icon={<ChaptersIcon className="size-4" />}
            value={currentLabel}
          />
        )
      }
      className={className}
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
      side={side}
      align={align}
      disabled={disabled || chapters.length === 0}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {chapters.map((chapter) => (
        <PlayerMenuItem
          key={chapter.id}
          label={chapter.title}
          trailing={formatMediaTime(chapter.startTime)}
          selected={chapter.id === activeChapterId}
          onClick={() => {
            controller.seekTo(chapter.startTime);
            onChapterSelect?.(chapter.id, chapter.startTime);
          }}
        />
      ))}
    </PopoverMenu>
  );
}
