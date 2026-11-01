import { parseSiteOrigin } from "./siteOrigin";

/**
 * The site's public address this build was given (`VITE_SITE_URL`), or
 * `undefined` when it was given none. When set it is the address a course
 * page names as its own, at build time and in the browser alike, so a copy
 * of the site served elsewhere (a preview) still points at the public one.
 */
export const configuredSiteOrigin = parseSiteOrigin(
  import.meta.env.VITE_SITE_URL as string | undefined,
);
