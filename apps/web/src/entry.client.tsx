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

// A lazy page body that is already in the prerendered document must have its
// module loaded before hydration, or React discards that markup and rebuilds
// it later (see routing/prerenderedBodies.tsx). The document preloads those
// modules, so this normally resolves at once; the timer keeps a slow or
// failed chunk from holding the rest of the page back.
const BODY_PRELOAD_BUDGET_MS = 2500;
const hydrateWhenBodiesReady = () => {
  const bodies = preloadPrerenderedBodies();
  if (!bodies) {
    hydrateApplication();
    return;
  }
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    hydrateApplication();
  };
  bodies.then(start, start);
  setTimeout(start, BODY_PRELOAD_BUDGET_MS);
};

// The generated route context is streamed through scripts at the end of the
// document. The async entry module can finish before the parser reaches those
// scripts, which briefly mounts the fallback route and then rebuilds the real
// deep link. Begin hydration as soon as parsing completes, without scheduling
// it as low-priority transition work.
if (document.readyState === "loading") {
  // The body modules can start loading while the document is still parsing.
  preloadPrerenderedBodies();
  document.addEventListener("DOMContentLoaded", hydrateWhenBodiesReady, {
    once: true,
  });
} else {
  hydrateWhenBodiesReady();
}
