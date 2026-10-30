import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The lesson page's per-lesson progress (percent by lesson number), for the
 * lesson lists that live inside the player: the one beside a video in full
 * screen and the mini player's.
 *
 * Those lists used to be handed the progress itself, so every progress
 * change (any seek, every few seconds of play) made new player props and
 * registered the persistent player with the academy layout again: a sync
 * update in the middle of a commit, re-rendering the whole layout. On
 * 2026-10-22 that, a progress update React kept replaying and a state
 * updater that stamped the time looped every frame until React stopped with
 * "Maximum update depth exceeded" (error #185) after a seek. The player now
 * gets this source once; progress moves only the lists that read it.
 */
export interface LiveLessonProgress {
  get: () => Readonly<Record<number, number>>;
  subscribe: (listener: () => void) => () => void;
}

interface LiveLessonProgressSource extends LiveLessonProgress {
  set: (progress: Readonly<Record<number, number>>) => void;
}

function createLiveLessonProgress(
  initial: Readonly<Record<number, number>>,
): LiveLessonProgressSource {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (progress) => {
      if (progress === current) return;
      current = progress;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * One source for as long as the lesson page is mounted, kept up to date with
 * `progress` once each change has been committed. The lists reading it
 * follow a commit later, in their own small render.
 */
export function useLiveLessonProgressSource(
  progress: Readonly<Record<number, number>>,
): LiveLessonProgress {
  const [source] = useState(() => createLiveLessonProgress(progress));
  useEffect(() => {
    source.set(progress);
  }, [progress, source]);
  return source;
}

const subscribeToNothing = () => () => {};
const getNothing = () => undefined;

export function useLiveLessonProgress(
  source: LiveLessonProgress | undefined,
): Readonly<Record<number, number>> | undefined {
  return useSyncExternalStore(
    source?.subscribe ?? subscribeToNothing,
    source?.get ?? getNothing,
    source?.get ?? getNothing,
  );
}
