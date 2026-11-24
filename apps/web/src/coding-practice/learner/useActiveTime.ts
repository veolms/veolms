import { useCallback, useEffect, useRef } from "react";

const TICK_MS = 5_000;
/** Without a key or click for this long, the learner is not counted as coding. */
const IDLE_AFTER_MS = 90_000;
/** What one save may claim (the server caps it again). */
const MAX_TAKE_SECONDS = 900;

/**
 * Seconds spent coding: the tab is visible and the learner pressed a key
 * or clicked within the last minute and a half. Saves and submits `take`
 * what has gathered; the server adds it to the learner's day (streak,
 * goal, calendar), capped by the time that really passed.
 */
export function useActiveTime() {
  const seconds = useRef(0);
  const lastInput = useRef(Date.now());

  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener("keydown", mark, true);
    window.addEventListener("pointerdown", mark, true);
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastInput.current < IDLE_AFTER_MS
      )
        seconds.current += TICK_MS / 1000;
    }, TICK_MS);
    return () => {
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("pointerdown", mark, true);
      window.clearInterval(timer);
    };
  }, []);

  /** The seconds gathered since the last take (at most 15 minutes). */
  const take = useCallback(() => {
    const taken = Math.min(Math.floor(seconds.current), MAX_TAKE_SECONDS);
    seconds.current = Math.max(0, seconds.current - taken);
    return taken;
  }, []);

  /** A save that failed: its seconds count with the next one. */
  const giveBack = useCallback((taken: number) => {
    seconds.current += taken;
  }, []);

  return { take, giveBack };
}

export type ActiveTime = ReturnType<typeof useActiveTime>;
