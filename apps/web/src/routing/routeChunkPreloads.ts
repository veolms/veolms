/**
 * Placeholders replaced at build time (vite.config routeChunkPreloadPlugin)
 * with the hashed URLs of the lazy route-body chunks. Rendering a
 * modulepreload for them from the prerendered document closes the hydration
 * race where a state update (for example /auth/me resolving) re-renders the
 * page before the lazy chunk has loaded, which made React abandon the
 * prerendered markup and flash the Suspense fallback — a full-viewport
 * layout shift under mobile throttling.
 */
export const CATALOGUE_CHUNK_URL_PLACEHOLDER = "__VEO_CATALOGUE_CHUNK_URL__";
export const GUEST_HOME_CHUNK_URL_PLACEHOLDER = "__VEO_GUEST_HOME_CHUNK_URL__";

/**
 * Comma-joined stylesheet URLs of the same chunks. The feature CSS of a
 * lazy chunk normally loads with the chunk itself, which is too late for
 * content that is already prerendered into the document: it paints
 * unstyled first. Linking these from the document keeps the prerendered
 * markup styled at first paint.
 */
export const CATALOGUE_CSS_URLS_PLACEHOLDER = "__VEO_CATALOGUE_CSS_URLS__";
export const GUEST_HOME_CSS_URLS_PLACEHOLDER = "__VEO_GUEST_HOME_CSS_URLS__";

/**
 * Comma-joined URLs of the chunks the guest home chunk imports statically.
 * Preloading only the lazy chunk itself leaves its imports to be discovered
 * one round trip later, and the body cannot hydrate until all of them are in.
 * The catalogue has no such list: its prerendered markup was not being
 * discarded, and preloading its whole graph measurably slowed /courses.
 */
export const GUEST_HOME_JS_URLS_PLACEHOLDER = "__VEO_GUEST_HOME_JS_URLS__";

/** Splits a replaced URL-list placeholder; an unreplaced one yields none. */
export function splitChunkCssUrls(value: string): string[] {
  if (!value || value.startsWith("__VEO_")) return [];
  return value.split(",").filter((url) => url.startsWith("/"));
}
