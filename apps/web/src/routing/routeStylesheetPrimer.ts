/**
 * Has a route's stylesheets in the document, switched off, before the app
 * goes to that route, so the page it leaves is not restyled while it goes.
 *
 * Before React Router renders a route, it waits for the route's stylesheets
 * by linking each one into the page, for real, and unlinking it when it has
 * loaded; the route's own links come with the route a moment later. Each of
 * those comes and goes restyles the whole page being left. On a signed-in
 * home on its way to a lesson that was about 45 ms per stylesheet (three of
 * them), all before the lesson page could even start to render.
 *
 * React Router does not wait for a stylesheet that is already linked. So
 * these links are put in first, with `media="not all"`: loaded, but never
 * applied, so they cost the page nothing. They are taken out again once the
 * route's own links have arrived. They must not stay: Vite's chunk loader
 * also takes a linked stylesheet for one in use, and would not link it for
 * a page that needs it later.
 *
 * Resolves once they have loaded (or failed), so a navigation that waits
 * for it never draws the new page unstyled. After `timeoutMs` it resolves
 * anyway, and takes out the ones still loading: React Router then waits for
 * those itself, as it would have.
 */
export function primeRouteStylesheets(
  routeId: string,
  { timeoutMs = 300 }: { timeoutMs?: number } = {},
): Promise<void> {
  const manifest = (window as { __reactRouterManifest?: RouteManifest })
    .__reactRouterManifest;
  const hrefs = manifest?.routes?.[routeId]?.css ?? [];
  const pending: Promise<void>[] = [];
  const primers: HTMLLinkElement[] = [];
  const loading = new Set<HTMLLinkElement>();
  for (const href of hrefs) {
    if (findStylesheet(href)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.media = "not all";
    link.href = href;
    link.dataset.routeStylesheetPrimer = "";
    loading.add(link);
    pending.push(
      new Promise((resolve) => {
        link.onload = link.onerror = () => {
          loading.delete(link);
          resolve();
        };
      }),
    );
    primers.push(link);
    document.head.append(link);
  }
  if (!primers.length) return Promise.resolve();
  removeOnceReplaced(primers);
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      for (const link of loading) link.remove();
      resolve();
    }, timeoutMs);
    void Promise.all(pending).then(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

interface RouteManifest {
  routes?: Record<string, { css?: string[] } | undefined>;
}

function findStylesheet(href: string) {
  return [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ].find((link) => link.getAttribute("href") === href);
}

/** How long a primer may wait for its route that never came. */
const PRIMER_LIFETIME_MS = 10_000;

function removeOnceReplaced(primers: HTMLLinkElement[]) {
  let left = primers;
  const sweep = () => {
    left = left.filter((primer) => {
      const replaced = [
        ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      ].some(
        (link) =>
          link !== primer &&
          link.getAttribute("href") === primer.getAttribute("href") &&
          link.dataset.routeStylesheetPrimer === undefined,
      );
      if (replaced) primer.remove();
      return !replaced;
    });
    if (!left.length) stop();
  };
  const observer = new MutationObserver(sweep);
  observer.observe(document.head, { childList: true });
  const timer = window.setTimeout(() => {
    for (const primer of left) primer.remove();
    stop();
  }, PRIMER_LIFETIME_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
}
