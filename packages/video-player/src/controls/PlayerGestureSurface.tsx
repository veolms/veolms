import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";
import { classNames } from "../utils/classNames";
import { MOBILE_SEEK_IDLE_DELAY_MS } from "./feedbackTiming";

const DOUBLE_TAP_WINDOW_MS = 300;
const LONG_PRESS_DELAY_MS = 500;
const TOUCH_COMPLETION_DEDUPE_MS = 75;
const TOUCH_MOVE_TOLERANCE_PX = 12;

type SeekDirection = -1 | 1;

interface MobileSeekSequence {
  direction: SeekDirection;
  totalSeconds: number;
}

interface PausedScrubGesture {
  duration: number;
  startTime: number;
  startX: number;
  width: number;
}

interface PointerPressGesture {
  moved: boolean;
  pointerId: number;
  x: number;
  y: number;
}

export interface PlayerGestureSurfaceProps {
  emptyTapBehavior?: "responsive" | "toggle-controls" | "toggle-playback";
  seekIntervalSeconds?: number;
}

function shouldToggleControls(
  emptyTapBehavior: PlayerGestureSurfaceProps["emptyTapBehavior"],
  mobileInteraction: boolean,
): boolean {
  return (
    emptyTapBehavior === "toggle-controls" ||
    (emptyTapBehavior === "responsive" && mobileInteraction)
  );
}

export function PlayerGestureSurface({
  emptyTapBehavior = "toggle-playback",
  seekIntervalSeconds = 10,
}: PlayerGestureSurfaceProps) {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const { ready, zoomGestureActive } = usePlayerState(
    ({ media, ui }) => ({
      ready: media.lifecycle === "ready",
      zoomGestureActive: ui.zoom.gestureActive,
    }),
    (left, right) =>
      left.ready === right.ready &&
      left.zoomGestureActive === right.zoomGestureActive,
  );
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
  const pausedScrubRef = useRef<PausedScrubGesture | null>(null);
  const pointerPressRef = useRef<PointerPressGesture | null>(null);
  const pressGeometryRef = useRef({ startX: 0, width: 0 });
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
    controller.setControlsVisible(true);
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
        MOBILE_SEEK_IDLE_DELAY_MS,
      );
    },
    [
      clearMobileSeekTimer,
      controller,
      finishMobileSeekSequence,
      seekIntervalSeconds,
    ],
  );

  const beginPausedScrub = useCallback(() => {
    const { media } = controller.getSnapshot();
    const { startX, width } = pressGeometryRef.current;
    if (
      !media.paused ||
      !Number.isFinite(media.duration) ||
      media.duration <= 0 ||
      width <= 0
    ) {
      return false;
    }

    pausedScrubRef.current = {
      duration: media.duration,
      startTime: media.currentTime,
      startX,
      width,
    };
    controller.setSettingsView("closed");
    controller.setPreviewTime(media.currentTime);
    controller.setScrubbing(true);
    return true;
  }, [controller]);

  const updatePausedScrub = useCallback(
    (clientX: number) => {
      const gesture = pausedScrubRef.current;
      if (!gesture) return false;
      const deltaTime =
        ((clientX - gesture.startX) / gesture.width) * gesture.duration;
      const nextTime = Math.min(
        gesture.duration,
        Math.max(0, gesture.startTime + deltaTime),
      );
      controller.setPreviewTime(nextTime);
      controller.seekTo(nextTime);
      return true;
    },
    [controller],
  );

  const endPausedScrub = useCallback(() => {
    clearLongPressTimer();
    if (pausedScrubRef.current === null) return false;
    pausedScrubRef.current = null;
    controller.setScrubbing(false);
    controller.setPreviewTime(null);
    controller.setControlsVisible(true);
    return true;
  }, [clearLongPressTimer, controller]);

  const beginBoost = useCallback(() => {
    if (boostActiveRef.current) return;
    const snapshot = controller.getSnapshot();
    const media = snapshot.media;
    if (media.paused) return;
    boostActiveRef.current = true;
    priorRateRef.current = media.playbackRate;
    controller.setSettingsView("closed");
    controller.setTemporarySpeedBoost(true);
    controller.setControlsVisible(false);
    controller.setPlaybackRate(2);
    controller.showHud("2× speed", { variant: "temporary-speed" });
  }, [controller]);

  const beginLongPress = useCallback(() => {
    if (controller.getSnapshot().media.paused) {
      beginPausedScrub();
      return;
    }
    beginBoost();
  }, [beginBoost, beginPausedScrub, controller]);

  const endBoost = useCallback(() => {
    clearLongPressTimer();
    if (!boostActiveRef.current) return false;
    boostActiveRef.current = false;
    controller.setPlaybackRate(priorRateRef.current);
    controller.setTemporarySpeedBoost(false);
    controller.setControlsVisible(controlsVisibleBeforePressRef.current);
    controller.clearHud();
    return true;
  }, [clearLongPressTimer, controller]);

  useEffect(
    () => () => {
      clearSingleTapTimer();
      clearMobileSeekTimer();
      lastTapRef.current = null;
      mobileSeekSequenceRef.current = null;
      endPausedScrub();
      endBoost();
    },
    [clearMobileSeekTimer, clearSingleTapTimer, endBoost, endPausedScrub],
  );

  const cancelCompetingGestures = useCallback(() => {
    clearLongPressTimer();
    clearSingleTapTimer();
    clearMobileSeekTimer();
    lastTapRef.current = null;
    mobileSeekSequenceRef.current = null;
    pointerPressRef.current = null;
    touchGestureRef.current = null;
    endPausedScrub();
    endBoost();
    controller.clearHud();
  }, [
    clearLongPressTimer,
    clearMobileSeekTimer,
    clearSingleTapTimer,
    controller,
    endBoost,
    endPausedScrub,
  ]);

  useEffect(() => {
    if (zoomGestureActive) cancelCompetingGestures();
  }, [cancelCompetingGestures, zoomGestureActive]);

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
        if (shouldToggleControls(emptyTapBehavior, mobileInteraction)) {
          const shouldShowControls = !controlsVisibleBeforePressRef.current;
          if (!shouldShowControls) controller.setSettingsView("closed");
          controller.setControlsVisible(shouldShowControls);
          return;
        }
        void controller.togglePlayback().catch(() => undefined);
      }, DOUBLE_TAP_WINDOW_MS);
    },
    [controller, emptyTapBehavior, mobileInteraction],
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

    if (endPausedScrub()) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      return;
    }

    if (endBoost()) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      return;
    }

    if (mobileSeekSequenceRef.current !== null && mobileInteraction) {
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
    const desktopDoubleTap = isDoubleTapWindow && !mobileInteraction;
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
      if (!shouldToggleControls(emptyTapBehavior, mobileInteraction)) {
        void controller.togglePlayback().catch(() => undefined);
      }
    }
    scheduleSingleTap(direction, timestamp, pointerType);
  };

  const capturePressGeometry = (
    element: HTMLButtonElement,
    clientX: number,
  ) => {
    const bounds = element.getBoundingClientRect();
    pressGeometryRef.current = { startX: clientX, width: bounds.width };
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerPressRef.current = {
      moved: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    capturePressGeometry(event.currentTarget, event.clientX);
    pressDirectionRef.current = getSeekDirection(
      event.currentTarget,
      event.clientX,
    );
    if (event.pointerType === "touch") {
      touchPointerDownAtRef.current = Date.now();
    }
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(beginLongPress, LONG_PRESS_DELAY_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = pointerPressRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (pausedScrubRef.current !== null) {
      gesture.moved = true;
      updatePausedScrub(event.clientX);
      return;
    }
    if (
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <=
      TOUCH_MOVE_TOLERANCE_PX
    ) {
      return;
    }
    gesture.moved = true;
    endBoost();
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = pointerPressRef.current;
    const pausedScrubActive = pausedScrubRef.current !== null;
    if (pausedScrubActive) updatePausedScrub(event.clientX);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    pointerPressRef.current = null;
    if (gesture?.moved && !pausedScrubActive) {
      endBoost();
      return;
    }
    completePress(pressDirectionRef.current, event.pointerType);
  };

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (!touch) return;
    if (
      Date.now() - touchPointerDownAtRef.current >=
      TOUCH_COMPLETION_DEDUPE_MS
    ) {
      captureControlsVisibility();
    }
    const direction = getSeekDirection(event.currentTarget, touch.clientX);
    capturePressGeometry(event.currentTarget, touch.clientX);
    pressDirectionRef.current = direction;
    touchGestureRef.current = {
      direction,
      identifier: touch.identifier,
      moved: false,
      x: touch.clientX,
      y: touch.clientY,
    };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(beginLongPress, LONG_PRESS_DELAY_MS);
  };

  const handleTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    const touch = Array.from(event.touches).find(
      (candidate) => candidate.identifier === gesture.identifier,
    );
    if (!touch) return;
    if (pausedScrubRef.current !== null) {
      gesture.moved = true;
      if (pointerPressRef.current) pointerPressRef.current.moved = true;
      event.preventDefault();
      updatePausedScrub(touch.clientX);
      return;
    }
    if (
      Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) <=
      TOUCH_MOVE_TOLERANCE_PX
    ) {
      return;
    }
    gesture.moved = true;
    if (pointerPressRef.current) pointerPressRef.current.moved = true;
    endBoost();
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    const gesture = touchGestureRef.current;
    touchGestureRef.current = null;
    touchPointerDownAtRef.current = Number.NEGATIVE_INFINITY;
    if (pausedScrubRef.current !== null) {
      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === gesture?.identifier,
      );
      if (touch) updatePausedScrub(touch.clientX);
      completePress(gesture?.direction ?? pressDirectionRef.current, "touch");
      return;
    }
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
      disabled={!ready}
      aria-hidden={ready ? undefined : true}
      data-player-zoom-surface=""
      data-player-shortcut-surface=""
      data-player-ready={ready ? "true" : "false"}
      className={classNames(
        "absolute inset-0 z-0 cursor-inherit border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
        mobileInteraction ? "touch-none" : "touch-pan-y",
      )}
      aria-label={surfaceLabel}
      onPointerDownCapture={captureControlsVisibility}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => {
        cancelCompetingGestures();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") return;
        if (!endPausedScrub()) endBoost();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchPointerDownAtRef.current = Number.NEGATIVE_INFINITY;
        cancelCompetingGestures();
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
