import type { VideoNetworkRequest } from "@veolms/video-player";

export const LEARNING_HLS_MIME_TYPE = "application/x-mpegurl";

// HLS segments are served with long-lived immutable browser caching. Bump this
// value whenever the CDN CORS contract changes so tabs with an older cached
// response do not keep replaying the previous CORS failure.
export const LEARNING_HLS_CACHE_VERSION = "cors-v2";

// Shaka's NetworkingEngine.setScheme("/api/...", "https") concatenates the
// scheme and path into "https:/api/..." (one slash). URL parsing then treats
// "api" as the hostname, so the player fetches /v1/media/... on the page
// origin instead of /api/v1/media/....
const SHAKA_MALFORMED_SCHEME_PREFIX = /^(https?:)\/(?!\/)/i;

export function getLearningMediaOrigin(): string | null {
  try {
    if (
      typeof window === "undefined" ||
      !/^https?:$/i.test(window.location.protocol)
    ) {
      return null;
    }
    return window.location.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve a same-origin media path to an absolute URL before handing it to
 * Shaka. Absolute http(s) URLs are returned unchanged.
 */
export function toAbsoluteLearningMediaUrl(src: string): string {
  if (!src || /^(https?:|blob:|data:)/i.test(src)) return src;
  const origin = getLearningMediaOrigin();
  if (!origin) return src;
  try {
    return new URL(src, origin).toString();
  } catch {
    return src;
  }
}

function repairShakaSetSchemeUri(uri: string, origin: string | null): string {
  if (!SHAKA_MALFORMED_SCHEME_PREFIX.test(uri)) return uri;
  const pathAndRest = uri.replace(/^(https?:)/i, "");
  if (!origin) return pathAndRest;
  try {
    return new URL(pathAndRest, origin).toString();
  } catch {
    return pathAndRest;
  }
}

function appendHlsCacheQuery(uri: string, origin: string | null): string {
  const hashIndex = uri.indexOf("#");
  const hash = hashIndex === -1 ? "" : uri.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? uri : uri.slice(0, hashIndex);

  if (origin && withoutHash.startsWith("/") && !withoutHash.startsWith("//")) {
    try {
      const absolute = new URL(withoutHash, origin);
      absolute.searchParams.set("veo_hls_cache", LEARNING_HLS_CACHE_VERSION);
      return `${absolute.toString()}${hash}`;
    } catch {
      // Fall through to the query-append path below.
    }
  }

  if (/^https?:\/\//i.test(withoutHash)) {
    try {
      const parsed = new URL(withoutHash);
      parsed.searchParams.set("veo_hls_cache", LEARNING_HLS_CACHE_VERSION);
      return `${parsed.toString()}${hash}`;
    } catch {
      // Fall through.
    }
  }

  const queryIndex = withoutHash.indexOf("?");
  const path =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(
    queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1),
  );
  params.set("veo_hls_cache", LEARNING_HLS_CACHE_VERSION);
  return `${path}?${params.toString()}${hash}`;
}

export function appendLearningHlsCacheVersion(
  request: VideoNetworkRequest,
): void {
  if (request.type !== "manifest" && request.type !== "segment") return;
  const origin = getLearningMediaOrigin();

  request.uris = request.uris.map((uri) =>
    appendHlsCacheQuery(repairShakaSetSchemeUri(uri, origin), origin),
  );
}

export function createLearningHlsRequestFilter(options?: {
  protectedPlayback?: boolean;
}) {
  if (!options?.protectedPlayback) {
    return appendLearningHlsCacheVersion;
  }
  return (request: VideoNetworkRequest): void => {
    appendLearningHlsCacheVersion(request);
    request.allowCrossSiteCredentials = true;
  };
}

export const LEARNING_HLS_STREAMING = {
  abrEnabled: true,
  // A VOD player does not need Shaka's default ~10s startup buffer. Keep the
  // first playable frame responsive while retaining a small rebuffer safety
  // margin for normal network jitter.
  bufferingGoal: 2,
  rebufferingGoal: 1,
  bufferBehind: 60,
} as const;
