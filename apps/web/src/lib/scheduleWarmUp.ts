/**
 * Work a page does ahead of need (another page's code, a dialog, data for
 * where the visitor may go next) once the browser is idle, but never while a
 * lesson's video is still waiting for its first frame.
 *
 * "Idle" came with a timeout of 2–6 s, so on a slow connection these
 * warm-ups ran while the learner looked at a black player: on a lesson at
 * 3 Mbps, 0.9 MB of Settings, Discussions, the course catalogue, the guest
 * home page and the login dialog downloaded alongside the video's first
 * segment, about 2.4 s of it (3.9 s at 1.5 Mbps; measured 12 Nov 2026).
 */

/** The longest a warm-up waits for a video to start. */
const VIDEO_START_WAIT_CAP_MS = 30_000;

let videoStart: Promise<void> | null = null;

/**
 * Says a lesson's video is being started (its preload has begun): warm-ups
 * wait until some video can play (or failed), or for at most 30 s.
 */
export function noteVideoStartPending(): void {
  if (videoStart || typeof document === "undefined") return;
  videoStart = new Promise<void>((resolve) => {
    const done = () => {
      for (const type of EVENTS) document.removeEventListener(type, done, true);
      window.clearTimeout(cap);
      videoStart = null;
      resolve();
    };
    // Media events do not bubble, but a capturing listener on the document
    // sees them for every video on the page.
    const EVENTS = ["canplay", "playing", "error"] as const;
    for (const type of EVENTS) document.addEventListener(type, done, true);
    const cap = window.setTimeout(done, VIDEO_START_WAIT_CAP_MS);
  });
}

/**
 * Runs `warm` once the browser is idle (or after `timeoutMs`) and no
 * lesson video is waiting to start. Returns a function that cancels it.
 */
export function scheduleWarmUp(
  warm: () => void,
  timeoutMs: number,
): () => void {
  let cancelled = false;
  let idleHandle = 0;
  let timerHandle = 0;
  const whenIdle = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(
        () => {
          if (!cancelled) warm();
        },
        { timeout: timeoutMs },
      );
    } else {
      timerHandle = window.setTimeout(
        () => {
          if (!cancelled) warm();
        },
        Math.round(timeoutMs / 2),
      );
    }
  };
  if (videoStart) void videoStart.then(whenIdle);
  else whenIdle();
  return () => {
    cancelled = true;
    if (idleHandle) window.cancelIdleCallback?.(idleHandle);
    if (timerHandle) window.clearTimeout(timerHandle);
  };
}
