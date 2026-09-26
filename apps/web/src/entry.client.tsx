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

// The generated route context is streamed through scripts at the end of the
// document. The async entry module can finish before the parser reaches those
// scripts, which briefly mounts the fallback route and then rebuilds the real
// deep link. Begin hydration as soon as parsing completes, without scheduling
// it as low-priority transition work.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateApplication, {
    once: true,
  });
} else {
  hydrateApplication();
}
