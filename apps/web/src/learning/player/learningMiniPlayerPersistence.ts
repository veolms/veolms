import type { LearningMiniPlayerSession } from "./learningMiniPlayerTypes";

const LEARNING_MINI_PLAYER_STORAGE_KEY = "veolms-learning-mini-player";

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export function readLearningMiniPlayerSession(
  storage: Storage | null = getStorage(),
): LearningMiniPlayerSession | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(LEARNING_MINI_PLAYER_STORAGE_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<LearningMiniPlayerSession>;
    if (
      typeof session.lessonPath !== "string" ||
      typeof session.lessonTitle !== "string" ||
      typeof session.mediaKey !== "string" ||
      typeof session.source?.src !== "string"
    ) {
      storage.removeItem(LEARNING_MINI_PLAYER_STORAGE_KEY);
      return null;
    }
    return {
      ...session,
      volume:
        typeof session.volume === "number" && Number.isFinite(session.volume)
          ? session.volume
          : 1,
    } as LearningMiniPlayerSession;
  } catch {
    storage.removeItem(LEARNING_MINI_PLAYER_STORAGE_KEY);
    return null;
  }
}

export function writeLearningMiniPlayerSession(
  session: LearningMiniPlayerSession,
  storage: Storage | null = getStorage(),
): void {
  try {
    storage?.setItem(LEARNING_MINI_PLAYER_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The in-memory mini player remains available when storage is blocked.
  }
}

export function clearLearningMiniPlayerSession(
  storage: Storage | null = getStorage(),
): void {
  try {
    storage?.removeItem(LEARNING_MINI_PLAYER_STORAGE_KEY);
  } catch {
    // No stored session remains to clear when storage is blocked.
  }
}
