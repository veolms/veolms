import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { usePlayerController } from "../react/context";

const DOUBLE_TAP_WINDOW_MS = 300;
const LONG_PRESS_DELAY_MS = 500;
const DESKTOP_VIEW_QUERY = "(min-width: 40rem)";

type SeekDirection = -1 | 1;

export interface PlayerGestureSurfaceProps {
  emptyTapBehavior?: "responsive" | "toggle-controls" | "toggle-playback";
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
    pointerType: string;
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
    (direction: SeekDirection, timestamp: number, pointerType: string) => {
      lastTapRef.current = { direction, pointerType, timestamp };
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        lastTapRef.current = null;
        const shouldToggleControls =
          emptyTapBehavior === "toggle-controls" ||
          (emptyTapBehavior === "responsive" && pointerType !== "mouse");
        if (shouldToggleControls) {
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

  const isDesktopGesture = (pointerType: string) =>
    pointerType === "mouse" ||
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DESKTOP_VIEW_QUERY).matches);

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
    const isDoubleTapWindow =
      lastTap !== null &&
      lastTap.pointerType === event.pointerType &&
      timestamp - lastTap.timestamp <= DOUBLE_TAP_WINDOW_MS;
    const desktopDoubleTap =
      isDoubleTapWindow && isDesktopGesture(event.pointerType);
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
      const seconds = Math.max(1, Math.round(seekIntervalSeconds));
      controller.seekBy(direction * seconds);
      controller.showHud(`${direction < 0 ? "−" : "+"}${seconds} seconds`);
      return;
    }

    if (lastTap !== null) {
      clearSingleTapTimer();
      void controller.togglePlayback().catch(() => undefined);
    }
    scheduleSingleTap(direction, timestamp, event.pointerType);
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
      data-player-shortcut-surface=""
      className="absolute inset-0 z-0 touch-manipulation cursor-inherit border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      aria-label={surfaceLabel}
      title="Double-click for fullscreen"
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
