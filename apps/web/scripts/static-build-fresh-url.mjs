// The address a static build reads the API at, past the CDN's copies.
//
// Cloudflare Cache Rules on the API's host (veolms-cloud infra/cloudflare)
// keep some public GET answers for days, whatever the API's Cache-Control
// says: the catalogue (`/courses`), course pages (`/courses/*/overview`) and
// the public settings. Nothing clears them when the content changes, so a
// build that read them through the CDN rendered the course cards of up to a
// week before (procodrr.com, 27 Nov 2026: "120 Lectures" a week after the
// course had 129), and a course published in that week was missing from
// the catalogue the build finds its pages in.
//
// The CDN keys its copies by the full address, query included, so a query
// value of this build's own makes every read the API's current answer. One
// value for the whole build: the pages it renders share one copy of each
// answer, read once from the API.

const BUILD_KEY = `${Date.now().toString(36)}${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** The name of the query parameter; the API ignores it. */
export const STATIC_BUILD_FRESH_PARAM = "_build";

/** `url` with this build's key in its query. */
export function freshStaticBuildUrl(url) {
  const address = new URL(String(url));
  address.searchParams.set(STATIC_BUILD_FRESH_PARAM, BUILD_KEY);
  return address.toString();
}
