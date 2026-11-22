/**
 * Marks the page while a lesson video plays: `data-lesson-playing` on the
 * root element, so that decoration which loops for ever stands still then
 * (the `[:root[data-lesson-playing]_&]:animate-none` classes), as it does on
 * a page drawn without a graphics card (see `software-rendering.ts`).
 *
 * Each tick of such an animation makes the browser put the window together
 * again, and a fast lesson needs every one of those moments for its own
 * frames. With the Diwali fountain sparkling in the sidebar, a lesson at 16x
 * stood still about 2 s in every 11 (13.1x), with 480 s of it already
 * downloaded; with the sparks still it played at 15.9x without a stop
 * (Chrome 156 with a graphics card, 1080p, 2026-11-21). YouTube's page,
 * which has nothing looping, played the same video at 16x without a stop.
 *
 * Only the lesson players count (the page's player and its mini player,
 * both inside `[data-learning-persistent-player]`): the muted hero video on
 * the home page loops all the time, and the greeting beside it is meant to
 * move.
 */

const LESSON_PLAYERS = "[data-learning-persistent-player]";

function lessonVideoPlaying(): boolean {
  for (const video of document.querySelectorAll<HTMLVideoElement>(
    `${LESSON_PLAYERS} video`,
  )) {
    if (!video.paused && !video.ended) return true;
  }
  return false;
}

/** Starts marking `root`; returns the function that stops it. */
export function markLessonPlaying(root: HTMLElement): () => void {
  const update = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLVideoElement)) return;
    if (!target.closest(LESSON_PLAYERS)) return;
    const playing = lessonVideoPlaying();
    // Written only when it changes: an attribute other rules read,
    // rewritten for nothing, makes the browser look at them again.
    if (playing === root.hasAttribute("data-lesson-playing")) return;
    if (playing) root.setAttribute("data-lesson-playing", "");
    else root.removeAttribute("data-lesson-playing");
  };
  // Media events do not bubble; they reach a capturing listener.
  const events = ["play", "pause", "ended", "emptied"] as const;
  for (const name of events) document.addEventListener(name, update, true);
  return () => {
    for (const name of events) {
      document.removeEventListener(name, update, true);
    }
    root.removeAttribute("data-lesson-playing");
  };
}
