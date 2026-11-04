import { lazy, useState, type ComponentType } from "react";
import { authStore } from "../store/auth.store";
import { readHomeHint } from "../store/homeHint";
import { isSignedInSettingsTab, normalizeSettingsTab } from "./tabSessionState";
import {
  CATALOGUE_CHUNK_URL_PLACEHOLDER,
  COURSE_OVERVIEW_CHUNK_URL_PLACEHOLDER,
  GUEST_HOME_CHUNK_URL_PLACEHOLDER,
  LEARNING_PLAYER_HOST_CHUNK_URL_PLACEHOLDER,
} from "./routeChunkPreloads";

/**
 * A lazily loaded page body whose markup is already in the prerendered
 * document.
 *
 * React can only hydrate such a body once its module has loaded. Until then
 * the surrounding Suspense boundary stays dehydrated, and the first parent
 * re-render makes React give up on it: the prerendered markup is removed and
 * the body is rendered from scratch when the module finally arrives. On a
 * slow connection that blanked content which was already on screen for
 * seconds and pushed the largest paint out with it.
 *
 * `preload` loads the module ahead of hydration (see entry.client.tsx). Once
 * it has loaded, the body renders synchronously, so it hydrates with the
 * rest of the page and the prerendered markup is kept.
 *
 * The same holds for a page fetched ahead of a visit: once its module is
 * here it renders at once, where a bare `lazy()` shows its fallback for a
 * moment even then.
 */
export function definePrerenderedBody<Module, Props extends object>(
  load: () => Promise<Module>,
  pick: (module: Module) => ComponentType<Props>,
) {
  let loaded: ComponentType<Props> | null = null;
  let pending: Promise<ComponentType<Props>> | null = null;
  const preload = () => {
    pending ??= load().then((module) => {
      loaded = pick(module);
      return loaded;
    });
    return pending;
  };
  const Lazy = lazy(() =>
    preload().then((component) => ({ default: component })),
  );

  function Body(props: Props) {
    // Decided once per mount: switching component type later would remount.
    const [Ready] = useState(() => loaded);
    return Ready ? <Ready {...props} /> : <Lazy {...props} />;
  }

  return { Body, preload };
}

export const guestHomeBody = definePrerenderedBody(
  () => import("../GuestHome"),
  (module) => module.GuestHome,
);

// The signed-in learner's home. A reload of it puts the home up as it was
// last drawn before any of this runs (see home/learner/learnerHomeSnapshot.ts),
// and the page's own takes its place as soon as it has hydrated: both
// modules are loaded first, so that it does so at once, already filled in
// from the tab's copies, and not by way of its placeholders.
export const authenticatedHomeBody = definePrerenderedBody(
  () => import("../home/AuthenticatedHomeBoundary"),
  (module) => module.AuthenticatedHomeBoundary,
);

export const learnerHomeBody = definePrerenderedBody(
  () => import("../home/learner/LearnerHome"),
  (module) => module.LearnerHome,
);

export const courseCatalogueBody = definePrerenderedBody(
  () => import("../courses/CourseCatalogue"),
  (module) => module.CourseCatalogue,
);

// A course's own page. It is built into the document whole (the title, the
// curriculum, the About text), and nothing stood in for it while its code
// loaded: React removed the built page as soon as anything re-rendered and
// drew it again when the code arrived, so the page blinked empty in between.
export const courseOverviewBody = definePrerenderedBody(
  () => import("../courses/CourseOverviewPage"),
  (module) => module.CourseOverviewPage,
);

// Fetched ahead of a visit by the shell (see its warm-up effect), so that
// opening them shows the page and not a placeholder for it.
export const settingsPageBody = definePrerenderedBody(
  // With the signed-in sections when the browser looks signed in (see
  // SettingsPage.tsx). Their request starts alongside the page's. The page
  // waits for them only when the address opens on one of them; on the other
  // tabs nothing of theirs is drawn, so it does not hold the page up.
  () => {
    const page = import("../SettingsPage");
    if (!authStore.hasSessionHint()) return page;
    void import("../settings/SignedInSettingsTab").catch(() => undefined);
    const sections = page
      .then((module) => module.preloadSignedInSettings())
      .catch(() => undefined);
    const tab = /^\/settings\/([^/]+)/.exec(window.location.pathname)?.[1];
    return isSignedInSettingsTab(normalizeSettingsTab(tab))
      ? sections.then(() => page)
      : page;
  },
  (module) => module.SettingsPage,
);

export const workspacePageBody = definePrerenderedBody(
  () => import("../workspace/WorkspacePages"),
  (module) => module.WorkspacePage,
);

// The dashboard. Its code is fetched while the session is checked (see the
// shell's warm-up effect), so that when the checks are done it takes its
// placeholder's place at once.
export const creatorDashboardBody = definePrerenderedBody(
  () => import("../CreatorDashboard"),
  (module) => module.CreatorDashboard,
);

// The login pop-up. Fetched with the app when the address asks for it (see
// entry.client.tsx) and while the login address checks the session, so it
// opens with the page and not a moment after it.
export const loginDialogBody = definePrerenderedBody(
  () => import("../auth/LoginDialog"),
  (module) => module.default,
);

// The lesson's video player, kept by the shell across pages. A bare `lazy()`
// held it back even when its code had been fetched ahead (the learner home
// does so for its hero lesson): it showed its empty fallback first, and React
// then waits about 300 ms before replacing a fallback, so the lesson page
// stood with a black box where the video goes.
export const persistentLearningPlayerHostBody = definePrerenderedBody(
  () => import("../learning/player/PersistentLearningPlayerHost"),
  (module) => module.PersistentLearningPlayerHost,
);

function documentPreloads(chunkUrl: string) {
  // Anywhere in the document, not only <head>: the link may still be on its
  // way there when this runs.
  return [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'),
  ].some((link) => link.getAttribute("href") === chunkUrl);
}

/**
 * Starts loading the bodies the prerendered document contains, recognised by
 * the module preload each one emits. Returns null when there is nothing to
 * wait for.
 */
export function preloadPrerenderedBodies(): Promise<unknown> | null {
  const pending: Promise<unknown>[] = [];
  // A browser that was signed in last time never shows the guest home; its
  // prerendered copy is hidden from the first paint, so nothing waits on it.
  // The dev server's document is not prerendered and carries no preloads, but
  // it is handed the home page's data (see loadDevelopmentHomePageData), so
  // the page renders on the first pass there too. Loading its module first
  // keeps that pass from showing the loading state while the module arrives.
  const isDevelopmentHome =
    import.meta.env.DEV && ["/", "/home"].includes(window.location.pathname);
  // A learner who had no courses last time is the exception: their home is
  // the guest home with a greeting, and it is what the first paint shows.
  if (
    (isDevelopmentHome || documentPreloads(GUEST_HOME_CHUNK_URL_PLACEHOLDER)) &&
    (!document.documentElement.dataset.sessionHint ||
      readHomeHint() === "new-learner")
  ) {
    pending.push(guestHomeBody.preload());
  }
  // A learner who was signed in last time, whose home lists their courses:
  // the page takes over from what the first paint showed right after
  // hydrating (see authenticatedHomeBody).
  if (
    (isDevelopmentHome || documentPreloads(GUEST_HOME_CHUNK_URL_PLACEHOLDER)) &&
    document.documentElement.dataset.sessionHint &&
    readHomeHint() === null
  ) {
    pending.push(authenticatedHomeBody.preload(), learnerHomeBody.preload());
  }
  if (documentPreloads(CATALOGUE_CHUNK_URL_PLACEHOLDER)) {
    pending.push(courseCatalogueBody.preload());
  }
  // The dev server's document is handed the course (see
  // loadDevelopmentHomePageData), so there too the page can be drawn on the
  // first pass once its module is in.
  const isDevelopmentCoursePage =
    import.meta.env.DEV &&
    /^\/courses\/[^/]+\/overview\/?$/u.test(window.location.pathname);
  if (
    isDevelopmentCoursePage ||
    documentPreloads(COURSE_OVERVIEW_CHUNK_URL_PLACEHOLDER)
  ) {
    pending.push(courseOverviewBody.preload());
  }
  // A lesson page's video player host: mounted by the academy layout the
  // moment the hydrated page registers its player, so its module must be
  // in by then, or the player's body suspends on it and React holds the
  // player back for its fallback throttle (see routeChunkPreloads.ts).
  const isDevelopmentLessonPage =
    import.meta.env.DEV && window.location.pathname.startsWith("/learn/");
  if (
    isDevelopmentLessonPage ||
    documentPreloads(LEARNING_PLAYER_HOST_CHUNK_URL_PLACEHOLDER)
  ) {
    pending.push(persistentLearningPlayerHostBody.preload());
  }
  return pending.length ? Promise.all(pending) : null;
}
