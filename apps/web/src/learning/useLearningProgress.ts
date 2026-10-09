import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDeviceTimeZone } from "../lib/device-time-zone";
import { learningGoalKeys } from "../services/learning-goals";

import {
  useLearningProgressSnapshot,
  learningProgressService,
} from "../services/learning-progress";
import {
  EMPTY_LEARNING_PROGRESS_STATE,
  getLearningProgressMap,
  getLearningProgressStorageKey,
  getPendingLearningProgress,
  markLearningProgressSynced,
  mergeServerLearningProgress,
  mergeLocalLearningProgress,
  readLearningProgress,
  recordLearningProgress,
  writeLearningProgress,
  type LocalLearningProgressState,
} from "./learningProgressStorage";
import {
  peekWatchedSeconds,
  restoreWatchedSeconds,
  takeWatchedSeconds,
} from "./learningWatchTime";

const MAX_BATCH_ITEMS = 100;

interface UseLearningProgressOptions {
  courseKey?: string;
  userId?: string;
  lessonIdsByNumber?: ReadonlyMap<number, string>;
  enabled?: boolean;
}

interface FlushOptions {
  keepalive?: boolean;
}

export function useLearningProgress({
  courseKey,
  userId,
  lessonIdsByNumber,
  enabled = true,
}: UseLearningProgressOptions) {
  const queryClient = useQueryClient();
  const syncEnabled = Boolean(enabled && courseKey && userId);
  const storageIdentity =
    userId && courseKey ? `${userId}\u0000${courseKey}` : null;
  const [localState, setLocalState] = useState<LocalLearningProgressState>(() =>
    readLearningProgress(userId, courseKey),
  );
  const localStateRef = useRef(localState);
  const isFlushingRef = useRef(false);
  const retryDelayRef = useRef(0);
  const retryAtRef = useRef(0);

  const { data: serverProgress } = useLearningProgressSnapshot(
    courseKey ?? "",
    { enabled: syncEnabled },
  );

  useEffect(() => {
    localStateRef.current = localState;
  }, [localState]);

  useEffect(() => {
    setLocalState(
      storageIdentity
        ? readLearningProgress(userId, courseKey)
        : EMPTY_LEARNING_PROGRESS_STATE,
    );
  }, [courseKey, storageIdentity, userId]);

  useEffect(() => {
    if (!storageIdentity) return;
    writeLearningProgress(userId, courseKey, localState);
  }, [courseKey, localState, storageIdentity, userId]);

  useEffect(() => {
    if (!storageIdentity || !userId || !courseKey) return;
    const storageKey = getLearningProgressStorageKey(userId, courseKey);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setLocalState((current) =>
        mergeLocalLearningProgress(
          current,
          readLearningProgress(userId, courseKey),
        ),
      );
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [courseKey, storageIdentity, userId]);

  useEffect(() => {
    if (!serverProgress) return;
    setLocalState((current) =>
      mergeServerLearningProgress(current, serverProgress.lessons),
    );
  }, [serverProgress]);

  // A lesson can emit progress before the course overview finishes loading.
  // Once the UUID map is ready, attach those number-only records so they can
  // be synchronized without changing the UI's route-local lesson numbering.
  useEffect(() => {
    if (!lessonIdsByNumber) return;
    setLocalState((current) => {
      let changed = false;
      const items = current.items.flatMap((item) => {
        const lessonId = lessonIdsByNumber.get(item.lessonNumber);
        if (item.lessonId && lessonId && item.lessonId !== lessonId) {
          // A deleted/replaced lesson can reuse the same display number. Do
          // not show the old lesson's progress on the replacement.
          changed = true;
          return [];
        }
        if (item.lessonId || !lessonId) return [item];
        changed = true;
        return [{ ...item, lessonId }];
      });
      return changed ? { ...current, items } : current;
    });
  }, [lessonIdsByNumber]);

  const recordProgress = useCallback(
    (lessonNumber: number, progressPercent: number) => {
      setLocalState((current) =>
        recordLearningProgress(current, {
          lessonId: lessonIdsByNumber?.get(lessonNumber),
          lessonNumber,
          progressPercent,
        }),
      );
    },
    [lessonIdsByNumber],
  );

  const flushProgress = useCallback(
    async ({ keepalive = false }: FlushOptions = {}) => {
      if (!syncEnabled || !courseKey || isFlushingRef.current) return;
      if (!keepalive && Date.now() < retryAtRef.current) return;

      const pendingItems = getPendingLearningProgress(
        localStateRef.current,
      ).slice(0, MAX_BATCH_ITEMS);
      // A batch goes out for progress, for watch time, or for both: a
      // lesson replayed after it is complete moves no progress, but the
      // time spent playing it still counts towards the daily goal.
      if (pendingItems.length === 0 && peekWatchedSeconds(courseKey) < 1) {
        return;
      }

      // The seconds of video played since the last report. Taken from the
      // tally here and handed back below if the request fails.
      const watchedSeconds = takeWatchedSeconds(courseKey);
      const payload = {
        items: pendingItems.map(({ lessonId, progressPercent }) => ({
          lessonId,
          progressPercent,
        })),
        watchedSeconds,
        // Sets the learner's zone if they have never chosen one, so their
        // learning days are local days rather than UTC ones.
        timeZone: getDeviceTimeZone(),
      };
      if (
        keepalive &&
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const accepted = navigator.sendBeacon(
          learningProgressService.getSyncUrl(courseKey),
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
        if (accepted) return;
      }

      if (keepalive) {
        void learningProgressService
          .syncKeepalive(courseKey, payload)
          .catch(() => undefined);
        return;
      }

      isFlushingRef.current = true;
      try {
        const response = await learningProgressService.sync(courseKey, payload);
        if (response.synced) {
          setLocalState((current) =>
            markLearningProgressSynced(current, pendingItems),
          );
          // Today's goal ring and streak are built from this progress.
          void queryClient.invalidateQueries({
            queryKey: learningGoalKeys.summary(),
          });
        }
        retryDelayRef.current = 0;
        retryAtRef.current = 0;
      } catch {
        restoreWatchedSeconds(courseKey, watchedSeconds);
        // Keep the outbox dirty. The next interval/online event retries the
        // same compact idempotent batch without losing learner progress.
        retryDelayRef.current = Math.min(
          60_000,
          Math.max(5_000, retryDelayRef.current * 2),
        );
        retryAtRef.current = Date.now() + retryDelayRef.current;
      } finally {
        isFlushingRef.current = false;
      }
    },
    [courseKey, queryClient, syncEnabled],
  );

  useEffect(() => {
    if (!syncEnabled) return;

    const flush = () => void flushProgress();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const handlePageHide = () => {
      void flushProgress({ keepalive: true });
    };

    const interval = window.setInterval(flush, 15_000);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushProgress, syncEnabled]);

  const lessonProgress = useMemo(
    () => getLearningProgressMap(localState),
    [localState],
  );
  const pendingCount = localState.items.filter((item) => item.pending).length;
  useEffect(() => {
    if (pendingCount >= MAX_BATCH_ITEMS) void flushProgress();
  }, [flushProgress, pendingCount]);

  return {
    lessonProgress,
    pendingCount,
    recordProgress,
    flushProgress,
  };
}
