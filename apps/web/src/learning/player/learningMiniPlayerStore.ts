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
