import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { usePlayerZoomGestures } from "../hooks/usePlayerZoomGestures";
import { usePlayerController } from "../react/context";
import { PLAYER_FEEDBACK_DURATION_MS } from "./feedbackTiming";

const DOUBLE_TAP_WINDOW_MS = 300;
const LONG_PRESS_DELAY_MS = 500;
const TOUCH_COMPLETION_DEDUPE_MS = 75;
const TOUCH_MOVE_TOLERANCE_PX = 12;
const DESKTOP_VIEW_QUERY = "(min-width: 40rem)";

type SeekDirection = -1 | 1;

interface MobileSeekSequence {
  direction: SeekDirection;
  totalSeconds: number;
}

export interface PlayerGestureSurfaceProps {
  emptyTapBehavior?: "responsive" | "toggle-controls" | "toggle-playback";
  seekIntervalSeconds?: number;
}

function isDesktopView(pointerType: string): boolean {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia(DESKTOP_VIEW_QUERY).matches;
  }

  return pointerType === "mouse";
}

function shouldToggleControls(
  emptyTapBehavior: PlayerGestureSurfaceProps["emptyTapBehavior"],
  pointerType: string,
): boolean {
  return (
    emptyTapBehavior === "toggle-controls" ||
    (emptyTapBehavior === "responsive" && !isDesktopView(pointerType))
  );
}

export function PlayerGestureSurface({
  emptyTapBehavior = "toggle-playback",
  seekIntervalSeconds = 10,
}: PlayerGestureSurfaceProps) {
  const controller = usePlayerController();
  const zoomGestures = usePlayerZoomGestures(controller);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{
    direction: SeekDirection;
    pointerType: string;
    timestamp: number;
  } | null>(null);
  const pressDirectionRef = useRef<SeekDirection>(1);
  const boostActiveRef = useRef(false);
  const priorRateRef = useRef(1);
  const wasPausedRef = useRef(false);
  const controlsVisibleBeforePressRef = useRef(true);
  const lastTouchCompletionAtRef = useRef(Number.NEGATIVE_INFINITY);
  const touchPointerDownAtRef = useRef(Number.NEGATIVE_INFINITY);
  const touchGestureRef = useRef<{
    direction: SeekDirection;
    identifier: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const mobileSeekSequenceRef = useRef<MobileSeekSequence | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current === null) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const clearSingleTapTimer = useCallback(() => {
    if (singleTapTimerRef.current === null) return;
    clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = null;
  }, []);

  const clearMobileSeekTimer = useCallback(() => {
    if (mobileSeekTimerRef.current === null) return;
    clearTimeout(mobileSeekTimerRef.current);
    mobileSeekTimerRef.current = null;
  }, []);

  const finishMobileSeekSequence = useCallback(() => {
    clearMobileSeekTimer();
    if (mobileSeekSequenceRef.current === null) return;
    mobileSeekSequenceRef.current = null;
    controller.clearHud();
    if (controller.getSnapshot().media.paused) {
      controller.setControlsVisible(true);
    }
  }, [clearMobileSeekTimer, controller]);

  const applyMobileSeek = useCallback(
    (direction: SeekDirection) => {
      const seconds = Math.max(1, Math.round(seekIntervalSeconds));
      const activeSequence = mobileSeekSequenceRef.current;
      const totalSeconds =
        activeSequence?.direction === direction
          ? activeSequence.totalSeconds + seconds
          : seconds;

      mobileSeekSequenceRef.current = { direction, totalSeconds };
      clearMobileSeekTimer();
      controller.setSettingsView("closed");
      controller.setControlsVisible(false);
      controller.seekBy(direction * seconds);
      controller.showHud(`${direction < 0 ? "−" : "+"}${totalSeconds}`, {
        direction,
        variant: "mobile-seek",
      });
      mobileSeekTimerRef.current = setTimeout(
        finishMobileSeekSequence,
        PLAYER_FEEDBACK_DURATION_MS,
      );
    },
    [
      clearMobileSeekTimer,
      controller,
      finishMobileSeekSequence,
      seekIntervalSeconds,
    ],
  );

  const beginBoost = useCallback(() => {
    if (boostActiveRef.current) return;
    boostActiveRef.current = true;
    const snapshot = controller.getSnapshot();
    const media = snapshot.media;
    priorRateRef.current = media.playbackRate;
    wasPausedRef.current = media.paused;
    controller.setSettingsView("closed");
    controller.setTemporarySpeedBoost(true);
    controller.setControlsVisible(false);
    controller.setPlaybackRate(2);
    if (media.paused) void controller.play().catch(() => undefined);
    controller.showHud("2× speed", { variant: "temporary-speed" });
  }, [controller]);

  const endBoost = useCallback(() => {
    clearLongPressTimer();
    if (!boostActiveRef.current) return false;
    boostActiveRef.current = false;
    const shouldRestoreControls =
      wasPausedRef.current || controlsVisibleBeforePressRef.current;
    controller.setPlaybackRate(priorRateRef.current);
    if (wasPausedRef.current) controller.pause();
    controller.setTemporarySpeedBoost(false);
    controller.setControlsVisible(shouldRestoreControls);
    controller.clearHud();
    return true;
  }, [clearLongPressTimer, controller]);

  useEffect(
    () => () => {
      clearSingleTapTimer();
      clearMobileSeekTimer();
      lastTapRef.current = null;
      mobileSeekSequenceRef.current = null;
      endBoost();
    },
    [clearMobileSeekTimer, clearSingleTapTimer, endBoost],
  );

  const cancelCompetingGestures = useCallback(() => {
    clearLongPressTimer();
    clearSingleTapTimer();
    clearMobileSeekTimer();
    lastTapRef.current = null;
    mobileSeekSequenceRef.current = null;
    touchGestureRef.current = null;
    endBoost();
    controller.clearHud();
  }, [
    clearLongPressTimer,
    clearMobileSeekTimer,
    clearSingleTapTimer,
    controller,
    endBoost,
  ]);

  const getSeekDirection = (element: HTMLButtonElement, clientX: number) => {
    const bounds = element.getBoundingClientRect();
    return clientX < bounds.left + bounds.width / 2 ? -1 : 1;
  };

  const scheduleSingleTap = useCallback(
    (direction: SeekDirection, timestamp: number, pointerType: string) => {
      lastTapRef.current = { direction, pointerType, timestamp };
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        lastTapRef.current = null;
        if (shouldToggleControls(emptyTapBehavior, pointerType)) {
          const shouldShowControls = !controlsVisibleBeforePressRef.current;
          if (!shouldShowControls) controller.setSettingsView("closed");
          controller.setControlsVisible(shouldShowControls);
          return;
        }
        void controller.togglePlayback().catch(() => undefined);
      }, DOUBLE_TAP_WINDOW_MS);
    },
    [controller, emptyTapBehavior],
  );

  const captureControlsVisibility = () => {
    controlsVisibleBeforePressRef.current =
      controller.getSnapshot().ui.controlsVisible;
  };

  const completePress = (direction: SeekDirection, pointerType: string) => {
    const timestamp = Date.now();
    if (
      pointerType === "touch" &&
      timestamp - lastTouchCompletionAtRef.current < TOUCH_COMPLETION_DEDUPE_MS
    ) {
      return;
    }
    if (pointerType === "touch") {
      lastTouchCompletionAtRef.current = timestamp;
    }

    if (endBoost()) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      return;
    }

    if (mobileSeekSequenceRef.current !== null && !isDesktopView(pointerType)) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      applyMobileSeek(direction);
      return;
    }

    const lastTap = lastTapRef.current;
    const isDoubleTapWindow =
      lastTap !== null &&
      lastTap.pointerType === pointerType &&
      timestamp - lastTap.timestamp <= DOUBLE_TAP_WINDOW_MS;
    const desktopDoubleTap = isDoubleTapWindow && isDesktopView(pointerType);
    const mobileSeekDoubleTap =
      isDoubleTapWindow &&
      !desktopDoubleTap &&
      lastTap?.direction === direction;

    if (desktopDoubleTap) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      void controller.toggleFullscreen().catch(() => undefined);
      return;
    }

    if (mobileSeekDoubleTap) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      applyMobileSeek(direction);
      return;
    }

    if (lastTap !== null) {
      clearSingleTapTimer();
      if (!shouldToggleControls(emptyTapBehavior, pointerType)) {
        void controller.togglePlayback().catch(() => undefined);
      }
    }
    scheduleSingleTap(direction, timestamp, pointerType);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (zoomGestures.onPointerDown(event)) {
      cancelCompetingGestures();
      return;
    }
    pressDirectionRef.current = getSeekDirection(
      event.currentTarget,
      event.clientX,
    );
    if (event.pointerType === "touch") {
      touchPointerDownAtRef.current = Date.now();
    }
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(beginBoost, LONG_PRESS_DELAY_MS);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (zoomGestures.onPointerEnd(event)) {
      cancelCompetingGestures();
      return;
    }
    completePress(pressDirectionRef.current, event.pointerType);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!zoomGestures.onPointerMove(event)) return;
    cancelCompetingGestures();
  };

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    if (
      zoomGestures.onTouchStart(event) ||
      zoomGestures.suppressLegacyTouch()
    ) {
      cancelCompetingGestures();
      return;
    }
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (!touch) return;
    if (
      Date.now() - touchPointerDownAtRef.current >=
      TOUCH_COMPLETION_DEDUPE_MS
    ) {
      captureControlsVisibility();
    }
    const direction = getSeekDirection(event.currentTarget, touch.clientX);
    pressDirectionRef.current = direction;
    touchGestureRef.current = {
      direction,
      identifier: touch.identifier,
      moved: false,
      x: touch.clientX,
      y: touch.clientY,
    };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(beginBoost, LONG_PRESS_DELAY_MS);
  };

  const handleTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    if (zoomGestures.onTouchMove(event) || zoomGestures.suppressLegacyTouch()) {
      cancelCompetingGestures();
      return;
    }
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    const touch = Array.from(event.touches).find(
      (candidate) => candidate.identifier === gesture.identifier,
    );
    if (!touch) return;
    if (
      Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) <=
      TOUCH_MOVE_TOLERANCE_PX
    ) {
      return;
    }
    gesture.moved = true;
    endBoost();
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    if (zoomGestures.onTouchEnd(event) || zoomGestures.suppressLegacyTouch()) {
      cancelCompetingGestures();
      return;
    }
    const gesture = touchGestureRef.current;
    touchGestureRef.current = null;
    touchPointerDownAtRef.current = Number.NEGATIVE_INFINITY;
    if (!gesture || gesture.moved) {
      endBoost();
      return;
    }
    completePress(gesture.direction, "touch");
  };

  const surfaceLabel =
    emptyTapBehavior === "toggle-controls"
      ? "Show or hide video controls"
      : emptyTapBehavior === "responsive"
        ? "Play or pause video; tap to show controls"
        : "Play or pause video";

  return (
    <button
      type="button"
      data-player-zoom-surface=""
      data-player-shortcut-surface=""
      className="absolute inset-0 z-0 touch-none cursor-inherit border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      aria-label={surfaceLabel}
      onPointerDownCapture={captureControlsVisibility}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => {
        zoomGestures.onPointerEnd(event);
        cancelCompetingGestures();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") endBoost();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={(event) => {
        zoomGestures.onTouchEnd(event);
        touchPointerDownAtRef.current = Number.NEGATIVE_INFINITY;
        cancelCompetingGestures();
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
