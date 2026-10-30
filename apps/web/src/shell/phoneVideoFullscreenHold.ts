import { getDocumentFullscreenElement } from "../fullscreen";
import { COMPACT_NAVIGATION_QUERY } from "./sidebarVisibility";

/**
 * A video played full screen on a phone turns the screen sideways, wider
 * than the phone layout (640px). The app behind the video must not switch
 * to its wide layout for that: the switch re-rendered the whole app (2.7s
 * on a Redmi Note 10 Pro in development), the phone could draw nothing
 * meanwhile and the screen stayed black; and on the way out the wide
 * layout showed, sidebar and all, until the phone was upright again.
 *
 * So while such a video is full screen, the layout is held: the listeners
 * that switch the app between its phone and wide layouts wait (see
 * `watchLayoutQuery`), and catch up once the hold ends; a query read
 * through `layoutQueryMatches` keeps the answer it had when the hold
 * began. The hold ends when the video has left full screen and the screen
 * is phone-sized again. Until then only the video shows, still filling the
 * screen (see `[data-phone-video-leaving]` in player.css), so the page never
 * appears sideways; a phone the viewer keeps sideways for
 * `RELEASE_TIMEOUT_MS` gets the page back, still in the phone layout (see
 * `uncover`).
 */
const RELEASE_TIMEOUT_MS = 2_000;
const HELD_ATTRIBUTE = "data-phone-layout-held";
const LEAVING_ATTRIBUTE = "data-phone-video-leaving";
const LEAVING_SURFACE_ATTRIBUTE = "data-phone-video-leaving-surface";

let held = false;
let leavingSurface: Element | null = null;
let releaseTimer: number | null = null;
let installed = 0;
let uninstall: (() => void) | null = null;
const releaseListeners = new Set<() => void>();
// Queries read through `layoutQueryMatches`, and their answers when the
// hold began.
const layoutQueries = new Map<string, MediaQueryList>();
const heldAnswers = new Map<string, boolean>();

export function isPhoneLayoutHeld(): boolean {
  return held;
}

/** The media query list for `query`, kept so the hold can freeze it. */
export function layoutQuery(query: string): MediaQueryList {
  let media = layoutQueries.get(query);
  if (!media) {
    media = window.matchMedia(query);
    layoutQueries.set(query, media);
  }
  return media;
}

/** Whether `media` matches; while the layout is held, as when it began. */
export function layoutQueryMatches(media: MediaQueryList): boolean {
  if (held) {
    const answer = heldAnswers.get(media.media);
    if (answer !== undefined) return answer;
  }
  return media.matches;
}

function startHold(): void {
  held = true;
  // The lesson behind the video is not laid out meanwhile (see player.css):
  // a wider layout re-measured its discussion feed and re-rendered every
  // comment during the turn.
  document.documentElement.setAttribute(HELD_ATTRIBUTE, "");
  heldAnswers.clear();
  for (const [query, media] of layoutQueries) {
    heldAnswers.set(query, media.matches);
  }
}

function isVideoSurface(element: Element): boolean {
  return (
    element instanceof HTMLVideoElement ||
    element.querySelector("video") !== null
  );
}

function clearLeaving(): void {
  document.documentElement.removeAttribute(LEAVING_ATTRIBUTE);
  leavingSurface?.removeAttribute(LEAVING_SURFACE_ATTRIBUTE);
  leavingSurface = null;
}

function release(): void {
  if (!held) return;
  held = false;
  heldAnswers.clear();
  document.documentElement.removeAttribute(HELD_ATTRIBUTE);
  if (releaseTimer !== null) window.clearTimeout(releaseTimer);
  releaseTimer = null;
  // The page catches up first; the video steps back into it a frame later,
  // once the upright layout is drawn.
  for (const listener of [...releaseListeners]) listener();
  window.requestAnimationFrame(clearLeaving);
}

/**
 * A phone kept sideways after its video left full screen: the page shows
 * again, laid out, but still in the phone layout, which the hold keeps until
 * the screen is upright (`releaseWhenUpright`). Let go here, the wide layout
 * took over, sidebar and all, and stayed until the phone was turned back,
 * so turning it upright a moment later showed the desktop sidebar on the way.
 */
function uncover(): void {
  releaseTimer = null;
  document.documentElement.removeAttribute(HELD_ATTRIBUTE);
  clearLeaving();
}

function install(): () => void {
  const compact = window.matchMedia(COMPACT_NAVIGATION_QUERY);
  let fullscreenSurface: Element | null = null;

  const releaseWhenUpright = () => {
    if (held && !getDocumentFullscreenElement(document) && compact.matches) {
      release();
    }
  };

  const handleFullscreenChange = () => {
    const element = getDocumentFullscreenElement(document);
    if (element) {
      fullscreenSurface = element;
      // Only a video entered from the phone layout; a tablet or a page put
      // full screen keeps following the screen.
      if (!held && compact.matches && isVideoSurface(element)) {
        startHold();
      }
      if (held) {
        clearLeaving();
        document.documentElement.setAttribute(HELD_ATTRIBUTE, "");
        if (releaseTimer !== null) window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      return;
    }
    if (!held) return;
    if (compact.matches) {
      release();
      return;
    }
    // Still sideways: only the video shows until the screen turns upright,
    // or for `RELEASE_TIMEOUT_MS` at most.
    leavingSurface = fullscreenSurface;
    leavingSurface?.setAttribute(LEAVING_SURFACE_ATTRIBUTE, "");
    document.documentElement.setAttribute(LEAVING_ATTRIBUTE, "");
    releaseTimer = window.setTimeout(uncover, RELEASE_TIMEOUT_MS);
  };

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  compact.addEventListener("change", releaseWhenUpright);
  return () => {
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange,
    );
    compact.removeEventListener("change", releaseWhenUpright);
    release();
    clearLeaving();
  };
}

/** Starts holding the layout for phone video full screen; returns a stop. */
export function installPhoneVideoFullscreenHold(): () => void {
  if (typeof window === "undefined") return () => undefined;
  installed += 1;
  if (installed === 1) uninstall = install();
  return () => {
    installed -= 1;
    if (installed === 0) {
      uninstall?.();
      uninstall = null;
    }
  };
}

/** Calls `listener` each time a hold ends. */
export function onPhoneLayoutRelease(listener: () => void): () => void {
  releaseListeners.add(listener);
  return () => {
    releaseListeners.delete(listener);
  };
}

/**
 * Calls `onChange` when `media` changes, except while the layout is held:
 * then once, when the hold ends, if it changed meanwhile.
 */
export function watchLayoutQuery(
  media: MediaQueryList,
  onChange: () => void,
): () => void {
  return watchLayoutChange(media, "change", onChange);
}

/** As `watchLayoutQuery`, for a window `resize` listener. */
export function watchLayoutResize(onResize: () => void): () => void {
  return watchLayoutChange(window, "resize", onResize);
}

function watchLayoutChange(
  target: EventTarget,
  type: string,
  onChange: () => void,
): () => void {
  let missed = false;
  const handle = () => {
    if (held) {
      missed = true;
      return;
    }
    onChange();
  };
  const catchUp = () => {
    if (!missed) return;
    missed = false;
    onChange();
  };
  target.addEventListener(type, handle);
  releaseListeners.add(catchUp);
  return () => {
    target.removeEventListener(type, handle);
    releaseListeners.delete(catchUp);
  };
}
