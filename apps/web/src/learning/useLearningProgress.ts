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
  hasStoredLearningProgress,
  markLearningProgressSynced,
  mergeServerLearningProgress,
  mergeLocalLearningProgress,
  parseLearningProgress,
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
import {
  hasLessonPositions,
  refuseLessonPositions,
  restoreLessonPositions,
  takeLessonPositions,
  withLessonPositions,
} from "./lessonPositionOutbox";
import { getApiError } from "../lib/api-client";
import { markCourseResumeStale } from "./courseResumeCache";
import { readEarlyProgressCopy } from "../store/lessonEarlyState";
import {
  adoptServerLearningProgress,
  snapshotAnswersSyncedProgress,
} from "./syncedLearningProgress";

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
  // Read in the first render, a built page's hydration included: that page
  // is drawn with the kept progress before its scripts run (see
  // lessonPageEarlyState.ts), so the first render has to show the same
  // ("42% complete" on a lesson card) or React throws the whole page away
  // and draws it again. Whether a copy is held at all is what tells the
  // page the progress is known (`progressKnown`): an empty copy says the
  // learner had made none when it was written.
  // The copy as the document's head read it, when the head drew the page
  // from one (store/lessonEarlyState.ts): storage may have moved on since.
  const [localState, setLocalState] = useState<LocalLearningProgressState>(
    () => {
      const early = readEarlyProgressCopy(userId, courseKey);
      return early === undefined
        ? readLearningProgress(userId, courseKey)
        : parseLearningProgress(early);
    },
  );
  const heldInBrowser = useMemo(
    () => {
      const early = readEarlyProgressCopy(userId, courseKey);
      return early === undefined
        ? hasStoredLearningProgress(userId, courseKey)
        : early !== null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storageIdentity stands for the pair
    [storageIdentity],
  );
  // The identity the first render read storage for: the effect below need
  // not read it again for the same one.
  const readForIdentityRef = useRef<string | null | undefined>(storageIdentity);
  const localStateRef = useRef(localState);
  const lessonIdsByNumberRef = useRef(lessonIdsByNumber);
  useEffect(() => {
    lessonIdsByNumberRef.current = lessonIdsByNumber;
  }, [lessonIdsByNumber]);
  const isFlushingRef = useRef(false);
  const retryDelayRef = useRef(0);
  const retryAtRef = useRef(0);

  // When progress the server had already accepted was last taken into the
  // local copy (what storage held on load, what this page or another tab
  // synced), and when the latest snapshot request was sent. Together they
  // say whether a snapshot may lower synced progress; see
  // `syncedLearningProgress`.
  const syncedProgressKnownAtRef = useRef(0);
  const snapshotRequestedAtRef = useRef(0);

  const {
    data: serverProgress,
    dataUpdatedAt: snapshotReceivedAt,
    isFetching: isSnapshotFetching,
    isError: isSnapshotError,
  } = useLearningProgressSnapshot(courseKey ?? "", { enabled: syncEnabled });

  useEffect(() => {
    localStateRef.current = localState;
  }, [localState]);

  useEffect(() => {
    syncedProgressKnownAtRef.current = Date.now();
    if (readForIdentityRef.current === storageIdentity) {
      readForIdentityRef.current = undefined;
      return;
    }
    readForIdentityRef.current = undefined;
    setLocalState(
      storageIdentity
        ? readLearningProgress(userId, courseKey)
        : EMPTY_LEARNING_PROGRESS_STATE,
    );
  }, [courseKey, storageIdentity, userId]);

  // After the effect above on purpose: a request that starts as the stored
  // progress is loaded was sent after it.
  useEffect(() => {
    if (isSnapshotFetching) snapshotRequestedAtRef.current = Date.now();
  }, [isSnapshotFetching]);

  useEffect(() => {
    if (!storageIdentity) return;
    writeLearningProgress(userId, courseKey, localState);
  }, [courseKey, localState, storageIdentity, userId]);

  useEffect(() => {
    if (!storageIdentity || !userId || !courseKey) return;
    const storageKey = getLearningProgressStorageKey(userId, courseKey);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      syncedProgressKnownAtRef.current = Date.now();
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

  // The server's progress is merged in "higher wins", except from a
  // snapshot asked for after everything held as synced had been sent: that
  // one also brings down a lesson whose progress the server has cleared
  // (it had no video and was given one). `snapshotReceivedAt` is a
  // dependency so that a refetch answering the same figures is still read
  // as the newer answer it is.
  useEffect(() => {
    if (!serverProgress) return;
    const answersSyncedProgress = snapshotAnswersSyncedProgress({
      requestedAt: snapshotRequestedAtRef.current,
      receivedAt: snapshotReceivedAt,
      syncedProgressKnownAt: syncedProgressKnownAtRef.current,
    });
    setLocalState((current) =>
      answersSyncedProgress
        ? adoptServerLearningProgress(current, serverProgress.lessons)
        : mergeServerLearningProgress(current, serverProgress.lessons),
    );
  }, [serverProgress, snapshotReceivedAt]);

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
      const update = {
        lessonId: lessonIdsByNumber?.get(lessonNumber),
        lessonNumber,
        progressPercent,
        // Read once, here: the updater below may run more than once.
        clientUpdatedAt: new Date().toISOString(),
      };
      // React applies an update again when it rebases one it had skipped,
      // and may keep doing so render after render. Applied again to the
      // same state, this one gives back the very state it gave before, not
      // an equal copy, so nothing that depends on the progress sees a change
      // (a new copy on each replay fed a render loop on 2026-10-22, React
      // error #185).
      let appliedTo: LocalLearningProgressState | undefined;
      let result = EMPTY_LEARNING_PROGRESS_STATE;
      setLocalState((current) => {
        if (current !== appliedTo) {
          appliedTo = current;
          result = recordLearningProgress(current, update);
        }
        return result;
      });
    },
    [lessonIdsByNumber],
  );

  const flushProgress = useCallback(
    async ({ keepalive = false }: FlushOptions = {}) => {
      if (!syncEnabled || !courseKey || isFlushingRef.current) return;
      if (!keepalive && Date.now() < retryAtRef.current) return;

      const pending = getPendingLearningProgress(localStateRef.current);
      // A batch goes out for progress, for watch time, for where the
      // learner is in a video, or for any of them: a lesson replayed after
      // it is complete moves no progress, but the time spent playing it
      // still counts towards the daily goal, and it is where they are.
      if (
        pending.length === 0 &&
        peekWatchedSeconds(courseKey) < 1 &&
        !hasLessonPositions(courseKey)
      ) {
        return;
      }

      // The seconds of video played since the last report, and where the
      // learner is in each video played since. Taken here and handed back
      // below if the request fails.
      const watchedSeconds = takeWatchedSeconds(courseKey);
      const positions = takeLessonPositions(courseKey);
      const pendingItems = pending.slice(0, MAX_BATCH_ITEMS - positions.length);
      const items = withLessonPositions(
        pendingItems.map(({ lessonId, progressPercent }) => ({
          lessonId,
          progressPercent,
        })),
        positions,
        lessonIdsByNumberRef.current,
      );
      const payload = {
        items,
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
          syncedProgressKnownAtRef.current = Date.now();
          setLocalState((current) =>
            markLearningProgressSynced(current, pendingItems),
          );
          // Today's goal ring and streak are built from this progress.
          void queryClient.invalidateQueries({
            queryKey: learningGoalKeys.summary(),
          });
          if (items.some((item) => item.positionSeconds !== undefined)) {
            markCourseResumeStale(queryClient, courseKey);
          }
        }
        retryDelayRef.current = 0;
        retryAtRef.current = 0;
      } catch (error) {
        restoreWatchedSeconds(courseKey, watchedSeconds);
        // An API from before positions were kept turns the whole batch
        // down: it goes again without them.
        if (
          getApiError(error).status === 400 &&
          items.some((item) => item.positionSeconds !== undefined)
        ) {
          refuseLessonPositions();
        } else {
          restoreLessonPositions(courseKey, positions);
        }
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

  // Whether the progress shown is the learner's: kept in this browser, or
  // answered by the server. Nothing to wait for while there is no account
  // to keep it for, nor once the server has refused (a course the learner
  // is not in) or failed: there is nothing more to show then.
  const progressKnown =
    !syncEnabled ||
    heldInBrowser ||
    localState.items.length > 0 ||
    serverProgress !== undefined ||
    isSnapshotError;

  return {
    lessonProgress,
    progressKnown,
    pendingCount,
    recordProgress,
    flushProgress,
  };
}
