/**
 * When lesson progress goes to the server.
 *
 * While a video plays, a batch goes out once per interval: the server says
 * how long in each answer (`nextSyncSeconds`, normally 60 s) and raises it
 * to shed load in a spike. The batches are most of the API's writes, so
 * this one number sets most of the load a watching learner puts on it.
 *
 * What the learner would miss on another device goes out at once instead:
 * the players report activity many times a second while a video plays, and
 * once those reports stop for `IDLE_FLUSH_MS` (paused, ended, lesson left)
 * whatever was watched is sent. Hiding or leaving the page also sends at
 * once (useLearningProgress).
 */

const DEFAULT_SYNC_INTERVAL_MS = 60_000;
const MIN_SYNC_INTERVAL_MS = 15_000;
const MAX_SYNC_INTERVAL_MS = 600_000;
const IDLE_FLUSH_MS = 4_000;

let syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS;

export function getProgressSyncIntervalMs(): number {
  return syncIntervalMs;
}

/** Takes the interval a batch's answer names; an older API names none. */
export function adoptProgressSyncInterval(seconds: number | undefined): void {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return;
  syncIntervalMs = Math.min(
    MAX_SYNC_INTERVAL_MS,
    Math.max(MIN_SYNC_INTERVAL_MS, Math.round(seconds * 1000)),
  );
}

const idleListeners = new Set<() => void>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Called by the players with every report (watch time, position). Restarts
 * the wait after which the reports count as stopped.
 */
export function noteProgressActivity(): void {
  if (typeof window === "undefined" || idleListeners.size === 0) return;
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    for (const listener of idleListeners) listener();
  }, IDLE_FLUSH_MS);
}

/** Called once the reports have stopped; returns the unsubscribe. */
export function subscribeProgressIdle(listener: () => void): () => void {
  idleListeners.add(listener);
  return () => {
    idleListeners.delete(listener);
  };
}
