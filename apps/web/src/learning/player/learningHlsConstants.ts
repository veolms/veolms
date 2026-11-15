import type { VideoNetworkRequest } from "@veolms/video-player";
import { isLowMemoryDevice } from "./deviceTier";
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
 * The CDN token lives 11 to 15 minutes (CDN_HLS_TOKEN_TTL_SECONDS, less a
 * random part), so a lesson longer than that renews it as it plays. The
 * renewal is started this long before the token runs out, in the
 * background: the requests passing meanwhile go out with the token they
 * have, and only a request with less than TOKEN_WAIT_FOR_RENEWAL_SECONDS
 * left on its token waits for the answer. Renewing in the request's own
 * path, as before, held every segment behind one API round trip, and a
 * renewal that failed failed the segment with it.
 */
const TOKEN_RENEW_AHEAD_SECONDS = 120;
const TOKEN_WAIT_FOR_RENEWAL_SECONDS = 20;
/**
 * The CDN accepts a token this long past its expiry (its clock skew
 * allowance), so a request may still go out with one that has just run out
 * while a renewal is on its way or being retried.
 */
const TOKEN_GRACE_SECONDS = 25;
/**
 * A renewal that has not answered in this long is given up and tried
 * again. One that hung for good (a connection that went quiet) used to hang
 * every segment request behind it: the video froze with no error, and only
 * a reload of the page got it going.
 */
const TOKEN_REFRESH_TIMEOUT_MS = 10_000;
/** After a failed renewal, the next try waits this long, then twice as long... */
const TOKEN_REFRESH_RETRY_MIN_MS = 2_000;
/** ...up to this. */
const TOKEN_REFRESH_RETRY_MAX_MS = 30_000;
/**
 * Shaka asks for a segment once per load; the same segment asked for again
 * within this long failed the first time (the engine retrying the stream).
 * A token the CDN refused (expired, bound to another client, or over its
 * rate limit) is the likeliest cause, so the token is renewed before the
 * second try, at most once per SUSPECT_RENEWAL_EVERY_MS.
 */
const REJECTED_REQUEST_WINDOW_MS = 60_000;
const SUSPECT_RENEWAL_EVERY_MS = 10_000;
/** Segment addresses remembered for that; older ones are let go. */
const MAX_REMEMBERED_REQUESTS = 600;

/** What the renewals did since the page loaded (for the playback summary). */
export interface TokenRefreshStats {
  attempts: number;
  failures: number;
  timeouts: number;
  /** Renewals forced by a segment asked for again (see above). */
  afterRejection: number;
}

const tokenRefreshStats: TokenRefreshStats = {
  attempts: 0,
  failures: 0,
  timeouts: 0,
  afterRejection: 0,
};

export function getTokenRefreshStats(): TokenRefreshStats {
  return { ...tokenRefreshStats };
}

class TokenRefreshTimeout extends Error {
  constructor() {
    super("The playback token renewal took too long.");
    this.name = "TokenRefreshTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TokenRefreshTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * An init segment (`init-p003.m4s`, `init.mp4`): fetched again whenever a
 * quality switches back, so a repeat of one says nothing about the token.
 */
const INIT_SEGMENT = /\/init[^/]*$/iu;

/** A segment's address without its token: the same for every try. */
function requestIdentity(uri: string): string {
  try {
    const url = new URL(uri);
    url.searchParams.delete("t");
    url.searchParams.delete("veo_token");
    url.hash = "";
    return url.toString();
  } catch {
    return uri.replace(/[?#].*$/u, "");
  }
}

/** A `veo:` performance mark; diagnostic only. */
function markToken(name: string, detail?: Record<string, unknown>): void {
  try {
    performance.mark(`veo:${name}`, detail ? { detail } : undefined);
  } catch {
    // Marks are never in the way of a request.
  }
}

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
  const refreshSegmentToken = options.refreshSegmentToken;
  let currentToken = options.segmentToken;
  let currentTokenExpiresAt = options.segmentTokenExpiresAt;
  let refreshInFlight: Promise<void> | undefined;
  // After a failed renewal: when the next may start, and how long the one
  // after that waits.
  let nextRefreshAllowedAt = 0;
  let refreshRetryDelayMs = TOKEN_REFRESH_RETRY_MIN_MS;
  const recentRequests = new Map<string, number>();
  let lastSuspectRenewalAt = 0;

  /**
   * Renews the token unless a renewal is under way or a failed one is
   * waiting out its delay. Never rejects: a failure leaves the token as it
   * was, for the caller to judge.
   */
  const renew = (): Promise<void> => {
    if (!refreshSegmentToken) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    if (Date.now() < nextRefreshAllowedAt) return Promise.resolve();
    tokenRefreshStats.attempts += 1;
    const attempt = withTimeout(refreshSegmentToken(), TOKEN_REFRESH_TIMEOUT_MS)
      .then((refreshed) => {
        if (!refreshed) return;
        currentToken = refreshed.token;
        currentTokenExpiresAt = refreshed.expiresAt;
        refreshRetryDelayMs = TOKEN_REFRESH_RETRY_MIN_MS;
        nextRefreshAllowedAt = 0;
        markToken("token-renewed", {
          expiresInSeconds:
            refreshed.expiresAt === undefined
              ? null
              : refreshed.expiresAt - Math.floor(Date.now() / 1000),
        });
      })
      .catch((error: unknown) => {
        tokenRefreshStats.failures += 1;
        if (error instanceof TokenRefreshTimeout) {
          tokenRefreshStats.timeouts += 1;
        }
        nextRefreshAllowedAt = Date.now() + refreshRetryDelayMs;
        refreshRetryDelayMs = Math.min(
          TOKEN_REFRESH_RETRY_MAX_MS,
          refreshRetryDelayMs * 2,
        );
        markToken("token-renewal-failed", {
          timeout: error instanceof TokenRefreshTimeout,
          status: (error as { status?: unknown } | null)?.status ?? null,
        });
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
    refreshInFlight = attempt;
    return attempt;
  };

  /** True when this segment was asked for a moment ago: that try failed. */
  const askedForAgain = (request: VideoNetworkRequest): boolean => {
    if (request.type !== "segment" || !refreshSegmentToken) return false;
    const uri = request.uris.find(
      (candidate) => !IN_MEMORY_URI.test(candidate),
    );
    if (!uri) return false;
    const key = requestIdentity(uri);
    if (INIT_SEGMENT.test(key.replace(/[?#].*$/u, ""))) return false;
    const now = Date.now();
    const last = recentRequests.get(key);
    recentRequests.delete(key);
    recentRequests.set(key, now);
    if (recentRequests.size > MAX_REMEMBERED_REQUESTS) {
      for (const [address, at] of recentRequests) {
        if (
          now - at <= REJECTED_REQUEST_WINDOW_MS &&
          recentRequests.size <= MAX_REMEMBERED_REQUESTS
        ) {
          break;
        }
        recentRequests.delete(address);
      }
    }
    return last !== undefined && now - last < REJECTED_REQUEST_WINDOW_MS;
  };

  return async (request: VideoNetworkRequest): Promise<void> => {
    appendLearningHlsCacheVersion(request);
    if (!carriesPlaybackToken(request.type)) return;
    if (request.uris.every((uri) => IN_MEMORY_URI.test(uri))) return;

    const nowSeconds = Date.now() / 1000;
    const secondsLeft =
      currentTokenExpiresAt === undefined
        ? Infinity
        : currentTokenExpiresAt - nowSeconds;
    let waitForRenewal =
      !currentToken || secondsLeft <= TOKEN_WAIT_FOR_RENEWAL_SECONDS;
    if (
      askedForAgain(request) &&
      Date.now() - lastSuspectRenewalAt >= SUSPECT_RENEWAL_EVERY_MS
    ) {
      lastSuspectRenewalAt = Date.now();
      tokenRefreshStats.afterRejection += 1;
      nextRefreshAllowedAt = 0;
      waitForRenewal = true;
      markToken("token-renewal-after-rejection");
    }
    if (
      refreshSegmentToken &&
      (waitForRenewal || secondsLeft <= TOKEN_RENEW_AHEAD_SECONDS)
    ) {
      const renewal = renew();
      if (waitForRenewal) await renewal;
    }

    if (!currentToken) {
      // Nothing to send the request with: the engine tries the stream
      // again after a moment, and the renewal with it.
      throw new Error("The video's playback token is not available yet.");
    }
    if (
      currentTokenExpiresAt !== undefined &&
      currentTokenExpiresAt + TOKEN_GRACE_SECONDS < Date.now() / 1000
    ) {
      // Past what the CDN accepts and not renewed: the request would only
      // be refused. Failing it here keeps the engine retrying (and the
      // renewal with it) until a token comes.
      throw new Error("The video's playback token has expired.");
    }
    const token = currentToken;
    const queryParam = token.length === 40 ? "t" : "veo_token";
    request.uris = request.uris.map((uri) =>
      IN_MEMORY_URI.test(uri)
        ? uri
        : appendLearningHlsQueryParameter(uri, queryParam, token),
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
const LEARNING_BUFFER_AHEAD_SECONDS = 60;
/**
 * A device with little memory (see deviceTier.ts) keeps half a minute each
 * way: a minute of 720p is some 12MB, where four minutes of 1080p were
 * 80MB and more in the browser's own copies. On a laptop with 4GB that
 * was the difference between a page that kept up and one that swapped,
 * with every scroll and click lagging while a lesson played.
 */
const LEARNING_LEAN_BUFFER_SECONDS = 30;
/** Automatic quality goes no higher than this there; a choice still may. */
const LEARNING_LEAN_MAX_AUTO_HEIGHT = 720;

/** How much played video this device keeps in memory. */
export function learningBufferBehindSeconds(): number {
  return isLowMemoryDevice()
    ? LEARNING_LEAN_BUFFER_SECONDS
    : LEARNING_BUFFER_BEHIND_SECONDS;
}

/** How much video ahead of the playhead this device downloads. */
export function learningBufferAheadSeconds(): number {
  return isLowMemoryDevice()
    ? LEARNING_LEAN_BUFFER_SECONDS
    : LEARNING_BUFFER_AHEAD_SECONDS;
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
    // Automatic quality on a small device stops at 720p: these limits
    // bind ABR only, and the quality menu still offers every rendition.
    ...(isLowMemoryDevice() && !chosenVideoHeight
      ? { abrRestrictions: { maxHeight: LEARNING_LEAN_MAX_AUTO_HEIGHT } }
      : {}),
    rebufferingGoal: 1.5,
    bufferingGoal: learningBufferAheadSeconds(),
    bufferBehind: learningBufferBehindSeconds(),
  } as const;
}
