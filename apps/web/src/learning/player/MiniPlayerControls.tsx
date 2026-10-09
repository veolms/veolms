import { useEffect, useState } from "react";
import {
  PlayButton,
  PlayerGestureSurface,
  PlayerIconButton,
  Timeline,
  TimeDisplay,
  usePlayerController,
  usePlayerState,
  usePlayerTheme,
} from "@veolms/video-player";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import {
  LEARNING_PLAYER_EXPAND_LABEL,
  LEARNING_PLAYER_EXPAND_TITLE,
  LEARNING_PLAYER_MINIMIZE_SHORTCUT,
} from "./learningPlayerShortcuts";
import { AppIcon } from "../../icons/AppIcon";
import { cn } from "../../lib/utils";
import { readLearningPreferences } from "../../settings/settingsPreferences";

/**
 * The disc behind each mini player control: faint at rest, so the icon has
 * something to sit on over a bright picture, and clearer under the pointer.
 * The important flags are for the two that are player icon buttons, which
 * come with a surface of their own.
 */
const MINI_CONTROL_CIRCLE_CLASS =
  "!bg-black/35 hover:!bg-black/60 focus-visible:!bg-black/60";

/** How long tapped-open controls stay up while the lesson plays. */
const TAPPED_CONTROLS_VISIBLE_MS = 3000;

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

export function MiniPlayerRestoreControl({
  mobile = false,
  onRestore,
}: {
  mobile?: boolean;
  onRestore: () => void;
}) {
  if (mobile) {
    return (
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        aria-label={LEARNING_PLAYER_EXPAND_LABEL}
        title={LEARNING_PLAYER_EXPAND_TITLE}
        aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
        data-learning-mini-player-restore=""
        onClick={onRestore}
      />
    );
  }

  return (
    <div className="relative z-50 group/expand pointer-events-auto">
      <PlayerIconButton
        label="Expand [I]"
        title=""
        aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
        data-learning-mini-player-restore=""
        className={`!size-9 !rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] ${MINI_CONTROL_CIRCLE_CLASS}`}
        icon={<AppIcon name="miniPlayerExpand" className="size-5" />}
        onClick={(event) => {
          event.stopPropagation();
          onRestore();
        }}
      />
      <div className="pointer-events-none absolute top-1/2 left-full z-50 ml-1.5 hidden -translate-y-1/2 group-hover/expand:flex items-center gap-1.5 px-2 py-1 rounded bg-black/90 text-xs text-white shadow-lg whitespace-nowrap font-medium">
        <span>Expand</span>
        <kbd className="px-1 py-0.2 rounded bg-white/20 text-[10px] font-semibold">
          I
        </kbd>
      </div>
    </div>
  );
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
  const paused = usePlayerState(({ media }) => media.paused || media.ended);
  // A finger has no hover, so on a touch screen a tap on the picture brings
  // the controls up and another puts them away, as in the phone player.
  // While the lesson plays they leave by themselves.
  const [tappedOpen, setTappedOpen] = useState(false);
  const [seekIntervalSeconds] = useState(
    () => readLearningPreferences().seekIntervalSeconds,
  );

  useEffect(() => {
    if (!tappedOpen || paused) return undefined;
    const timer = window.setTimeout(
      () => setTappedOpen(false),
      TAPPED_CONTROLS_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [paused, tappedOpen]);

  return (
    <div
      className="group/mini-player absolute inset-0 z-30"
      data-learning-mini-player-controls-ready={ready ? "true" : "false"}
    >
      {/* Mobile Controls (<= 640px) */}
      <div className="min-[641px]:hidden absolute inset-0">
        <MiniPlayerRestoreControl mobile onRestore={onRestore} />
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

      {/* The picture itself, on wide screens: the same gestures as the phone
          player. A double tap or double click on the left or right half
          seeks by the interval chosen in settings, and holding it plays at
          2x. A single press never plays or pauses (only the play button
          does): from a finger or pen it shows or hides the controls, and
          from a mouse it does nothing, since hover already shows them. */}
      <PlayerGestureSurface
        className="hidden cursor-default min-[641px]:block"
        doubleTapSeek="always"
        seekIntervalSeconds={seekIntervalSeconds}
        onEmptyTap={(pointerType) => {
          if (pointerType === "mouse") return;
          setTappedOpen((open) => !open);
        }}
      />

      {/* Desktop Controls (> 640px): shown on hover, on keyboard focus, or
          after a tap. Hidden ones are not merely transparent, or a tap
          could land on a button nobody can see. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 hidden min-[641px]:block",
          "invisible opacity-0 transition-[opacity,visibility] duration-200",
          "group-hover/mini-player:visible group-hover/mini-player:opacity-100",
          "group-has-[:focus-visible]/mini-player:visible group-has-[:focus-visible]/mini-player:opacity-100",
          "data-[tapped-open=true]:visible data-[tapped-open=true]:opacity-100",
        )}
        data-learning-mini-player-controls-overlay=""
        data-tapped-open={tappedOpen ? "true" : "false"}
      >
        {/* Subtle dark backdrop for readability of controls over bright scenes */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-black/60" />

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
              `pointer-events-auto flex size-10 items-center justify-center rounded-full text-white transition-colors ${MINI_CONTROL_CIRCLE_CLASS}`,
              canGoPrevious
                ? "cursor-pointer"
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
            className={`pointer-events-auto flex size-14 cursor-pointer items-center justify-center rounded-full text-white drop-shadow-md transition-colors ${MINI_CONTROL_CIRCLE_CLASS}`}
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
              `pointer-events-auto flex size-10 items-center justify-center rounded-full text-white transition-colors ${MINI_CONTROL_CIRCLE_CLASS}`,
              canGoNext ? "cursor-pointer" : "opacity-35 cursor-not-allowed",
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
          <MiniPlayerRestoreControl onRestore={onRestore} />

          <div className="relative z-50 group/close pointer-events-auto">
            <PlayerIconButton
              label="Close"
              title=""
              className={`!size-9 !rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] ${MINI_CONTROL_CIRCLE_CLASS}`}
              icon={<CloseIcon size={20} />}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            />
            <div className="pointer-events-none absolute top-1/2 right-full z-50 mr-1.5 hidden -translate-y-1/2 group-hover/close:flex items-center gap-1.5 px-2 py-1 rounded bg-black/90 text-xs text-white shadow-lg whitespace-nowrap font-medium">
              <span>Close</span>
              <kbd className="px-1 py-0.2 rounded bg-white/20 text-[10px] font-semibold">
                Esc
              </kbd>
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

      {/* Desktop Timeline. Always drawn, but it only takes a press or a
          drag while the other controls are showing (hovered with a mouse,
          tapped open, or focused from the keyboard). Otherwise a touch on
          the bottom edge of the picture would seek by accident; it goes
          through to the picture and brings the controls up instead. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden min-[641px]:block"
        data-learning-mini-player-gesture-ignore=""
        data-learning-mini-player-timeline=""
      >
        <Timeline
          ariaLabel="Mini player timeline"
          showPreview={true}
          className="pointer-events-none group-hover/mini-player:[&_[role=slider]]:pointer-events-auto group-has-[:focus-visible]/mini-player:[&_[role=slider]]:pointer-events-auto group-has-[[data-tapped-open=true]]/mini-player:[&_[role=slider]]:pointer-events-auto [&_[data-timeline-buffered-range]]:rounded-none [&_[data-timeline-progress]]:rounded-none [&_[data-timeline-track]]:bottom-0 [&_[data-timeline-track]]:top-auto [&_[data-timeline-track]]:h-0.5 [&_[data-timeline-track]]:translate-y-0 [&_[data-timeline-track]]:rounded-none [&_[data-timeline-thumb]]:!hidden"
        />
      </div>
    </div>
  );
}
