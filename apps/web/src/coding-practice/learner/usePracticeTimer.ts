import { useCallback, useEffect, useState } from "react";
import { readTimer, writeTimer, type DeviceTimer } from "./deviceStore";

const fresh = (): DeviceTimer => ({
  startedAt: Date.now(),
  elapsed: 0,
  hidden: false,
});

/**
 * The question's stopwatch (LeetCode's timer): runs from the moment the
 * question opens, survives a reload, pauses and resets. A timed round
 * counts down from its limit and says when the time is up; the learner
 * may go on.
 */
export function usePracticeTimer(
  assignmentId: string,
  limitMinutes: number | null,
) {
  const [timer, setTimer] = useState<DeviceTimer>(
    () => readTimer(assignmentId) ?? fresh(),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    writeTimer(assignmentId, timer);
  }, [assignmentId, timer]);

  useEffect(() => {
    if (timer.startedAt === null) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [timer.startedAt]);

  const seconds = Math.max(
    0,
    Math.floor(
      timer.elapsed +
        (timer.startedAt === null ? 0 : (now - timer.startedAt) / 1000),
    ),
  );
  const limit = limitMinutes ? limitMinutes * 60 : null;

  const pause = useCallback(
    () =>
      setTimer((current) =>
        current.startedAt === null
          ? current
          : {
              ...current,
              startedAt: null,
              elapsed:
                current.elapsed + (Date.now() - current.startedAt) / 1000,
            },
      ),
    [],
  );
  const resume = useCallback(
    () =>
      setTimer((current) =>
        current.startedAt === null
          ? { ...current, startedAt: Date.now() }
          : current,
      ),
    [],
  );
  const reset = useCallback(
    () => setTimer((current) => ({ ...fresh(), hidden: current.hidden })),
    [],
  );
  const toggleHidden = useCallback(
    () => setTimer((current) => ({ ...current, hidden: !current.hidden })),
    [],
  );

  return {
    seconds,
    running: timer.startedAt !== null,
    hidden: timer.hidden,
    limit,
    remaining: limit === null ? null : limit - seconds,
    timeUp: limit !== null && seconds >= limit,
    pause,
    resume,
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
