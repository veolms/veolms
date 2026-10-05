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
