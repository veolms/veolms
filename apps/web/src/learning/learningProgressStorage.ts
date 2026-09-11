import type { LearningProgressLesson } from "@veolms/contracts";

export const LEARNING_PROGRESS_STORAGE_VERSION = 1;
const STORAGE_PREFIX = "veolms-learning-progress-v1";
const MAX_STORED_PROGRESS_ITEMS = 500;

export interface LocalLearningProgressItem {
  lessonId?: string;
  lessonNumber: number;
  progressPercent: number;
  clientUpdatedAt: string;
  pending: boolean;
}

export interface LocalLearningProgressState {
  version: typeof LEARNING_PROGRESS_STORAGE_VERSION;
  items: LocalLearningProgressItem[];
}

export interface LearningProgressSyncItem {
  lessonId: string;
  progressPercent: number;
  clientUpdatedAt: string;
}

export const EMPTY_LEARNING_PROGRESS_STATE: LocalLearningProgressState = {
  version: LEARNING_PROGRESS_STORAGE_VERSION,
  items: [],
};

const clampProgress = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const getStorageKey = (userId: string, courseKey: string) =>
  `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(courseKey)}`;

const getItemKey = (
  item: Pick<LocalLearningProgressItem, "lessonId" | "lessonNumber">,
) => item.lessonId || `number:${item.lessonNumber}`;

function getItemIndex(
  items: readonly LocalLearningProgressItem[],
  lessonId: string | undefined,
  lessonNumber: number,
) {
  return items.findIndex(
    (item) =>
      (lessonId && item.lessonId === lessonId) ||
      (!item.lessonId && item.lessonNumber === lessonNumber) ||
      (!lessonId && item.lessonNumber === lessonNumber),
  );
}

function normalizeState(value: unknown): LocalLearningProgressState {
  if (!value || typeof value !== "object") return EMPTY_LEARNING_PROGRESS_STATE;
  const candidate = value as { version?: unknown; items?: unknown };
  if (
    candidate.version !== LEARNING_PROGRESS_STORAGE_VERSION ||
    !Array.isArray(candidate.items)
  ) {
    return EMPTY_LEARNING_PROGRESS_STATE;
  }

  const itemsByKey = new Map<string, LocalLearningProgressItem>();
  for (const rawItem of candidate.items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Partial<LocalLearningProgressItem>;
    if (
      (!item.lessonId || typeof item.lessonId !== "string") &&
      (!Number.isInteger(item.lessonNumber) || (item.lessonNumber ?? 0) < 1)
    ) {
      continue;
    }
    if (
      !Number.isInteger(item.lessonNumber) ||
      (item.lessonNumber ?? 0) < 1 ||
      typeof item.progressPercent !== "number" ||
      !Number.isFinite(item.progressPercent) ||
      typeof item.clientUpdatedAt !== "string"
    ) {
      continue;
    }

    const lessonNumber = Number(item.lessonNumber);
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1) continue;
    const normalized: LocalLearningProgressItem = {
      lessonId: item.lessonId,
      lessonNumber,
      progressPercent: clampProgress(item.progressPercent),
      clientUpdatedAt: item.clientUpdatedAt,
      pending: item.pending === true,
    };
    itemsByKey.set(getItemKey(normalized), normalized);
  }

  return {
    version: LEARNING_PROGRESS_STORAGE_VERSION,
    items: [...itemsByKey.values()].slice(-MAX_STORED_PROGRESS_ITEMS),
  };
}

export function readLearningProgress(
  userId: string | undefined,
  courseKey: string | undefined,
): LocalLearningProgressState {
  if (typeof window === "undefined" || !userId || !courseKey) {
    return EMPTY_LEARNING_PROGRESS_STATE;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId, courseKey));
    return raw
      ? normalizeState(JSON.parse(raw))
      : EMPTY_LEARNING_PROGRESS_STATE;
  } catch {
    return EMPTY_LEARNING_PROGRESS_STATE;
  }
}

export function writeLearningProgress(
  userId: string | undefined,
  courseKey: string | undefined,
  state: LocalLearningProgressState,
): void {
  if (typeof window === "undefined" || !userId || !courseKey) return;

  try {
    window.localStorage.setItem(
      getStorageKey(userId, courseKey),
      JSON.stringify(normalizeState(state)),
    );
  } catch {
    // Storage can be disabled or full. The in-memory state and the unload
    // beacon still provide a best-effort path to the server.
  }
}

export function recordLearningProgress(
  state: LocalLearningProgressState,
  input: {
    lessonId?: string;
    lessonNumber: number;
    progressPercent: number;
  },
): LocalLearningProgressState {
  const progressPercent = clampProgress(input.progressPercent);
  const itemIndex = getItemIndex(
    state.items,
    input.lessonId,
    input.lessonNumber,
  );
  const existing = itemIndex >= 0 ? state.items[itemIndex] : undefined;
  const nextProgress = Math.max(
    existing?.progressPercent ?? 0,
    progressPercent,
  );
  const nextLessonId = input.lessonId || existing?.lessonId;

  if (
    existing &&
    existing.lessonId === nextLessonId &&
    existing.progressPercent >= nextProgress
  ) {
    return state;
  }

  const nextItem: LocalLearningProgressItem = {
    lessonId: nextLessonId,
    lessonNumber: input.lessonNumber,
    progressPercent: nextProgress,
    clientUpdatedAt: new Date().toISOString(),
    pending: true,
  };
  const nextItems = [...state.items];
  if (itemIndex >= 0) nextItems[itemIndex] = nextItem;
  else nextItems.push(nextItem);

  return {
    version: LEARNING_PROGRESS_STORAGE_VERSION,
    items: nextItems.slice(-MAX_STORED_PROGRESS_ITEMS),
  };
}

export function mergeServerLearningProgress(
  state: LocalLearningProgressState,
  lessons: readonly LearningProgressLesson[],
): LocalLearningProgressState {
  let nextItems = [...state.items];
  let changed = false;

  for (const lesson of lessons) {
    const itemIndex = getItemIndex(
      nextItems,
      lesson.lessonId,
      lesson.lessonNumber,
    );
    const existing = itemIndex >= 0 ? nextItems[itemIndex] : undefined;
    const progressPercent = Math.max(
      existing?.progressPercent ?? 0,
      lesson.progressPercent,
    );
    const pending =
      existing?.pending === true &&
      (existing.progressPercent ?? 0) > lesson.progressPercent;
    const nextItem: LocalLearningProgressItem = {
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      progressPercent,
      clientUpdatedAt: existing?.clientUpdatedAt ?? new Date(0).toISOString(),
      pending,
    };
    if (
      !existing ||
      existing.lessonId !== nextItem.lessonId ||
      existing.lessonNumber !== nextItem.lessonNumber ||
      existing.progressPercent !== nextItem.progressPercent ||
      existing.pending !== nextItem.pending
    ) {
      changed = true;
      if (itemIndex >= 0) nextItems[itemIndex] = nextItem;
      else nextItems.push(nextItem);
    }
  }

  return changed
    ? {
        version: LEARNING_PROGRESS_STORAGE_VERSION,
        items: nextItems.slice(-MAX_STORED_PROGRESS_ITEMS),
      }
    : state;
}

export function mergeLocalLearningProgress(
  current: LocalLearningProgressState,
  incoming: LocalLearningProgressState,
): LocalLearningProgressState {
  let nextItems = [...current.items];
  let changed = false;

  for (const incomingItem of incoming.items) {
    const itemIndex = getItemIndex(
      nextItems,
      incomingItem.lessonId,
      incomingItem.lessonNumber,
    );
    const existing = itemIndex >= 0 ? nextItems[itemIndex] : undefined;
    if (!existing) {
      nextItems.push(incomingItem);
      changed = true;
      continue;
    }

    const useIncomingTimestamp =
      incomingItem.pending && !existing.pending
        ? true
        : incomingItem.progressPercent > existing.progressPercent;
    const nextItem: LocalLearningProgressItem = {
      ...existing,
      lessonId: incomingItem.lessonId || existing.lessonId,
      lessonNumber: incomingItem.lessonNumber,
      progressPercent: Math.max(
        existing.progressPercent,
        incomingItem.progressPercent,
      ),
      clientUpdatedAt: useIncomingTimestamp
        ? incomingItem.clientUpdatedAt
        : existing.clientUpdatedAt,
      pending: existing.pending || incomingItem.pending,
    };
    if (
      existing.lessonId !== nextItem.lessonId ||
      existing.lessonNumber !== nextItem.lessonNumber ||
      existing.progressPercent !== nextItem.progressPercent ||
      existing.clientUpdatedAt !== nextItem.clientUpdatedAt ||
      existing.pending !== nextItem.pending
    ) {
      nextItems[itemIndex] = nextItem;
      changed = true;
    }
  }

  return changed
    ? {
        version: LEARNING_PROGRESS_STORAGE_VERSION,
        items: nextItems.slice(-MAX_STORED_PROGRESS_ITEMS),
      }
    : current;
}

export function markLearningProgressSynced(
  state: LocalLearningProgressState,
  sentItems: readonly LearningProgressSyncItem[],
): LocalLearningProgressState {
  let changed = false;
  const nextItems = state.items.map((item) => {
    const sent = sentItems.find(
      (sentItem) =>
        sentItem.lessonId === item.lessonId &&
        sentItem.clientUpdatedAt === item.clientUpdatedAt,
    );
    if (!sent || !item.pending) return item;
    changed = true;
    return { ...item, pending: false };
  });
  return changed ? { ...state, items: nextItems } : state;
}

export function getPendingLearningProgress(
  state: LocalLearningProgressState,
): LearningProgressSyncItem[] {
  return state.items
    .filter((item): item is LocalLearningProgressItem & { lessonId: string } =>
      Boolean(item.pending && item.lessonId),
    )
    .map(({ lessonId, progressPercent, clientUpdatedAt }) => ({
      lessonId,
      progressPercent,
      clientUpdatedAt,
    }));
}

export function getLearningProgressMap(
  state: LocalLearningProgressState,
): Record<number, number> {
  return state.items.reduce<Record<number, number>>((progress, item) => {
    progress[item.lessonNumber] = Math.max(
      progress[item.lessonNumber] ?? 0,
      item.progressPercent,
    );
    return progress;
  }, {});
}

export function getLearningProgressStorageKey(
  userId: string,
  courseKey: string,
) {
  return getStorageKey(userId, courseKey);
}
