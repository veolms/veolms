/** Tries after the first that fail (the CDN answers some requests 504). */
export const THUMBNAIL_RETRIES = 2;

/** How long before each retry: longer each time. */
export const thumbnailRetryDelay = (attempt: number) => 800 * (attempt + 1);

/**
 * The address of a retry: another URL, so nothing the browser kept of the
 * failed answer is reused. The CDN ignores the query.
 */
export const withThumbnailRetry = (url: string, attempt: number) =>
  attempt === 0
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
