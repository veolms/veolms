import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  LessonVideoPlayer,
  type LessonVideoPlayerProps,
} from "./LessonVideoPlayer";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";

export type LearningPlayerPresentation = "full" | "mini";

export interface PersistentLearningPlayerRegistration {
  anchor: HTMLElement | null;
  courseRouteKey: string;
  lessonPath: string;
  mediaKey: string;
  playerProps: LessonVideoPlayerProps;
  returnPath: string;
}

export type RegisterPersistentLearningPlayer = (
  registration: PersistentLearningPlayerRegistration & { anchor: HTMLElement },
) => () => void;

interface PlayerAnchorRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface PersistentLearningPlayerHostProps {
  player: PersistentLearningPlayerRegistration;
  presentation: LearningPlayerPresentation;
  onClose: () => void;
  onRestore: () => void;
}

const readAnchorRect = (anchor: HTMLElement): PlayerAnchorRect => {
  const rect = anchor.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
};

export function PersistentLearningPlayerHost({
  onClose,
  onRestore,
  player,
  presentation,
}: PersistentLearningPlayerHostProps) {
  const hostRef = useRef<HTMLElement>(null);
  const [anchorRect, setAnchorRect] = useState<PlayerAnchorRect | null>(null);
  const miniPlayer = useLearningMiniPlayerGestures(
    hostRef,
    onClose,
    presentation === "mini",
  );

  const syncAnchorRect = useCallback(() => {
    if (!player.anchor) return;
    const nextRect = readAnchorRect(player.anchor);
    if (nextRect.width <= 0 || nextRect.height <= 0) return;
    setAnchorRect((current) =>
      current &&
      Math.abs(current.left - nextRect.left) < 0.25 &&
      Math.abs(current.top - nextRect.top) < 0.25 &&
      Math.abs(current.width - nextRect.width) < 0.25 &&
      Math.abs(current.height - nextRect.height) < 0.25
        ? current
        : nextRect,
    );
  }, [player.anchor]);

  useLayoutEffect(() => {
    if (presentation !== "full" || !player.anchor) return undefined;

    let frame: number | null = null;
    const scheduleSync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncAnchorRect();
      });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSync);

    syncAnchorRect();
    observer?.observe(player.anchor);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);
    window.visualViewport?.addEventListener("resize", scheduleSync);
    window.visualViewport?.addEventListener("scroll", scheduleSync);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      window.visualViewport?.removeEventListener("resize", scheduleSync);
      window.visualViewport?.removeEventListener("scroll", scheduleSync);
    };
  }, [player.anchor, presentation, syncAnchorRect]);

  const fullStyle: CSSProperties = anchorRect
    ? {
        height: anchorRect.height,
        left: anchorRect.left,
        top: anchorRect.top,
        width: anchorRect.width,
      }
    : { visibility: "hidden" };
  const miniStyle: CSSProperties = {
    bottom: "calc(70px + env(safe-area-inset-bottom))",
    ...miniPlayer.style,
  };
  const mini = presentation === "mini";

  return (
    <aside
      ref={hostRef}
      className={
        mini
          ? "fixed right-3 z-130 w-[82vw] min-w-[50vw] touch-none overflow-hidden rounded-xl bg-black shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] sm:hidden motion-reduce:transition-none"
          : "fixed z-[39] overflow-visible bg-transparent"
      }
      style={mini ? miniStyle : fullStyle}
      aria-label={
        mini ? `Mini player for ${player.playerProps.lessonTitle}` : undefined
      }
      aria-describedby={mini ? "learning-mini-player-gesture-help" : undefined}
      data-learning-persistent-player=""
      data-learning-mini-player={mini ? "" : undefined}
      data-mini-player-mode={mini ? miniPlayer.mode : undefined}
      {...(mini ? miniPlayer.gestureProps : {})}
    >
      {mini ? (
        <span id="learning-mini-player-gesture-help" className="sr-only">
          Drag to move, pinch to resize, or swipe down quickly to close.
        </span>
      ) : null}
      <LessonVideoPlayer
        {...player.playerProps}
        presentation={presentation}
        onMiniClose={onClose}
        onMiniRestore={onRestore}
        onMiniPlayerRestoreReady={undefined}
      />
    </aside>
  );
}
