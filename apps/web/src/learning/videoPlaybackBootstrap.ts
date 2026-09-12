import {
  videoPlaybackBootstrapSchema,
  type VideoPlaybackBootstrap,
} from "@veolms/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const bootstrapRequests = new Map<string, Promise<VideoPlaybackBootstrap>>();

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

function requestKey({
  courseSlug,
  lessonNumber,
}: VideoPlaybackBootstrapRequest) {
  return `${courseSlug}\u0000${lessonNumber}`;
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
  const path = `/courses/${encodeURIComponent(options.courseSlug)}/lessons/${options.lessonNumber}/playback-bootstrap`;
  const response = await fetch(resolveVideoPlaybackApiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const payload = await readResponsePayload(response);
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload;

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { code?: unknown; message?: unknown } }).error
        : undefined;
    throw new VideoPlaybackBootstrapError(
      response.status,
      typeof error?.code === "string"
        ? error.code
        : "PLAYBACK_BOOTSTRAP_FAILED",
      typeof error?.message === "string"
        ? error.message
        : "Unable to prepare this video.",
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
    manifestUrl: resolveVideoPlaybackApiUrl(parsed.data.manifestUrl),
  };
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
  void promise.catch(() => {
    if (bootstrapRequests.get(key) === promise) {
      bootstrapRequests.delete(key);
    }
  });
  return promise;
}

export function clearVideoPlaybackBootstrapCache(): void {
  bootstrapRequests.clear();
}
