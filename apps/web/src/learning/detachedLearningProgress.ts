import { getDeviceTimeZone } from "../lib/device-time-zone";
import { learningProgressService } from "../services/learning-progress";
import {
  getPendingLearningProgress,
  markLearningProgressSynced,
  readLearningProgress,
  recordLearningProgress,
  writeLearningProgress,
} from "./learningProgressStorage";

/**
 * Progress recording for a lesson that is playing with no lesson page mounted
 * — the mini player.
 *
 * `useLearningProgress` belongs to the lesson page. Once that page unmounts,
 * the callback it gave the player updates nothing, so whatever was watched in
 * the mini player went unrecorded. This writes to the same per-user,
 * per-course store the hook reads, and sends the same idempotent batch, so
 * the lesson page picks the progress up when it next opens.
 */
export interface DetachedProgressTarget {
  userId: string;
  courseKey: string;
  lessonIdsByNumber?: ReadonlyMap<number, string>;
}

const SYNC_INTERVAL_MS = 15_000;
const MAX_BATCH_ITEMS = 100;

const lastSyncAtByCourse = new Map<string, number>();
const syncingCourses = new Set<string>();

async function syncDetachedLearningProgress(
  { userId, courseKey }: DetachedProgressTarget,
  force: boolean,
): Promise<void> {
  const identity = `${userId}\u0000${courseKey}`;
  if (syncingCourses.has(identity)) return;
  const lastSyncAt = lastSyncAtByCourse.get(identity) ?? 0;
  if (!force && Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return;

  const pendingItems = getPendingLearningProgress(
    readLearningProgress(userId, courseKey),
  ).slice(0, MAX_BATCH_ITEMS);
  if (pendingItems.length === 0) return;

  syncingCourses.add(identity);
  lastSyncAtByCourse.set(identity, Date.now());
  try {
    const response = await learningProgressService.sync(courseKey, {
      items: pendingItems.map(({ lessonId, progressPercent }) => ({
        lessonId,
        progressPercent,
      })),
      timeZone: getDeviceTimeZone(),
    });
    if (response.synced) {
      writeLearningProgress(
        userId,
        courseKey,
        markLearningProgressSynced(
          readLearningProgress(userId, courseKey),
          pendingItems,
        ),
      );
    }
  } catch {
    // The items stay pending in storage; the next update or the lesson page
    // sends the same batch again.
  } finally {
    syncingCourses.delete(identity);
  }
}

export function recordDetachedLearningProgress(
  target: DetachedProgressTarget,
  lessonNumber: number,
  progressPercent: number,
): void {
  const { userId, courseKey, lessonIdsByNumber } = target;
  const current = readLearningProgress(userId, courseKey);
  const next = recordLearningProgress(current, {
    lessonId: lessonIdsByNumber?.get(lessonNumber),
    lessonNumber,
    progressPercent,
  });
  if (next === current) return;

  writeLearningProgress(userId, courseKey, next);
  // A finished lesson is sent at once; anything else on the usual interval.
  void syncDetachedLearningProgress(target, Math.round(progressPercent) >= 100);
}
