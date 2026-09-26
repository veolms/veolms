import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { prepareDocumentForHydration } from "./bootstrap/documentHydration";
import {
  installRouteIntentPrefetching,
  preloadActiveRouteForHydration,
} from "./routing/activeRoutePreload";

const initialPath = window.location.pathname;
const chunkReloadKey = `veolms:chunk-reload:${initialPath}`;
const clearChunkReloadGuard = () => {
  try {
    window.sessionStorage.removeItem(chunkReloadKey);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    if (window.sessionStorage.getItem(chunkReloadKey)) return;
    window.sessionStorage.setItem(chunkReloadKey, "1");
  } catch {
    return;
  }
  window.location.reload();
});

const scheduleChunkReloadGuardCleanup = () => {
  window.setTimeout(clearChunkReloadGuard, 5_000);
};
if (document.readyState === "complete") {
  scheduleChunkReloadGuardCleanup();
} else {
  window.addEventListener("load", scheduleChunkReloadGuardCleanup, {
    once: true,
  });
}

const isStandalonePublicCatalogueRoute = /^\/catalogue(?:\/|$)/.test(
  initialPath,
);
const needsSessionWarmup =
  !isStandalonePublicCatalogueRoute && initialPath !== "/auth/callback";
const sessionWarmup = needsSessionWarmup
  ? import("./routing/sessionWarmup")
      .then((module) => module.warmCurrentUserSession())
      .catch(() => null)
  : undefined;

// Warm only the active page's lazy code; other route chunks remain split and
// are fetched on intent. The shared session query overlaps this work and is
// reused by route guards and auth layouts.
void preloadActiveRouteForHydration(initialPath, sessionWarmup).catch(
  () => undefined,
);
installRouteIntentPrefetching();

const hydrateApplication = () => {
  // Extensions such as Dark Mode mutate the SSR document at document_start
  // and re-apply those mutations from a MutationObserver (a microtask).
  // hydrateRoot otherwise yields to the scheduler, so the observer would
  // dirty the tree again before React walked it. Park, hydrate synchronously,
  // then restore.
  const { hasForeignMutations, restore } = prepareDocumentForHydration();
  const hydrate = () => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  };
  try {
    // A clean document can hydrate in small tasks. Forcing the whole tree
    // synchronously is only required after extension nodes were parked, so
    // they cannot mutate the document again before React claims it.
    if (hasForeignMutations) flushSync(hydrate);
    else hydrate();
  } finally {
    restore();
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
