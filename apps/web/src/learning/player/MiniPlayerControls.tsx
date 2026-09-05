import {
  PlayButton,
  PlayerIconButton,
  Timeline,
  TimeDisplay,
  usePlayerController,
  usePlayerState,
  usePlayerTheme,
} from "@veolms/video-player";
import { Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";
import {
  LEARNING_PLAYER_EXPAND_LABEL,
  LEARNING_PLAYER_EXPAND_TITLE,
  LEARNING_PLAYER_MINIMIZE_SHORTCUT,
} from "./learningPlayerShortcuts";
import { AppIcon } from "../../icons/AppIcon";
import { cn } from "../../lib/utils";

export interface MiniPlayerControlsProps {
  lessonTitle: string;
  courseTitle?: string;
  lessonIndex?: number;
  totalLessons?: number;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  onGoNext?: () => void;
  onGoPrevious?: () => void;
  onClose: () => void;
  onRestore: () => void;
}

export function MiniPlayerControls({
  lessonTitle,
  courseTitle: _courseTitle,
  lessonIndex: _lessonIndex,
  totalLessons: _totalLessons,
  canGoNext = false,
  canGoPrevious = false,
  onGoNext,
  onGoPrevious,
  onClose,
  onRestore,
}: MiniPlayerControlsProps) {
  const controller = usePlayerController();
  const theme = usePlayerTheme();
  const CloseIcon = theme.icons.close;
  const ready = usePlayerState(({ media }) => media.lifecycle === "ready");
  const paused = usePlayerState(
    ({ media }) => media.paused || media.ended,
  );

  return (
    <div
      className="group/mini-player absolute inset-0 z-30"
      data-learning-mini-player-controls-ready={ready ? "true" : "false"}
    >
      {/* Mobile Controls (<= 640px) */}
      <div className="min-[641px]:hidden absolute inset-0">
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
          aria-label={LEARNING_PLAYER_EXPAND_LABEL}
          title={LEARNING_PLAYER_EXPAND_TITLE}
          aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
          data-learning-mini-player-restore=""
          onClick={onRestore}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/34 via-transparent to-black/30",
            ready ? "visible opacity-100" : "invisible opacity-0",
          )}
          aria-hidden={ready ? undefined : true}
        />
        <div
          className={cn(
            "absolute left-1 top-1 z-30",
            ready ? undefined : "pointer-events-none invisible",
          )}
          inert={ready ? undefined : true}
          aria-hidden={ready ? undefined : true}
        >
          <PlayButton
            className="!size-9 !rounded-full !bg-black/62 shadow-lg backdrop-blur-md"
            iconSize={20}
          />
        </div>
        <div
          className={cn(
            "absolute right-1 top-1 z-30",
            ready ? undefined : "pointer-events-none invisible",
          )}
          inert={ready ? undefined : true}
          aria-hidden={ready ? undefined : true}
        >
          <PlayerIconButton
            label="Close mini player"
            className="!size-9 !rounded-full !bg-black/54 backdrop-blur-md"
            icon={<CloseIcon size={20} />}
            onClick={onClose}
          />
        </div>
      </div>

      {/* Desktop Controls (> 640px) — hidden until the mini player is hovered */}
      <div
        className={cn(
          "absolute inset-0 hidden min-[641px]:block",
          "pointer-events-none opacity-0 transition-opacity duration-200",
          "group-hover/mini-player:pointer-events-auto group-hover/mini-player:opacity-100",
          "group-focus-within/mini-player:pointer-events-auto group-focus-within/mini-player:opacity-100",
        )}
        data-learning-mini-player-controls-overlay=""
      >
        {/* Subtle dark backdrop for readability of controls over bright scenes */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-black/60" />

        {/* Empty video backdrop click to toggle playback */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 cursor-pointer focus:outline-none"
          onClick={() => void controller.togglePlayback()}
        />

        {/* Center Controls: Previous, Play/Pause, Next */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-6"
          data-learning-mini-player-gesture-ignore=""
        >
          <button
            type="button"
            aria-label="Previous lesson"
            disabled={!canGoPrevious}
            onClick={(event) => {
              event.stopPropagation();
              onGoPrevious?.();
            }}
            className={cn(
              "pointer-events-auto flex size-10 items-center justify-center rounded-full text-white transition-colors",
              canGoPrevious
                ? "cursor-pointer hover:bg-white/15"
                : "opacity-35 cursor-not-allowed",
            )}
          >
            <SkipBack size={24} weight="fill" />
          </button>

          <button
            type="button"
            aria-label={paused ? "Play lesson" : "Pause lesson"}
            onClick={(event) => {
              event.stopPropagation();
              void controller.togglePlayback();
            }}
            className="pointer-events-auto flex size-14 items-center justify-center rounded-full text-white cursor-pointer transition-colors hover:bg-white/15 drop-shadow-md"
          >
            {paused ? (
              <Play size={38} weight="fill" className="-translate-x-px" />
            ) : (
              <Pause size={38} weight="fill" />
            )}
          </button>

          <button
            type="button"
            aria-label="Next lesson"
            disabled={!canGoNext}
            onClick={(event) => {
              event.stopPropagation();
              onGoNext?.();
            }}
            className={cn(
              "pointer-events-auto flex size-10 items-center justify-center rounded-full text-white transition-colors",
              canGoNext
                ? "cursor-pointer hover:bg-white/15"
                : "opacity-35 cursor-not-allowed",
            )}
          >
            <SkipForward size={24} weight="fill" />
          </button>
        </div>

        {/* Top Controls Bar — later in DOM and higher z-index so hover chips sit on playback buttons */}
        <div
          className="pointer-events-none absolute inset-x-2 top-2 z-50 flex items-center justify-between"
          data-learning-mini-player-gesture-ignore=""
        >
          <div className="relative z-50 group/expand pointer-events-auto">
            <PlayerIconButton
              label="Expand [I]"
              title=""
              aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
              data-learning-mini-player-restore=""
              className="!size-9 !rounded-none !bg-transparent hover:!bg-transparent text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
              icon={
                <AppIcon name="miniPlayerExpand" className="size-5" />
              }
              onClick={(event) => {
                event.stopPropagation();
                onRestore();
              }}
            />
            <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden group-hover/expand:flex items-center gap-1.5 px-2 py-1 rounded bg-black/90 text-xs text-white shadow-lg whitespace-nowrap font-medium">
              <span>Expand</span>
              <kbd className="px-1 py-0.2 rounded bg-white/20 text-[10px] font-semibold">I</kbd>
            </div>
          </div>

          <div className="relative z-50 group/close pointer-events-auto">
            <PlayerIconButton
              label="Close"
              title=""
              className="!size-9 !rounded-none !bg-transparent hover:!bg-transparent text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
              icon={<CloseIcon size={20} />}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            />
            <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden group-hover/close:flex items-center gap-1.5 px-2 py-1 rounded bg-black/90 text-xs text-white shadow-lg whitespace-nowrap font-medium">
              <span>Close</span>
              <kbd className="px-1 py-0.2 rounded bg-white/20 text-[10px] font-semibold">Esc</kbd>
            </div>
          </div>
        </div>

        {/* Bottom-left Time Display — hidden while the timeline tooltip is showing */}
        <div
          className={cn(
            "absolute left-3 bottom-3 z-20 pointer-events-none transition-opacity duration-150",
            "group-has-[[data-learning-mini-player-timeline]:hover]/mini-player:opacity-0",
            "group-has-[[data-learning-mini-player-timeline]:focus-within]/mini-player:opacity-0",
            "group-has-[[data-learning-mini-player-timeline]_[data-scrubbing=true]]/mini-player:opacity-0",
          )}
          data-learning-mini-player-fixed-time=""
        >
          <TimeDisplay
            interactive={false}
            className="!text-xs !font-medium !text-white !drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] tabular-nums px-0"
          />
        </div>
      </div>

      {/* Desktop Timeline */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden min-[641px]:block"
        data-learning-mini-player-gesture-ignore=""
        data-learning-mini-player-timeline=""
      >
        <Timeline
          ariaLabel="Mini player timeline"
          showPreview={true}
          className="pointer-events-none [&_[role=slider]]:pointer-events-auto [&_[data-timeline-buffered-range]]:rounded-none [&_[data-timeline-progress]]:rounded-none [&_[data-timeline-track]]:bottom-0 [&_[data-timeline-track]]:top-auto [&_[data-timeline-track]]:h-0.5 [&_[data-timeline-track]]:translate-y-0 [&_[data-timeline-track]]:rounded-none [&_[data-timeline-thumb]]:!hidden"
        />
      </div>
    </div>
  );
}
