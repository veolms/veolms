import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The time a timed attempt is counted against, sampled once a second.
 *
 * It lives outside React state so that each reader re-renders only when the
 * value it derives changes: the countdown display once a second, the panel
 * around it once, when the time runs out.
 */
export interface QuizClock {
  now: () => number;
  subscribe: (listener: () => void) => () => void;
}

interface WritableQuizClock extends QuizClock {
  set: (now: number) => void;
}

function createQuizClock(): WritableQuizClock {
  let current = Date.now();
  const listeners = new Set<() => void>();
  return {
    now: () => current,
    set: (now) => {
      current = now;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Ticks while the attempt has an expiry; restarts when the expiry changes. */
export function useQuizClock(expiresAt: string | null | undefined): QuizClock {
  const [clock] = useState(createQuizClock);
  useEffect(() => {
    if (!expiresAt) return undefined;
    clock.set(Date.now());
    const timer = window.setInterval(() => clock.set(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [clock, expiresAt]);
  return clock;
}

function remainingQuizSeconds(
  expiresAtMs: number,
  clockOffsetMs: number,
  now: number,
) {
  return Math.max(0, Math.ceil((expiresAtMs - (now + clockOffsetMs)) / 1_000));
}

/** Whole seconds left, read from the clock's latest sample. */
export function useQuizRemainingSeconds(
  clock: QuizClock,
  expiresAtMs: number,
  clockOffsetMs: number,
) {
  const read = () =>
    remainingQuizSeconds(expiresAtMs, clockOffsetMs, clock.now());
  return useSyncExternalStore(clock.subscribe, read, read);
}

/** Whether the time has run out. An attempt without a limit never has. */
export function useQuizTimeExpired(
  clock: QuizClock,
  expiresAtMs: number | null,
  clockOffsetMs: number,
) {
  const read = () =>
    expiresAtMs !== null &&
    remainingQuizSeconds(expiresAtMs, clockOffsetMs, clock.now()) === 0;
  return useSyncExternalStore(clock.subscribe, read, read);
}
