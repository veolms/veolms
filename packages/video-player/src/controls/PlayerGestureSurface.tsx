import { useEffect, useRef, type PointerEvent } from "react";
import { usePlayerController } from "../react/context";

const SECOND_PRESS_WINDOW_MS = 400;
const LONG_PRESS_DELAY_MS = 500;

export function PlayerGestureSurface() {
  const controller = usePlayerController();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressRef = useRef(0);
  const boostActiveRef = useRef(false);
  const priorRateRef = useRef(1);
  const wasPausedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const beginBoost = () => {
    if (boostActiveRef.current) return;
    boostActiveRef.current = true;
    const media = controller.getSnapshot().media;
    priorRateRef.current = media.playbackRate;
    wasPausedRef.current = media.paused;
    controller.setPlaybackRate(2);
    if (media.paused) void controller.play().catch(() => undefined);
    controller.showHud("2× speed");
  };

  const endBoost = () => {
    clearTimer();
    if (!boostActiveRef.current) return false;
    boostActiveRef.current = false;
    controller.setPlaybackRate(priorRateRef.current);
    if (wasPausedRef.current) controller.pause();
    controller.clearHud();
    return true;
  };

  useEffect(() => () => void endBoost(), []);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const now = Date.now();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (now - lastPressRef.current < SECOND_PRESS_WINDOW_MS) beginBoost();
    else timerRef.current = setTimeout(beginBoost, LONG_PRESS_DELAY_MS);
    lastPressRef.current = now;
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!endBoost()) void controller.togglePlayback().catch(() => undefined);
  };

  return (
    <button
      type="button"
      data-player-shortcut-surface=""
      className="absolute inset-0 z-0 cursor-inherit border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      aria-label="Play or pause video"
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
