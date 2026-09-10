import type { VideoNetworkRequest } from "@veolms/video-player";

export const LEARNING_HLS_MIME_TYPE = "application/x-mpegurl";

// HLS segments are served with long-lived immutable browser caching. Bump this
// value whenever the CDN CORS contract changes so tabs with an older cached
// response do not keep replaying the previous CORS failure.
export const LEARNING_HLS_CACHE_VERSION = "cors-v2";

export function appendLearningHlsCacheVersion(
  request: VideoNetworkRequest,
): void {
  if (request.type !== "manifest" && request.type !== "segment") return;

  request.uris = request.uris.map((uri) => {
    let parsed: URL;
    try {
      parsed = new URL(uri, "http://veolms.local");
    } catch {
      return uri;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return uri;
    }

    parsed.searchParams.set("veo_hls_cache", LEARNING_HLS_CACHE_VERSION);
    if (/^https?:\/\//i.test(uri)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  });
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
  bufferBehind: 600,
} as const;
