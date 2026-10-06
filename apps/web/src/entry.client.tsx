import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { prepareDocumentForHydration } from "./bootstrap/documentHydration";
import { preloadPrerenderedBodies } from "./routing/prerenderedBodies";

const hydrateApplication = () => {
  // Extensions such as Dark Mode mutate the SSR document at document_start
  // and re-apply those mutations from a MutationObserver (a microtask).
  // hydrateRoot otherwise yields to the scheduler, so the observer would
  // dirty the tree again before React walked it. Park, hydrate synchronously,
  // then restore.
  const restoreDocumentAfterHydration = prepareDocumentForHydration();
  try {
    flushSync(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <HydratedRouter />
        </StrictMode>,
      );
    });
  } finally {
    restoreDocumentAfterHydration();
  }
};

// The document is prerendered, so its content can be on screen before any of
// this runs. Two things have to hold before hydrating:
//
// - A lazy page body that is already in the prerendered document must have
//   its module loaded, or React discards that markup and rebuilds it later
//   (see routing/prerenderedBodies.tsx). The document preloads those
//   modules, so this normally resolves at once.
// - The first frame should be out. Hydrating synchronously the moment
//   parsing ends occupies the main thread ahead of the first paint and holds
//   the visible page (and its largest image) back behind work that changes
//   nothing on screen.
//
// The timers keep a slow chunk, or a frame that never comes, from holding
// the page back.
const BODY_PRELOAD_BUDGET_MS = 2500;
const FIRST_FRAME_BUDGET_MS = 1500;
const waitForFirstFrame = () =>
  new Promise<void>((resolve) => {
    // A background tab renders no frames; nothing is being held back there.
    if (document.visibilityState !== "visible") {
      resolve();
      return;
    }
    // The frame callback runs just before the paint; the task queued from
    // it runs just after.
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, FIRST_FRAME_BUDGET_MS);
  });
const hydrateWhenReady = () => {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    hydrateApplication();
  };
  const bodies = preloadPrerenderedBodies() ?? Promise.resolve();
  Promise.all([bodies, waitForFirstFrame()]).then(start, start);
  setTimeout(start, BODY_PRELOAD_BUDGET_MS);
};

// The generated route context is streamed through scripts at the end of the
// document. The async entry module can finish before the parser reaches those
// scripts, which briefly mounts the fallback route and then rebuilds the real
// deep link. Wait for parsing to complete, and do not schedule hydration as
// low-priority transition work.
if (document.readyState === "loading") {
  // The body modules can start loading while the document is still parsing.
  preloadPrerenderedBodies();
  document.addEventListener("DOMContentLoaded", hydrateWhenReady, {
    once: true,
  });
} else {
  hydrateWhenReady();
}
