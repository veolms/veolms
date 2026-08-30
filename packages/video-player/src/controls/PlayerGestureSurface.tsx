import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { usePlayerController } from "../react/context";

const DOUBLE_TAP_WINDOW_MS = 300;
const LONG_PRESS_DELAY_MS = 500;

type SeekDirection = -1 | 1;

export interface PlayerGestureSurfaceProps {
  emptyTapBehavior?: "toggle-controls" | "toggle-playback";
  seekIntervalSeconds?: number;
}

export function PlayerGestureSurface({
  emptyTapBehavior = "toggle-playback",
  seekIntervalSeconds = 10,
}: PlayerGestureSurfaceProps) {
  const controller = usePlayerController();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{
    direction: SeekDirection;
    timestamp: number;
  } | null>(null);
  const pressDirectionRef = useRef<SeekDirection>(1);
  const boostActiveRef = useRef(false);
  const priorRateRef = useRef(1);
  const wasPausedRef = useRef(false);
  const controlsVisibleBeforePressRef = useRef(true);

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

  const beginBoost = useCallback(() => {
    if (boostActiveRef.current) return;
    boostActiveRef.current = true;
    const media = controller.getSnapshot().media;
    priorRateRef.current = media.playbackRate;
    wasPausedRef.current = media.paused;
    controller.setPlaybackRate(2);
    if (media.paused) void controller.play().catch(() => undefined);
    controller.showHud("2× speed");
  }, [controller]);

  const endBoost = useCallback(() => {
    clearLongPressTimer();
    if (!boostActiveRef.current) return false;
    boostActiveRef.current = false;
    controller.setPlaybackRate(priorRateRef.current);
    if (wasPausedRef.current) controller.pause();
    controller.clearHud();
    return true;
  }, [clearLongPressTimer, controller]);

  useEffect(
    () => () => {
      clearSingleTapTimer();
      lastTapRef.current = null;
      endBoost();
    },
    [clearSingleTapTimer, endBoost],
  );

  const getSeekDirection = (
    event: PointerEvent<HTMLButtonElement>,
  ): SeekDirection => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
  };

  const scheduleSingleTap = useCallback(
    (direction: SeekDirection, timestamp: number) => {
      lastTapRef.current = { direction, timestamp };
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        lastTapRef.current = null;
        if (emptyTapBehavior === "toggle-controls") {
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

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pressDirectionRef.current = getSeekDirection(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(beginBoost, LONG_PRESS_DELAY_MS);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (endBoost()) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      return;
    }

    const direction = pressDirectionRef.current;
    const timestamp = Date.now();
    const lastTap = lastTapRef.current;
    const isDoubleTap =
      lastTap !== null &&
      lastTap.direction === direction &&
      timestamp - lastTap.timestamp <= DOUBLE_TAP_WINDOW_MS;

    if (isDoubleTap) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      const seconds = Math.max(1, Math.round(seekIntervalSeconds));
      controller.seekBy(direction * seconds);
      controller.showHud(`${direction < 0 ? "−" : "+"}${seconds} seconds`);
      return;
    }

    if (lastTap !== null) {
      clearSingleTapTimer();
      void controller.togglePlayback().catch(() => undefined);
    }
    scheduleSingleTap(direction, timestamp);
  };

  return (
    <button
      type="button"
      data-player-shortcut-surface=""
      className="absolute inset-0 z-0 touch-manipulation cursor-inherit border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      aria-label={
        emptyTapBehavior === "toggle-controls"
          ? "Show or hide video controls"
          : "Play or pause video"
      }
      onPointerDownCapture={captureControlsVisibility}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => endBoost()}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") endBoost();
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
