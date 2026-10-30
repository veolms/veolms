import type { VideoNetworkRequest } from "@veolms/video-player";
import { installSegmentCache } from "./segmentCache";
import { cachedStartHeight } from "./segmentCacheStart";

export const LEARNING_HLS_MIME_TYPE = "application/x-mpegurl";

// HLS segments are served with long-lived immutable browser caching. Bump this
// value whenever the CDN CORS contract changes so tabs with an older cached
// response do not keep replaying the previous CORS failure.
export const LEARNING_HLS_CACHE_VERSION = "cors-v2";

// Shaka's NetworkingEngine can hand a same-origin path to a scheme resolver as
// a malformed one-slash URL. Repair that shape before applying CDN queries so
// the player never drops the configured media path prefix.
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

// An inlined playlist is served from a data: URI; a query appended to one
// would become part of its content.
const IN_MEMORY_URI = /^(?:data|blob):/i;

export function appendLearningHlsCacheVersion(
  request: VideoNetworkRequest,
): void {
  if (
    request.type !== "manifest" &&
    request.type !== "segment" &&
    request.type !== "text"
  )
    return;
  const origin = getLearningMediaOrigin();

  request.uris = request.uris.map((uri) =>
    IN_MEMORY_URI.test(uri)
      ? uri
      : appendHlsCacheQuery(repairShakaSetSchemeUri(uri, origin), origin),
  );
}

/**
 * Requests that carry the CDN playback token: playlists (.m3u8/.mpd),
 * segments (.ts today, .m4s and init.mp4 with CMAF), captions, AES-128
 * keys (key.bin), and the seek-preview storyboard (index and sheets).
 */
function carriesPlaybackToken(type: VideoNetworkRequest["type"]): boolean {
  return (
    type === "manifest" ||
    type === "segment" ||
    type === "text" ||
    type === "key" ||
    type === "thumbnail"
  );
}

type LearningHlsRequestOptions = {
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>;
};

/**
 * The lesson player's request filter: the cache version and the playback
 * token on every request that needs them. Segments the browser already
 * keeps are answered from there (see segmentCache.ts, set up here: this is
 * made before the player's runtime is loaded).
 */
export function createLearningHlsRequestFilter(
  options?: LearningHlsRequestOptions,
) {
  installSegmentCache();
  return createTokenRequestFilter(options);
}

function createTokenRequestFilter(options?: LearningHlsRequestOptions) {
  if (!options?.segmentToken && !options?.refreshSegmentToken) {
    return appendLearningHlsCacheVersion;
  }
  let currentToken = options.segmentToken;
  let currentTokenExpiresAt = options.segmentTokenExpiresAt;
  let refreshInFlight:
    Promise<{ token: string; expiresAt?: number } | null> | undefined;

  return async (request: VideoNetworkRequest): Promise<void> => {
    appendLearningHlsCacheVersion(request);
    if (!carriesPlaybackToken(request.type)) return;
    if (request.uris.every((uri) => IN_MEMORY_URI.test(uri))) return;

    const refreshBefore = Math.floor(Date.now() / 1000) + 30;
    if (
      options.refreshSegmentToken &&
      (!currentToken ||
        (currentTokenExpiresAt !== undefined &&
          currentTokenExpiresAt <= refreshBefore))
    ) {
      refreshInFlight ??= options.refreshSegmentToken();
      try {
        const refreshed = await refreshInFlight;
        if (refreshed) {
          currentToken = refreshed.token;
          currentTokenExpiresAt = refreshed.expiresAt;
        }
      } finally {
        refreshInFlight = undefined;
      }
    }

    if (!currentToken) return;
    const queryParam = currentToken.length === 40 ? "t" : "veo_token";
    request.uris = request.uris.map((uri) =>
      IN_MEMORY_URI.test(uri)
        ? uri
        : appendLearningHlsQueryParameter(uri, queryParam, currentToken!),
    );
  };
}

function appendLearningHlsQueryParameter(
  uri: string,
  key: string,
  value: string,
): string {
  const hashIndex = uri.indexOf("#");
  const hash = hashIndex === -1 ? "" : uri.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? uri : uri.slice(0, hashIndex);
  const origin = getLearningMediaOrigin();
  try {
    if (!origin && !/^https?:\/\//i.test(withoutHash)) throw new Error();
    const parsed = origin ? new URL(withoutHash, origin) : new URL(withoutHash);
    parsed.searchParams.set(key, value);
    return `${parsed.toString()}${hash}`;
  } catch {
    const separator = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
  }
}

/**
 * Played video kept in memory: 3 minutes, so going back that far needs no
 * download at all. With the 60s ahead that is ~80MB of 1080p, inside every
 * browser's per-video buffer cap (Chrome 150MB, Firefox 100MB) with room
 * for bitrate peaks. Further back is still on this device, in the segment
 * cache (segmentCache.ts), so it costs no network either.
 */
const LEARNING_BUFFER_BEHIND_SECONDS = 180;
/** A phone with 2GB of memory or less keeps what it kept before. */
const LEARNING_LEAN_BUFFER_BEHIND_SECONDS = 30;
const LEARNING_LEAN_DEVICE_MEMORY_GB = 2;

/** How much played video this device keeps in memory. */
export function learningBufferBehindSeconds(): number {
  const deviceMemory =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof deviceMemory === "number" &&
    deviceMemory <= LEARNING_LEAN_DEVICE_MEMORY_GB
    ? LEARNING_LEAN_BUFFER_BEHIND_SECONDS
    : LEARNING_BUFFER_BEHIND_SECONDS;
}

/**
 * The picture height the learner picked in the player's quality menu, kept
 * with the learning settings as `videoQuality` ("1080", or "auto"), or
 * undefined for auto. Read from storage directly, as the preload's resume
 * setting is (learningHlsPreloadSource.ts): this module is in the early
 * preload chunk, which the settings module would weigh down.
 */
export function readPreferredVideoHeight(): number | undefined {
  try {
    const stored = JSON.parse(
      globalThis.localStorage?.getItem("veolms-learning-preferences") || "{}",
    ) as { videoQuality?: unknown };
    const height = Number(stored.videoQuality);
    return Number.isInteger(height) && height > 0 ? height : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Start as soon as one 2s segment is in (1.5s), then build a 60s cushion so
 * a phone losing signal for half a minute keeps playing; more ahead is
 * downloaded for nothing when a learner skips or leaves. Played video is
 * kept as above. The buffer sits in MSE SourceBuffers, which the page
 * cannot read back. A video starts at the quality the learner picked, if
 * any (else ABR starts low and climbs); a lesson the device keeps at a
 * taller rendition plays that rendition. Read per source, and the live and
 * preload sources share it, so a preload is made at the quality playback
 * starts at and is not cleared by a config mismatch. On auto, a lesson
 * the device keeps at some quality plays at that one for as long as its
 * segments come from the device (segmentCacheStart.ts): a replay fetches
 * nothing. The first video segment from the network hands over to ABR.
 */
export function learningHlsStreaming(manifestUrl?: string) {
  const chosenVideoHeight = readPreferredVideoHeight();
  const cachedVideoHeight = manifestUrl
    ? cachedStartHeight(manifestUrl)
    : undefined;
  // A chosen quality applies to every lesson on this device. One the
  // device keeps at a taller rendition plays that one (there is nothing to
  // fetch for it; the quality menu shows what plays); the chosen quality
  // stays what the next lessons start at. A shorter kept rendition does not
  // lower the chosen quality.
  const preferredVideoHeight =
    chosenVideoHeight &&
    cachedVideoHeight &&
    cachedVideoHeight > chosenVideoHeight
      ? cachedVideoHeight
      : chosenVideoHeight;
  const holdVideoHeight = chosenVideoHeight ? undefined : cachedVideoHeight;
  return {
    abrEnabled: true,
    ...(preferredVideoHeight ? { preferredVideoHeight } : {}),
    ...(holdVideoHeight ? { holdVideoHeight } : {}),
    rebufferingGoal: 1.5,
    bufferingGoal: 60,
    bufferBehind: learningBufferBehindSeconds(),
  } as const;
}
