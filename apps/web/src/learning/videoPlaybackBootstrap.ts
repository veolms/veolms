// This module loads with the root shell, so the playback schemas (and zod
// with them) are imported dynamically inside the async requests below; the
// validation itself is unchanged.
import type {
  VideoPlaybackBootstrap,
  VideoPlaybackToken,
} from "@veolms/contracts/video-playback";

const loadVideoPlaybackSchemas = () =>
  import("@veolms/contracts/video-playback");
import { getOfflineDataProvider } from "@veolms/web-core";
import { endSessionIfUnauthorized, getApiBaseUrl } from "../lib/api-client";
import { isNetworkFailure } from "../lib/offline-data";
import { isLearnerView } from "../lib/learner-view";
import {
  LEARNER_VIEW_HEADER,
  LEARNER_VIEW_HEADER_VALUE,
} from "@veolms/contracts/learner-view";
import { authStore } from "../store/auth.store";
import {
  keepPlaybackBootstrap,
  readKeptPlaybackBootstrap,
  takeHeadStartedPlaybackBootstrap,
} from "./playbackBootstrapHeadStart";
import { adoptAccountResumePosition } from "./player/lessonPlayerPersistence";
import { prepareCachedStartHeight } from "./player/segmentCacheStart";

const API_BASE_URL = getApiBaseUrl();
const CDN_URL = import.meta.env.VITE_CDN_URL || "/cdn";

const bootstrapRequests = new Map<string, Promise<VideoPlaybackBootstrap>>();
const bootstrapCache = new Map<string, VideoPlaybackBootstrap>();
const playbackTokenRequests = new Map<string, Promise<VideoPlaybackToken>>();

/**
 * How long a "log in first" or "no access" answer is kept. A locked lesson
 * is asked for by the document-start preload, by the lesson page when it
 * mounts, and again when the session check answers; the server only repeated
 * itself each time. Kept this briefly, the answer covers those and is gone
 * well before anyone could have bought the course and come back.
 */
const PLAYBACK_REFUSAL_MEMORY_MS = 5_000;

interface RefusedBootstrap {
  promise: Promise<VideoPlaybackBootstrap>;
  error: VideoPlaybackBootstrapError;
  /** The account known to this page when the server refused, if any. */
  viewerId: string | null;
  expiresAt: number;
}

const refusedBootstraps = new Map<string, RefusedBootstrap>();

const currentViewerId = () => authStore.getState().user?.id ?? null;

function refusalStillStands(refused: RefusedBootstrap): boolean {
  if (Date.now() >= refused.expiresAt) return false;
  const viewerId = currentViewerId();
  if (viewerId === refused.viewerId) return true;
  // Only a signed-in account is told "no access". When that came back before
  // the session check had said who is signed in, the account now known is
  // the one the server meant. Any other change (a log-in after "log in
  // first", a log-out, another account) asks afresh.
  return (
    refused.error.status === 403 &&
    refused.viewerId === null &&
    viewerId !== null
  );
}

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
  mediaId?: string;
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

/**
 * A kept bootstrap is reused (a hover then a click, the preload then the
 * player) until its segment token has less than this left. The player
 * renews a token while it plays, but a lesson opened with a nearly expired
 * one would start by waiting on that renewal.
 */
const BOOTSTRAP_TOKEN_REUSE_MARGIN_SECONDS = 60;

function dropExpiringBootstrap(key: string): void {
  const kept = bootstrapCache.get(key);
  const expiresAt = kept?.segmentTokenExpiresAt;
  if (expiresAt === undefined) return;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now > BOOTSTRAP_TOKEN_REUSE_MARGIN_SECONDS) return;
  bootstrapCache.delete(key);
  bootstrapRequests.delete(key);
}

function requestKey({
  courseSlug,
  lessonNumber,
  mediaId,
}: VideoPlaybackBootstrapRequest) {
  return `${courseSlug}\u0000${lessonNumber}\u0000${mediaId ?? ""}`;
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
  const failure = new VideoPlaybackBootstrapError(
    response.status,
    typeof error?.code === "string" ? error.code : fallbackCode,
    typeof error?.message === "string" ? error.message : fallbackMessage,
  );
  // These requests do not go through the API client, so nothing told the
  // rest of the app when one came back "not signed in": the lesson asked
  // for a login while the shell around it still showed the account.
  endSessionIfUnauthorized(response.url, failure, { onlyIfSignedIn: true });
  return failure;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * These requests do not go through the API client, so they say themselves
 * when a managing account is in its Student view: the API numbers lessons
 * as a learner sees them then, and the player must ask for the same lesson
 * the page shows.
 */
function playbackRequestHeaders(): Record<string, string> {
  return isLearnerView()
    ? {
        Accept: "application/json",
        [LEARNER_VIEW_HEADER]: LEARNER_VIEW_HEADER_VALUE,
      }
    : { Accept: "application/json" };
}

/**
 * Whose answers this page keeps: the signed-in account, the one this tab
 * remembers while the session check runs, or a visitor. Matches what the
 * document's head reads (see playbackBootstrapHeadStart.ts).
 */
const keptViewer = () =>
  authStore.getState().user?.id ??
  (authStore.hasSessionHint()
    ? (authStore.getIdentityHint()?.userId ?? null)
    : "guest");

/** A lesson's answer as the head or this tab's copy already has it. */
async function takeEarlyAnswer(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap | null> {
  if (options.mediaId) return null;
  const request = {
    courseSlug: options.courseSlug,
    lessonNumber: options.lessonNumber,
    learnerView: isLearnerView(),
  };
  const headStarted = takeHeadStartedPlaybackBootstrap(request);
  const answer = headStarted ? await headStarted.catch(() => null) : null;
  if (answer) {
    const data = unwrapResponseData(answer.payload);
    if (answer.status >= 200 && answer.status < 300) {
      const bootstrap = await parseBootstrap(data);
      if (!answer.kept) keepAnswer(options, data);
      return bootstrap;
    }
    // A refusal is the server's answer as it would be to the page.
    if (answer.status === 401 || answer.status === 403) {
      throw createPlaybackResponseError(
        new Response(null, { status: answer.status }),
        answer.payload,
        "PLAYBACK_BOOTSTRAP_FAILED",
        "Unable to prepare this video.",
      );
    }
    return null;
  }
  const viewer = keptViewer();
  const kept = viewer ? readKeptPlaybackBootstrap(viewer, request) : null;
  return kept ? await parseBootstrap(kept).catch(() => null) : null;
}

function keepAnswer(options: VideoPlaybackBootstrapRequest, data: unknown) {
  const viewer = keptViewer();
  if (!viewer || options.mediaId) return;
  keepPlaybackBootstrap(
    viewer,
    {
      courseSlug: options.courseSlug,
      lessonNumber: options.lessonNumber,
      learnerView: isLearnerView(),
    },
    data,
  );
}

async function requestBootstrap(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap> {
  const bootstrap = await answerBootstrap(options);
  // The quality kept on this device, for the player to start at (a few ms).
  await prepareCachedStartHeight(bootstrap.manifestUrl);
  // Where the learner left this lesson on any device, taken when it is
  // newer than what this browser has: the players start from what this
  // browser has (see `readStartPosition`), and this comes before them.
  if (bootstrap.resumePosition && !options.mediaId) {
    adoptAccountResumePosition(
      `${encodeURIComponent(options.courseSlug)}-lesson-${options.lessonNumber}`,
      bootstrap.resumePosition.seconds,
      bootstrap.resumePosition.savedAt,
    );
  }
  return bootstrap;
}

async function answerBootstrap(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap> {
  const early = await takeEarlyAnswer(options);
  if (early) return early;
  // Asks for the master playlist inline, saving the player that request,
  // for the seek-preview storyboard when the video has one, for where the
  // learner left the lesson, and for the video's subtitle tracks.
  const path = `${playbackPath(options, "playback-bootstrap")}?inlineManifest=1&storyboard=1&resume=1&subtitles=1`;
  let response: Response;
  try {
    response = await fetch(resolveVideoPlaybackApiUrl(path), {
      method: "GET",
      credentials: "include",
      headers: playbackRequestHeaders(),
      signal: options.signal,
    });
  } catch (error) {
    // No network: a plugin that keeps downloads may have this lesson.
    if (options.signal?.aborted || !isNetworkFailure(error)) throw error;
    const kept = await getOfflineDataProvider()
      ?.playbackBootstrap(options.courseSlug, options.lessonNumber)
      .catch(() => null);
    if (!kept) throw error;
    return await parseBootstrap(kept);
  }
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

  const bootstrap = await parseBootstrap(data);
  keepAnswer(options, data);
  return bootstrap;
}

async function parseBootstrap(data: unknown): Promise<VideoPlaybackBootstrap> {
  const { videoPlaybackBootstrapSchema } = await loadVideoPlaybackSchemas();
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
      headers: playbackRequestHeaders(),
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

  const { videoPlaybackTokenSchema } = await loadVideoPlaybackSchemas();
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
 * How long the answer may take before the player is told it failed. A
 * request that never comes back used to leave the player on its loader for
 * good; a failure it can show, and offer to try again.
 */
export const PLAYBACK_BOOTSTRAP_LIMIT_MS = 10_000;

function withinPlaybackBootstrapLimit<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new VideoPlaybackBootstrapError(
          0,
          "PLAYBACK_BOOTSTRAP_TIMEOUT",
          "The video took too long to prepare.",
        ),
      );
    }, PLAYBACK_BOOTSTRAP_LIMIT_MS);
    request.then(
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
 * Fetches the minimum protected playback payload once per lesson. The promise
 * is shared by the document-start preload and the mounted React player, so a
 * normal component request cannot duplicate the early bootstrap request.
 */
export function getVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapRequest,
): Promise<VideoPlaybackBootstrap> {
  const key = requestKey(options);
  dropExpiringBootstrap(key);
  const existing = bootstrapRequests.get(key);
  if (existing) return existing;

  const refused = refusedBootstraps.get(key);
  if (refused) {
    if (refusalStillStands(refused)) return refused.promise;
    refusedBootstraps.delete(key);
  }

  const promise = withinPlaybackBootstrapLimit(requestBootstrap(options));
  bootstrapRequests.set(key, promise);
  void promise
    .then((bootstrap) => {
      bootstrapCache.set(key, bootstrap);
    })
    .catch((error: unknown) => {
      if (bootstrapRequests.get(key) === promise) {
        bootstrapRequests.delete(key);
      }
      bootstrapCache.delete(key);
      if (
        error instanceof VideoPlaybackBootstrapError &&
        (error.status === 401 || error.status === 403)
      ) {
        refusedBootstraps.set(key, {
          promise,
          error,
          viewerId: currentViewerId(),
          expiresAt: Date.now() + PLAYBACK_REFUSAL_MEMORY_MS,
        });
      }
    });
  return promise;
}

export function getCachedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapRequest,
): VideoPlaybackBootstrap | null {
  const key = requestKey(options);
  dropExpiringBootstrap(key);
  return bootstrapCache.get(key) ?? null;
}

/** The server's refusal of this lesson, while it is still being kept. */
export function getRefusedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapRequest,
): VideoPlaybackBootstrapError | null {
  const refused = refusedBootstraps.get(requestKey(options));
  return refused && refusalStillStands(refused) ? refused.error : null;
}

export function clearVideoPlaybackBootstrapCache(): void {
  bootstrapRequests.clear();
  refusedBootstraps.clear();
  playbackTokenRequests.clear();
  bootstrapCache.clear();
}
