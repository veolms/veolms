import {
  getEarlyShakaPreloadSession,
  startEarlyShakaPreload,
} from "@veolms/video-player/shaka-preload";
import {
  readLearningHlsBootstrapFromDocument,
  readLearningPlaybackRequestMetadataFromDocument,
  readLearningPlaybackRequestMetadataFromPath,
  type LearningHlsBootstrap,
  type LearningPlaybackRequestMetadata,
} from "./learningHlsBootstrap";
import { createLearningHlsPreloadSource } from "./player/learningHlsPreloadSource";
import { toAbsoluteLearningMediaUrl } from "./player/learningHlsConstants";
import {
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "./videoPlaybackBootstrap";
import { prefersReducedData } from "../lib/reduced-data";
import { installSegmentCache } from "./player/segmentCache";

// Before this module loads the player's runtime (see segmentCache.ts).
installSegmentCache();

let inFlight:
  | {
      key: string;
      promise: ReturnType<typeof startEarlyShakaPreload>;
    }
  | undefined;
let latestRequestKey: string | undefined;

function getRequestKey(
  bootstrap: LearningHlsBootstrap | null,
  requestMetadata: LearningPlaybackRequestMetadata | null,
): string | undefined {
  if (requestMetadata) {
    return `${requestMetadata.courseSlug}\u0000${requestMetadata.lessonNumber}`;
  }
  if (bootstrap) {
    return `manifest\u0000${bootstrap.mediaKey}\u0000${bootstrap.manifestUrl}`;
  }
  return undefined;
}

function mark(name: string): void {
  try {
    performance.mark(`veo:${name}`);
  } catch {
    // Performance marks are diagnostic only.
  }
}

const preconnectedOrigins = new Set<string>();

/**
 * Opens the connection to the media CDN as soon as the bootstrap names it,
 * so its DNS and TLS handshake happen while Shaka and the licence load
 * instead of in front of the first segment. The build-time preconnect in the
 * document head only exists when the web build knows the CDN address.
 */
function preconnectToMediaOrigin(manifestUrl: string): void {
  if (typeof document === "undefined") return;
  let origin: string;
  try {
    const url = new URL(manifestUrl, window.location.href);
    if (url.origin === window.location.origin) return;
    origin = url.origin;
  } catch {
    return;
  }
  if (preconnectedOrigins.has(origin)) return;
  preconnectedOrigins.add(origin);
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  // Segment requests carry no cookies: warm the same (anonymous) connection.
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

function startPreloadForBootstrap(
  bootstrap: LearningHlsBootstrap,
  protectedPlayback: boolean,
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>,
  speculative = false,
  segmentPrefetchLimit?: number,
) {
  const key = `${bootstrap.mediaKey}\u0000${bootstrap.manifestUrl}`;
  if (inFlight?.key === key) return inFlight.promise;

  preconnectToMediaOrigin(bootstrap.manifestUrl);
  mark("learning-bootstrap-ready");
  const promise = startEarlyShakaPreload(
    createLearningHlsPreloadSource({
      manifestUrl: bootstrap.manifestUrl,
      mediaKey: bootstrap.mediaKey || undefined,
      protectedPlayback,
      segmentToken: bootstrap.segmentToken,
      segmentTokenExpiresAt: bootstrap.segmentTokenExpiresAt,
      inlinedMasterManifest: bootstrap.inlinedMasterManifest,
      refreshSegmentToken,
      segmentPrefetchLimit,
    }),
    { speculative },
  );
  inFlight = { key, promise };
  mark("shaka-preload-started");
  void promise.then(
    () => {
      if (inFlight?.promise === promise) inFlight = undefined;
    },
    () => {
      if (inFlight?.promise === promise) inFlight = undefined;
    },
  );
  return promise;
}

export async function startEarlyHlsPreload(
  bootstrap: LearningHlsBootstrap | null = readLearningHlsBootstrapFromDocument(),
  requestMetadata: LearningPlaybackRequestMetadata | null = readLearningPlaybackRequestMetadataFromDocument(),
) {
  const requestKey = getRequestKey(bootstrap, requestMetadata);
  if (requestKey) latestRequestKey = requestKey;

  if (bootstrap) return startPreloadForBootstrap(bootstrap, false);

  if (!requestMetadata) {
    // A lesson page without meta tags (the SPA fallback): only ask for its
    // bootstrap now, so it is ready when the page asks. The player itself is
    // left to the page, which creates it after extensions (such as DRM) have
    // set Shaka up; a player made this early would miss their settings.
    const fromAddress =
      typeof location === "undefined"
        ? null
        : readLearningPlaybackRequestMetadataFromPath(location.pathname);
    if (fromAddress) {
      void getVideoPlaybackBootstrap(fromAddress)
        .then((early) => preconnectToMediaOrigin(early.manifestUrl))
        .catch(() => undefined);
    }
    return null;
  }

  try {
    const playbackBootstrap = await getVideoPlaybackBootstrap({
      courseSlug: requestMetadata.courseSlug,
      lessonNumber: requestMetadata.lessonNumber,
    });
    if (requestKey !== latestRequestKey) return null;
    mark("playback-bootstrap-ready");
    const refreshSegmentToken = playbackBootstrap.segmentToken
      ? async () => {
          const token = await refreshVideoPlaybackToken(requestMetadata);
          return { token: token.token, expiresAt: token.expiresAt };
        }
      : undefined;
    return startPreloadForBootstrap(
      playbackBootstrap,
      playbackBootstrap.source === "paid-bootstrap-api",
      refreshSegmentToken,
    );
  } catch {
    mark("playback-bootstrap-failed");
    return null;
  }
}

/** How long the pointer rests on a lesson before it is preloaded. */
export const LESSON_HOVER_PRELOAD_DELAY_MS = 120;

/** The lesson preloaded speculatively (hover or next-up), by manifest URL. */
let speculativeManifestUrl: string | undefined;

/**
 * A speculative preload replaces the page's single preload session. That is
 * fine when the session is another speculative one, but never when it is
 * the open lesson's own preload still waiting for its player to mount.
 */
function mayReplacePreloadSession(): boolean {
  const session = getEarlyShakaPreloadSession();
  if (!session || session.consumed) return true;
  return session.manifestUrl === speculativeManifestUrl;
}

/**
 * Gets a lesson ready to start the moment it is opened: its playback
 * bootstrap (kept for the click that follows) and, unless the connection is
 * asking to save data, a Shaka preload of its manifest and first segments,
 * from where the learner left off. `segments`: how many to fetch past the
 * start (one by default). Every failure is silent; opening the lesson then
 * works as it always has.
 */
export async function preloadLessonPlayback(
  courseSlug: string,
  lessonNumber: number,
  options: { segments?: number } = {},
): Promise<void> {
  if (!courseSlug || !Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return;
  }
  const requestMetadata = { courseSlug, lessonNumber };
  let playbackBootstrap: Awaited<ReturnType<typeof getVideoPlaybackBootstrap>>;
  try {
    playbackBootstrap = await getVideoPlaybackBootstrap(requestMetadata);
  } catch {
    return;
  }
  if (prefersReducedData() || !mayReplacePreloadSession()) return;

  const refreshSegmentToken = playbackBootstrap.segmentToken
    ? async () => {
        const token = await refreshVideoPlaybackToken(requestMetadata);
        return { token: token.token, expiresAt: token.expiresAt };
      }
    : undefined;
  speculativeManifestUrl = toAbsoluteLearningMediaUrl(
    playbackBootstrap.manifestUrl,
  );
  await startPreloadForBootstrap(
    playbackBootstrap,
    playbackBootstrap.source === "paid-bootstrap-api",
    refreshSegmentToken,
    true,
    options.segments,
  ).catch(() => null);
}

/**
 * Preloads a lesson once the pointer (or focus) has rested on it for
 * `LESSON_HOVER_PRELOAD_DELAY_MS`, so a click a moment later starts from
 * memory. Call the returned function on leave/blur; it cancels a preload
 * that has not started yet.
 */
export function scheduleLessonHoverPreload(
  courseIdOrSlug: string,
  lessonNumber: number,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const timer = window.setTimeout(() => {
    void preloadLessonPlayback(courseIdOrSlug, lessonNumber);
  }, LESSON_HOVER_PRELOAD_DELAY_MS);
  return () => window.clearTimeout(timer);
}
