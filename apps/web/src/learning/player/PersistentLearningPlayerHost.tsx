import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  LessonVideoPlayer,
  type LessonVideoPlayerProps,
} from "./LessonVideoPlayer";
import {
  LEARNING_PLAYER_MOTION_DURATION_MS,
  LEARNING_PLAYER_MOTION_EASING,
} from "./learningPlayerMotion";
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

export interface PersistentLearningPlayerHostProps {
  player: PersistentLearningPlayerRegistration;
  presentation: LearningPlayerPresentation;
  onClose: () => void;
  onRestore: () => void;
}

export function PersistentLearningPlayerHost({
  onClose,
  onRestore,
  player,
  presentation,
}: PersistentLearningPlayerHostProps) {
  const hostRef = useRef<HTMLElement>(null);
  const mainScrollportRef = useRef<HTMLElement | null>(
    player.anchor?.closest<HTMLElement>(".courses-main") ?? null,
  );
  const lastMiniRectRef = useRef<DOMRect | null>(null);
  const previousPresentationRef = useRef(presentation);
  const restoreCleanupRef = useRef<(() => void) | null>(null);
  const restoreFromCurrentRect = useCallback(() => {
    const host = hostRef.current;
    if (host) lastMiniRectRef.current = host.getBoundingClientRect();
    onRestore();
  }, [onRestore]);
  const miniPlayer = useLearningMiniPlayerGestures(
    hostRef,
    onClose,
    presentation === "mini",
    restoreFromCurrentRect,
  );
  const finishRestoreBeforeMinimize = useCallback(() => {
    restoreCleanupRef.current?.();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || presentation !== "full") {
      return undefined;
    }

    const forwardWheelToMainScrollport = (event: WheelEvent) => {
      const scrollport = mainScrollportRef.current;
      if (
        !scrollport ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.deltaY === 0 ||
        window.innerWidth <= 640 ||
        host.querySelector('[data-player-mobile-interaction="true"]')
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('.player-volume-group, [role="menu"], [role="dialog"]')
      ) {
        return;
      }

      const deltaUnit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scrollport.clientHeight
            : 1;
      const maxScrollTop = Math.max(
        0,
        scrollport.scrollHeight - scrollport.clientHeight,
      );
      const nextScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, scrollport.scrollTop + event.deltaY * deltaUnit),
      );
      if (nextScrollTop === scrollport.scrollTop) return;

      event.preventDefault();
      scrollport.scrollTop = nextScrollTop;
    };

    host.addEventListener("wheel", forwardWheelToMainScrollport, {
      passive: false,
    });
    return () => {
      host.removeEventListener("wheel", forwardWheelToMainScrollport);
    };
  }, [presentation]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const previousPresentation = previousPresentationRef.current;
    previousPresentationRef.current = presentation;
    restoreCleanupRef.current?.();
    restoreCleanupRef.current = null;
    if (!host) return;

    if (presentation === "mini") {
      lastMiniRectRef.current = host.getBoundingClientRect();
      return;
    }
    if (previousPresentation !== "mini") return;

    const startRect = lastMiniRectRef.current;
    const endRect = host.getBoundingClientRect();
    if (
      !startRect ||
      startRect.width <= 0 ||
      endRect.width <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const scale = startRect.width / endRect.width;
    const inverseTransform = `translate3d(${(
      startRect.left - endRect.left
    ).toFixed(3)}px, ${(startRect.top - endRect.top).toFixed(
      3,
    )}px, 0) scale(${scale.toFixed(5)})`;
    host.dataset.learningPlayerRestorePhase = "expanding";
    host.style.borderRadius = "13px";
    host.style.overflow = "hidden";
    host.style.transform = inverseTransform;
    host.style.transformOrigin = "top left";
    host.style.transition = "none";
    host.style.willChange = "transform";
    host.style.zIndex = "190";

    let finished = false;
    let frame = window.requestAnimationFrame(() => {
      frame = 0;
      host.style.transition = `transform ${LEARNING_PLAYER_MOTION_DURATION_MS}ms ${LEARNING_PLAYER_MOTION_EASING}`;
      host.style.transform = "translate3d(0, 0, 0) scale(1)";
    });
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      restoreCleanupRef.current = null;
      host.style.removeProperty("border-radius");
      host.style.removeProperty("overflow");
      host.style.removeProperty("transform");
      host.style.removeProperty("transform-origin");
      host.style.removeProperty("transition");
      host.style.removeProperty("will-change");
      host.style.removeProperty("z-index");
      delete host.dataset.learningPlayerRestorePhase;
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === host && event.propertyName === "transform") finish();
    };
    const timer = window.setTimeout(
      finish,
      LEARNING_PLAYER_MOTION_DURATION_MS + 80,
    );
    const cleanup = () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      host.removeEventListener("transitionend", handleTransitionEnd);
    };
    restoreCleanupRef.current = finish;
    host.addEventListener("transitionend", handleTransitionEnd);
  }, [presentation]);

  useEffect(
    () => () => {
      restoreCleanupRef.current?.();
    },
    [],
  );

  const miniStyle: CSSProperties = miniPlayer.style;
  const mini = presentation === "mini";

  const playerHost = (
    <aside
      ref={hostRef}
      className={
        mini
          ? "fixed z-130 m-0 touch-none overflow-hidden rounded-xl border-0 bg-black p-0 shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          : "learning-persistent-player--full z-[39] overflow-x-clip overflow-y-visible bg-transparent"
      }
      style={mini ? miniStyle : undefined}
      aria-label={
        mini ? `Mini player for ${player.playerProps.lessonTitle}` : undefined
      }
      aria-describedby={mini ? "learning-mini-player-gesture-help" : undefined}
      popover={mini ? "manual" : undefined}
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
        minimizeMotionTarget={() => hostRef.current}
        onMinimizeGestureStart={finishRestoreBeforeMinimize}
        presentation={presentation}
        onMiniClose={onClose}
        onMiniRestore={restoreFromCurrentRect}
        onMiniPlayerRestoreReady={undefined}
      />
    </aside>
  );

  return mainScrollportRef.current
    ? createPortal(playerHost, mainScrollportRef.current)
    : playerHost;
}
