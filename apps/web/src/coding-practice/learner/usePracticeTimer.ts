import { useCallback, useEffect, useRef, useState } from "react";
import { readTimer, writeTimer, type DeviceTimer } from "./deviceStore";

/** While running, the counted time is saved this often (a crash loses less). */
const CHECKPOINT_MS = 30_000;
/** A tab hidden longer than this was left: that time is not counted. */
const AWAY_MS = 5 * 60_000;

interface TimerState {
  /** Seconds counted before `since`. */
  elapsed: number;
  /** Epoch ms the current running stretch began; null while stopped. */
  since: number | null;
  hidden: boolean;
  started: boolean;
  again: boolean;
}

const IDLE: TimerState = {
  elapsed: 0,
  since: null,
  hidden: false,
  started: false,
  again: false,
};

/** The seconds counted up to `at`. */
function counted(state: TimerState, at: number) {
  return (
    state.elapsed +
    (state.since === null ? 0 : Math.max(0, at - state.since) / 1000)
  );
}

/** The running stretch folded into `elapsed`, as if it began again at `at`. */
function fold(state: TimerState, at: number): TimerState {
  return state.since === null
    ? state
    : { ...state, elapsed: counted(state, at), since: at };
}

function toDevice(state: TimerState, at: number): DeviceTimer {
  return {
    startedAt: state.since === null ? null : at,
    elapsed: counted(state, at),
    hidden: state.hidden,
    started: state.started,
    again: state.again,
  };
}

/**
 * What the question opens with. A timer that was running goes on from the
 * seconds it had saved: the time the page was closed is not counted (it
 * showed 7 hours on a question solved that morning, 24 Nov 2026). A solved
 * question's timer is stopped, unless the learner started it again.
 */
function initial(
  saved: DeviceTimer | null,
  solved: boolean,
  bestSolveSeconds: number | null,
): TimerState {
  if (!saved) {
    return solved && bestSolveSeconds !== null
      ? { ...IDLE, elapsed: bestSolveSeconds, started: true }
      : IDLE;
  }
  const state: TimerState = {
    elapsed: saved.elapsed,
    since: saved.startedAt === null ? null : Date.now(),
    hidden: Boolean(saved.hidden),
    started: saved.started ?? true,
    again: Boolean(saved.again),
  };
  if (solved && !state.again && state.since !== null) {
    // Saved before the timer stopped on a solve: show the solve time.
    return {
      ...state,
      since: null,
      elapsed: bestSolveSeconds ?? state.elapsed,
    };
  }
  return state;
}

/**
 * The question's stopwatch (LeetCode's timer). It waits until the learner
 * starts: the first typing, Run or Submit, or Start in its menu. It stops
 * on a solve, is kept on the device (a reload goes on from where it was),
 * pauses and resets. It does not count while the page is closed, or while
 * the tab was hidden for more than five minutes. A timed round counts down
 * from its limit and says when the time is up; the learner may go on.
 */
export function usePracticeTimer(
  assignmentId: string,
  limitMinutes: number | null,
  {
    solved,
    bestSolveSeconds,
  }: { solved: boolean; bestSolveSeconds: number | null },
) {
  const [state, setState] = useState<TimerState>(() =>
    initial(readTimer(assignmentId), solved, bestSolveSeconds),
  );
  const [now, setNow] = useState(() => Date.now());
  // The latest state, for saving from page-hide and unmount handlers.
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    writeTimer(assignmentId, toDevice(state, Date.now()));
  }, [assignmentId, state]);

  const running = state.since !== null;
  useEffect(() => {
    if (!running) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const checkpoint = window.setInterval(
      () => setState((current) => fold(current, Date.now())),
      CHECKPOINT_MS,
    );
    return () => {
      window.clearInterval(tick);
      window.clearInterval(checkpoint);
    };
  }, [running]);

  // Hidden: the time so far is saved. Back within five minutes, that time
  // counts (looking something up); later, it does not (the learner left).
  // Closing the page saves it too; it goes on from there when reopened.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const save = () =>
      writeTimer(assignmentId, toDevice(latest.current, Date.now()));
    const onVisibility = () => {
      const at = Date.now();
      if (document.visibilityState === "hidden") {
        hiddenAt = at;
        setState((current) => fold(current, at));
        save();
        return;
      }
      const away = hiddenAt === null ? 0 : at - hiddenAt;
      hiddenAt = null;
      setNow(at);
      // The hidden stretch was folded in when the tab hid: starting the
      // running stretch now leaves it out.
      if (away > AWAY_MS)
        setState((current) =>
          current.since === null ? current : { ...current, since: at },
        );
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [assignmentId]);

  const seconds = Math.max(0, Math.floor(counted(state, now)));
  const limit = limitMinutes ? limitMinutes * 60 : null;

  const pause = useCallback(
    () =>
      setState((current) =>
        current.since === null
          ? current
          : { ...current, elapsed: counted(current, Date.now()), since: null },
      ),
    [],
  );
  const resume = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setState((current) =>
      current.since === null
        ? {
            ...current,
            since: at,
            started: true,
            again: current.again || solved,
          }
        : current,
    );
  }, [solved]);
  /**
   * The learner began (typed, ran or submitted): a timer that has not
   * started yet starts. A paused or solved timer is left as it is.
   */
  const touch = useCallback(() => {
    if (solved || latest.current.started) return;
    const at = Date.now();
    setNow(at);
    setState((current) =>
      current.started ? current : { ...current, since: at, started: true },
    );
  }, [solved]);
  const reset = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setState((current) => ({
      ...IDLE,
      hidden: current.hidden,
      // "Start again" starts at once.
      since: at,
      started: true,
      again: solved,
    }));
  }, [solved]);
  const toggleHidden = useCallback(
    () => setState((current) => ({ ...current, hidden: !current.hidden })),
    [],
  );

  return {
    seconds,
    running,
    /** False until the learner starts. */
    started: state.started,
    hidden: state.hidden,
    limit,
    remaining: limit === null ? null : limit - seconds,
    timeUp: limit !== null && seconds >= limit,
    pause,
    resume,
    touch,
    reset,
    toggleHidden,
  };
}

export type PracticeTimer = ReturnType<typeof usePracticeTimer>;

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "-" : "";
  const value = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const pad = (part: number) => String(part).padStart(2, "0");
  return hours
    ? `${sign}${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${sign}${minutes}:${pad(seconds)}`;
}
