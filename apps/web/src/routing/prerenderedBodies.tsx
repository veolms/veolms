import { lazy, useState, type ComponentType } from "react";
import { GUEST_HOME_CHUNK_URL_PLACEHOLDER } from "./routeChunkPreloads";

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
 */
function definePrerenderedBody<Module, Props extends object>(
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

export const courseCatalogueBody = definePrerenderedBody(
  () => import("../courses/CourseCatalogue"),
  (module) => module.CourseCatalogue,
);

function documentPreloads(chunkUrl: string) {
  return [
    ...document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="modulepreload"]',
    ),
  ].some((link) => link.getAttribute("href") === chunkUrl);
}

/**
 * Starts loading the body the prerendered document contains, recognised by
 * the module preload it emits. Returns null when there is nothing to wait
 * for. Only the guest home is waited on: the catalogue's prerendered markup
 * was not being discarded, and holding hydration for it made /courses slower.
 */
export function preloadPrerenderedBodies(): Promise<unknown> | null {
  const pending: Promise<unknown>[] = [];
  // A browser that was signed in last time never shows the guest home; its
  // prerendered copy is hidden from the first paint, so nothing waits on it.
  if (
    documentPreloads(GUEST_HOME_CHUNK_URL_PLACEHOLDER) &&
    !document.documentElement.dataset.sessionHint
  ) {
    pending.push(guestHomeBody.preload());
  }
  return pending.length ? Promise.all(pending) : null;
}
