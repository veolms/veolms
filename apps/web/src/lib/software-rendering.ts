/**
 * Whether this browser draws pages without a graphics card ("software
 * rendering"): Chrome with its GPU blocked for an old driver, common on
 * office laptops, or run with `--disable-gpu`.
 *
 * There the processor puts the page together for every frame, and what
 * costs nothing with a graphics card costs frames of the lesson video. A
 * small animation that never stops is the worst of it: each tick makes the
 * browser draw again everything between the animation and the video, which
 * on a lesson page is most of the window. With the festive lamps flickering
 * in the sidebar and the "now playing" bars moving in the lesson list, a
 * lesson at 2x showed 28 to 37 of its 60 frames a second, and 57 to 60 with
 * those animations still (Chrome 157, GPU off, 2026-11-10).
 *
 * So the page is marked, `data-rendering="software"` on the root element,
 * and decoration that loops for ever stands still there (the
 * `[:root[data-rendering=software]_&]:animate-none` classes). Nothing a
 * learner needs is an animation of that kind: loaders and spinners are not
 * touched.
 *
 * The browser has no direct answer to "is there a graphics card". Asking
 * for a WebGL context that must not be slow is the nearest: it is refused
 * exactly when WebGL would be drawn by the processor. Making that context
 * takes about 5 ms where it is refused and 45 ms where it is given, so it
 * is asked once per tab, when the browser is idle, and the answer is kept.
 */

const STORAGE_KEY = "veolms-rendering";

type Rendering = "software" | "gpu";

function remembered(): Rendering | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value === "software" || value === "gpu" ? value : null;
  } catch {
    return null;
  }
}

function detect(): Rendering {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl", {
      failIfMajorPerformanceCaveat: true,
    });
    if (!context) return "software";
    // Only the answer was wanted: the context is given back at once.
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return "gpu";
  } catch {
    return "software";
  }
}

/**
 * Marks `root` once it is known that the page is drawn in software. Returns
 * the function that calls the check off, should it not have run yet.
 */
export function markSoftwareRendering(root: HTMLElement): () => void {
  const apply = (rendering: Rendering) => {
    if (rendering === "software") root.dataset.rendering = "software";
  };
  const known = remembered();
  if (known) {
    apply(known);
    return () => undefined;
  }
  const check = () => {
    const rendering = detect();
    try {
      window.sessionStorage.setItem(STORAGE_KEY, rendering);
    } catch {
      // Private windows may refuse storage; the check runs again next time.
    }
    apply(rendering);
  };
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(check, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(check, 1500);
  return () => window.clearTimeout(handle);
}
