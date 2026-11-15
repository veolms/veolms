import { useEffect, useRef } from "react";

import { reloadOnceForNewBuild } from "../../lib/chunk-reload";

/** How often an open lesson tab asks whether its player is still current. */
const CHECK_EVERY_MS = 20 * 60_000;
/** A tab hidden this long and come back paused is reloaded on return. */
const AWAY_LONG_ENOUGH_MS = 10 * 60_000;

/**
 * This module's own file. After a deploy that changed it, the old hashed
 * file is gone from the site (a 404): the tab runs a player that is no
 * longer the current one. A deploy that left it as it was keeps the file,
 * and nothing is reloaded for it.
 */
const OWN_FILE = import.meta.url;

let stale = false;
let checking: Promise<void> | null = null;

function checkForNewPlayer(): Promise<void> {
  if (stale || checking || typeof window === "undefined") {
    return checking ?? Promise.resolve();
  }
  if (!/^https?:/u.test(OWN_FILE) || !/\/assets\//u.test(OWN_FILE)) {
    // A development server or a test: files are not hashed there.
    return Promise.resolve();
  }
  checking = fetch(OWN_FILE, { method: "HEAD", cache: "no-store" })
    .then((response) => {
      if (response.status === 404) stale = true;
    })
    .catch(() => {
      // Offline or a blip: nothing is known, nothing is done.
    })
    .finally(() => {
      checking = null;
    });
  return checking;
}

/**
 * Brings a lesson tab left open across a deploy onto the new player.
 *
 * Learners keep a lesson open for hours. A fix to the player reached none
 * of them until they reloaded: on the evening of 15 Nov, 144 of the 244
 * segment downloads cut since that day's release were still cut at the old
 * 4 s limit, by tabs opened before it. The tab now looks every 20 minutes
 * (and when it comes back into view) whether its player file is still the
 * site's; once it is not, the page reloads at a moment that costs nothing:
 * when the learner opens another lesson (the address is already the new
 * lesson's), or on coming back after ten minutes or more away from a
 * paused video. Never in the middle of a lesson. `reloadOnceForNewBuild`
 * keeps it to one reload a minute, so a missing file cannot loop.
 */
export function usePlayerBuildRefresh(
  lessonKey: string | number | null,
  isPaused: () => boolean,
): void {
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const lastLessonRef = useRef(lessonKey);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void checkForNewPlayer();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkForNewPlayer();
    }, CHECK_EVERY_MS);
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      void checkForNewPlayer().then(() => {
        if (stale && away >= AWAY_LONG_ENOUGH_MS && isPausedRef.current()) {
          reloadOnceForNewBuild();
        }
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const previous = lastLessonRef.current;
    lastLessonRef.current = lessonKey;
    if (previous === null || lessonKey === null || previous === lessonKey) {
      return;
    }
    if (stale) reloadOnceForNewBuild();
  }, [lessonKey]);
}
