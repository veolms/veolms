import {
  clearLearningMiniPlayerSession,
  readLearningMiniPlayerSession,
  writeLearningMiniPlayerSession,
} from "./learningMiniPlayerPersistence";
import type {
  LearningMiniPlayerSession,
  LearningPlayerPlaybackSnapshot,
} from "./learningMiniPlayerTypes";

interface LearningMiniPlayerRuntime {
  getPlaybackSnapshot: () => LearningPlayerPlaybackSnapshot;
  mediaKey: string;
  preparePlaybackHandoff: () => void;
}

const listeners = new Set<() => void>();
let currentSession: LearningMiniPlayerSession | null | undefined;
let currentRuntime: LearningMiniPlayerRuntime | null = null;

const emitChange = () => {
  for (const listener of listeners) listener();
};

export const subscribeToLearningMiniPlayer = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getLearningMiniPlayerSnapshot = () => {
  if (currentSession === undefined) {
    currentSession = readLearningMiniPlayerSession();
  }
  return currentSession;
};

export const getLearningMiniPlayerServerSnapshot = () => null;

export function openLearningMiniPlayerSession(
  session: LearningMiniPlayerSession,
): void {
  currentSession = session;
  writeLearningMiniPlayerSession(session);
  emitChange();
}

/**
 * Keeps the stored copy of the session on the lesson that is now playing.
 * The in-page mini player changes lessons without opening a new session, so
 * the stored one went on naming the lesson that was minimized, and a reload
 * brought that lesson back instead of the one being watched. Only storage is
 * written: nothing on screen reads this, so subscribers are not notified.
 */
export function syncStoredLearningMiniPlayerLesson(lesson: {
  mediaKey: string;
  selectedLesson: number;
  lessonTitle: string;
  lessonIndex?: number;
  totalLessons?: number;
  lessonPath: string;
  manifestUrl?: string;
}): void {
  const session = getLearningMiniPlayerSnapshot();
  if (!session || session.mediaKey === lesson.mediaKey) return;
  const { manifestUrl, ...fields } = lesson;
  writeLearningMiniPlayerSession({
    ...session,
    ...fields,
    currentTime: 0,
    source: {
      ...session.source,
      ...(manifestUrl ? { src: manifestUrl } : {}),
      startTime: 0,
    },
  });
}

export function closeLearningMiniPlayerSession(): void {
  currentSession = null;
  currentRuntime = null;
  clearLearningMiniPlayerSession();
  emitChange();
}

export function registerLearningMiniPlayerRuntime(
  runtime: LearningMiniPlayerRuntime,
): () => void {
  currentRuntime = runtime;
  return () => {
    if (currentRuntime === runtime) currentRuntime = null;
  };
}

export function getLearningMiniPlayerRuntimeSnapshot(
  mediaKey: string,
): LearningPlayerPlaybackSnapshot | null {
  if (!currentRuntime || currentRuntime.mediaKey !== mediaKey) return null;
  return currentRuntime.getPlaybackSnapshot();
}

export function prepareLearningMiniPlayerPlaybackHandoff(
  mediaKey: string,
): void {
  if (!currentRuntime || currentRuntime.mediaKey !== mediaKey) return;
  currentRuntime.preparePlaybackHandoff();
}
