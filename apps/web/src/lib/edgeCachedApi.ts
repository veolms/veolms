/**
 * Public GET answers that the CDN in front of the API keeps for days.
 *
 * Cloudflare Cache Rules on the API's host (veolms-cloud infra/cloudflare)
 * cache these for 7 days and ignore the API's `Cache-Control`; nothing
 * clears them when the content changes. Browsers that read them by their
 * plain address got the copy of up to a week before: the catalogue's
 * prices and lesson counts, a course page's curriculum and price, the
 * site's settings (procodrr.com, 27 Nov 2026: a course page's curriculum
 * 6.6 days old). A course page's answer also depends on who asks (its
 * admins see unpublished lessons), yet one copy was kept for everyone.
 *
 * The CDN keys a copy by the full address, query included. Visitors who are
 * signed out share a key that changes every minute: the CDN still answers
 * them, with an answer at most a minute old. A signed-in reader gets a key
 * of their own, so the CDN never gives one person's answer to another.
 */

/** Paths relative to the API's /v1, without a query. */
const EDGE_CACHED_PATHS: readonly RegExp[] = [
  /^\/courses$/u,
  /^\/courses\/[^/]+\/overview$/u,
  /^\/platform\/public-settings$/u,
];

/** The query parameter carrying the key; the API ignores it. */
export const EDGE_CACHE_KEY_PARAM = "_cdn";

/** How long signed-out visitors share one copy at the CDN. */
export const SHARED_EDGE_COPY_MS = 60_000;

let uniqueCount = 0;

/**
 * The key a GET of `path` adds to its query, or null when the CDN does not
 * keep that path. `path` is relative to the API base, as the services pass
 * it ("/courses", "/courses/js/overview").
 */
export function edgeCacheKey(
  method: string,
  path: string,
  { signedIn, now = Date.now() }: { signedIn: boolean; now?: number },
): string | null {
  if (method.toUpperCase() !== "GET") return null;
  const pathname = path.split(/[?#]/u, 1)[0] ?? "";
  if (!EDGE_CACHED_PATHS.some((pattern) => pattern.test(pathname))) {
    return null;
  }
  if (!signedIn) return Math.floor(now / SHARED_EDGE_COPY_MS).toString(36);
  uniqueCount += 1;
  return `${now.toString(36)}${uniqueCount.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
