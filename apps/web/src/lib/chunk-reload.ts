/**
 * Recovery for a tab left open across a deploy.
 *
 * Screens are loaded on demand from hashed files. After a deploy the files
 * an old tab knows about no longer exist, so opening a lazy screen fails
 * and — with nothing handling it — the whole app was replaced by the
 * router's default error page until the user thought to reload.
 *
 * One reload fetches the new build. It is attempted once per short window
 * so a file that is genuinely missing cannot put the tab in a reload loop.
 */
const RELOAD_MARK_KEY = "veolms-chunk-reload-at";
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/iu;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR_PATTERN.test(error.message);
}

/** Reloads the page unless it was already reloaded for this a moment ago. */
export function reloadOnceForNewBuild(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARK_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    // Without session storage the attempt cannot be remembered, and an
    // unremembered reload could loop. Leave the error screen up instead.
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite reports a failed preload of a lazy chunk with this event. */
export function installChunkReloadHandler(): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadOnceForNewBuild()) event.preventDefault();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
