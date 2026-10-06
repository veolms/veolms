import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { prepareDocumentForHydration } from "./bootstrap/documentHydration";

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
// this runs. Hydrating synchronously the moment parsing ends would instead
// occupy the main thread ahead of the first paint and hold the visible page
// (and its largest image) back behind work that changes nothing on screen.
// Let that first frame out, then hydrate.
const hydrateAfterFirstPaint = () => {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    hydrateApplication();
  };
  // A background tab renders no frames; nothing is being held back there.
  if (document.visibilityState !== "visible") {
    start();
    return;
  }
  // The frame callback runs just before the paint; the task queued from it
  // runs just after. The timer covers a frame that never comes.
  requestAnimationFrame(() => setTimeout(start, 0));
  setTimeout(start, 1500);
};

// The generated route context is streamed through scripts at the end of the
// document. The async entry module can finish before the parser reaches those
// scripts, which briefly mounts the fallback route and then rebuilds the real
// deep link. Wait for parsing to complete before hydrating.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateAfterFirstPaint, {
    once: true,
  });
} else {
  hydrateAfterFirstPaint();
}
