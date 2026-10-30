import { useEffect, useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

/** In case no frame comes (a tab opened in the background). */
const LATEST_MS = 400;

/**
 * False on the render that mounts a lesson page opened inside the app, and
 * true from just after that page has been painted.
 *
 * A lesson page drawn whole in one go spent about 0.3 s of style and layout
 * before anything of it reached the screen, the video included. What is
 * drawn under this waits for the page's first paint, so the video comes
 * first and the rest follows a frame later. Not as a transition: the
 * video's start-up and the page's requests kept interrupting that, and the
 * course's lessons came half a second after the video.
 *
 * A page being built, or hydrated, is true from the start: it must draw
 * what it was built with. (The server's snapshot is what React reads while
 * hydrating, also for a part that hydrates after the rest.)
 */
export function useShownAfterFirstPaint() {
  const hydrating = useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true,
  );
  const [shown, setShown] = useState(hydrating);
  useEffect(() => {
    if (shown) return undefined;
    let frame = 0;
    let timer = 0;
    const show = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      setShown(true);
    };
    // A frame callback runs before that frame is painted; a task queued
    // from it runs after.
    frame = window.requestAnimationFrame(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(show, 0);
    });
    timer = window.setTimeout(show, LATEST_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [shown]);
  return shown;
}
