import {
  videoPlaybackBootstrapSchema,
  videoPlaybackTokenSchema,
  type VideoPlaybackBootstrap,
  type VideoPlaybackToken,
} from "@veolms/contracts";
import { getApiBaseUrl } from "../lib/api-client";

const API_BASE_URL = getApiBaseUrl();
const CDN_URL = import.meta.env.VITE_CDN_URL || "/cdn";

const bootstrapRequests = new Map<string, Promise<VideoPlaybackBootstrap>>();
const bootstrapCache = new Map<string, VideoPlaybackBootstrap>();
const playbackTokenRequests = new Map<string, Promise<VideoPlaybackToken>>();

export class VideoPlaybackBootstrapError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "VideoPlaybackBootstrapError";
    this.status = status;
    this.code = code;
  }
}

export interface VideoPlaybackBootstrapRequest {
  courseSlug: string;
  lessonNumber: number;
  signal?: AbortSignal;
}

export function resolveVideoPlaybackApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(API_BASE_URL).replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (cleanPath === base || cleanPath.startsWith(`${base}/`)) {
    return cleanPath;
  }
  return `${base}${cleanPath}`;
}

export function resolveVideoPlaybackCdnUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(CDN_URL).replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (base && (cleanPath === base || cleanPath.startsWith(`${base}/`))) {
    return cleanPath;
  }
  return `${base}${cleanPath}` || cleanPath;
}

export function getVideoPlaybackApiOrigin(): string | null {
  try {
    const url = new URL(API_BASE_URL, "http://veolms.local");
    return /^https?:$/i.test(url.protocol) &&
      url.origin !== "http://veolms.local"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns the external CDN origin for the document head preconnect. A
 * same-origin path such as `/cdn` deliberately returns null because it does
 * not require a separate DNS/TLS connection.
 */
export function getVideoPlaybackCdnOrigin(): string | null {
  try {
    const url = new URL(CDN_URL, "http://veolms.local");
    return /^https?:$/i.test(url.protocol) &&
      url.origin !== "http://veolms.local"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function requestKey({
  courseSlug,
  lessonNumber,
}: VideoPlaybackBootstrapRequest) {
  return `${courseSlug}\u0000${lessonNumber}`;
}

function playbackPath(
  options: VideoPlaybackBootstrapRequest,
  resource: "playback-bootstrap" | "playback-token",
): string {
  return `/courses/${encodeURIComponent(options.courseSlug)}/lessons/${options.lessonNumber}/${resource}`;
}

function unwrapResponseData(payload: unknown): unknown {
  return payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : payload;
}

function createPlaybackResponseError(
  response: Response,
  payload: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): VideoPlaybackBootstrapError {
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
  return new VideoPlaybackBootstrapError(
    response.status,
    typeof error?.code === "string" ? error.code : fallbackCode,
    typeof error?.message === "string" ? error.message : fallbackMessage,
  );
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestBootstrap(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap> {
  const path = playbackPath(options, "playback-bootstrap");
  const response = await fetch(resolveVideoPlaybackApiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const payload = await readResponsePayload(response);
  const data = unwrapResponseData(payload);

  if (!response.ok) {
    throw createPlaybackResponseError(
      response,
      payload,
      "PLAYBACK_BOOTSTRAP_FAILED",
      "Unable to prepare this video.",
    );
  }

  const parsed = videoPlaybackBootstrapSchema.safeParse(data);
  if (!parsed.success) {
    throw new VideoPlaybackBootstrapError(
      502,
      "INVALID_PLAYBACK_BOOTSTRAP",
      "The video playback response was invalid.",
    );
  }

  return {
    ...parsed.data,
    manifestUrl: resolveVideoPlaybackCdnUrl(parsed.data.manifestUrl),
  };
}

async function requestPlaybackToken(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackToken> {
  const response = await fetch(
    resolveVideoPlaybackApiUrl(playbackPath(options, "playback-token")),
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: options.signal,
    },
  );
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw createPlaybackResponseError(
      response,
      payload,
      "PLAYBACK_TOKEN_FAILED",
      "Unable to refresh the video playback token.",
    );
  }

  const parsed = videoPlaybackTokenSchema.safeParse(
    unwrapResponseData(payload),
  );
  if (!parsed.success) {
    throw new VideoPlaybackBootstrapError(
      502,
      "INVALID_PLAYBACK_TOKEN",
      "The video playback token response was invalid.",
    );
  }

  return parsed.data;
}

/**
 * Fetches only a fresh protected HLS token. Playback metadata and the
 * manifest URL remain in the mounted player's existing bootstrap state.
 */
export function refreshVideoPlaybackToken(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackToken> {
  const key = requestKey(options);
  const existing = playbackTokenRequests.get(key);
  if (existing) return existing;

  const promise = requestPlaybackToken(options);
  playbackTokenRequests.set(key, promise);
  void promise.then(
    () => {
      if (playbackTokenRequests.get(key) === promise) {
        playbackTokenRequests.delete(key);
      }
    },
    () => {
      if (playbackTokenRequests.get(key) === promise) {
        playbackTokenRequests.delete(key);
      }
    },
  );
  return promise;
}

/**
 * Fetches the minimum protected playback payload once per lesson. The promise
 * is shared by the document-start preload and the mounted React player, so a
 * normal component request cannot duplicate the early bootstrap request.
 */
export function getVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap> {
  const key = requestKey(options);
  const existing = bootstrapRequests.get(key);
  if (existing) return existing;

  const promise = requestBootstrap(options);
  bootstrapRequests.set(key, promise);
  void promise
    .then((bootstrap) => {
      bootstrapCache.set(key, bootstrap);
    })
    .catch(() => {
      if (bootstrapRequests.get(key) === promise) {
        bootstrapRequests.delete(key);
      }
      bootstrapCache.delete(key);
    });
  return promise;
}

export function getCachedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapRequest,
): VideoPlaybackBootstrap | null {
  return bootstrapCache.get(requestKey(options)) ?? null;
}

export function clearVideoPlaybackBootstrapCache(): void {
  bootstrapRequests.clear();
  playbackTokenRequests.clear();
  bootstrapCache.clear();
}
