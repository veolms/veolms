import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { prepareDocumentForHydration } from "./bootstrap/documentHydration";
import {
  loginDialogBody,
  preloadPrerenderedBodies,
} from "./routing/prerenderedBodies";

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
// A prerendered page paints from inline critical CSS and loads the app's
// large stylesheets without blocking that paint (scripts/inline-critical-
// css.mjs marks them `data-deferred-style`). Hydration renders UI that is not
// in the prerendered markup and so has no inline rules, so it waits for
// those stylesheets; a stylesheet that never answers holds it back no longer
// than the budget.
const DEFERRED_STYLE_BUDGET_MS = 10_000;
const finishDeferredStylesheet = (link: HTMLLinkElement) => {
  if (link.media === "print") link.media = "all";
  // The full stylesheet now sits in the same place with every inline rule,
  // so the inline copy changes nothing; without it the head is the same as
  // with blocking links, and no copy outlives its link when the page that
  // links it is left.
  const href = link.getAttribute("href");
  if (!href) return;
  for (const style of document.head.querySelectorAll<HTMLStyleElement>(
    "style[data-critical-css]",
  )) {
    if (style.dataset.criticalCss === href) style.remove();
  }
};
const waitForDeferredStylesheets = (): Promise<void> | null => {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[data-deferred-style]"),
  );
  if (links.length === 0) return null;
  const pending = links.map(
    (link) =>
      new Promise<void>((resolve) => {
        if (link.sheet) {
          finishDeferredStylesheet(link);
          resolve();
          return;
        }
        link.addEventListener(
          "load",
          () => {
            finishDeferredStylesheet(link);
            resolve();
          },
          { once: true },
        );
        link.addEventListener("error", () => resolve(), { once: true });
      }),
  );
  return new Promise<void>((resolve) => {
    void Promise.all(pending).then(() => resolve());
    setTimeout(resolve, DEFERRED_STYLE_BUDGET_MS);
  });
};
const hydrateWhenReady = () => {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    hydrateApplication();
  };
  const bodies = preloadPrerenderedBodies() ?? Promise.resolve();
  const deferredStylesheets = waitForDeferredStylesheets();
  if (!deferredStylesheets) {
    Promise.all([bodies, waitForFirstFrame()]).then(start, start);
    setTimeout(start, BODY_PRELOAD_BUDGET_MS);
    return;
  }
  const bodiesOrBudget = new Promise<void>((resolve) => {
    Promise.all([bodies, waitForFirstFrame()]).then(
      () => resolve(),
      () => resolve(),
    );
    setTimeout(resolve, BODY_PRELOAD_BUDGET_MS);
  });
  void Promise.all([bodiesOrBudget, deferredStylesheets]).then(start);
};

// A page opened with the login pop-up asked for (`?login=1`, which is also
// where the login address leads) shows it as soon as the app has started.
// Its code is fetched alongside the app's instead of after it. The name is
// `LOGIN_DIALOG_PARAM`, written out so this entry does not import the
// routing rules for one word.
if (new URLSearchParams(window.location.search).has("login")) {
  void loginDialogBody.preload();
}

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
