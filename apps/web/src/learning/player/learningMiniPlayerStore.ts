import {
  clearLearningMiniPlayerSession,
  readLearningMiniPlayerSession,
  writeLearningMiniPlayerSession,
} from "./learningMiniPlayerPersistence";
import type { LearningMiniPlayerSession } from "./learningMiniPlayerTypes";

const listeners = new Set<() => void>();
let currentSession: LearningMiniPlayerSession | null | undefined;

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
  clearLearningMiniPlayerSession();
  emitChange();
}
