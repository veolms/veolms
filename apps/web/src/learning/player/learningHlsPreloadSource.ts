import { readStartPosition } from "./lessonPlayerPersistence";
import {
  createLearningHlsRequestFilter,
  LEARNING_HLS_MIME_TYPE,
  learningHlsStreaming,
  toAbsoluteLearningMediaUrl,
} from "./learningHlsConstants";

function shouldResumeFromLastPosition(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = JSON.parse(
      localStorage.getItem("veolms-learning-preferences") || "{}",
    ) as { resumeFromLastPosition?: unknown };
    if (typeof stored.resumeFromLastPosition === "boolean") {
      return stored.resumeFromLastPosition;
    }
  } catch {
    // Prefer the product default when preference storage is unavailable.
  }
  return true;
}

// A preload fetches its first segments through Shaka's segment prefetch, so
// it needs one; playback itself runs without (see the video player's
// SHAKA_SEGMENT_PREFETCH_LIMIT), and the player switches to that when it
// takes the preload over.
const PRELOAD_SEGMENT_PREFETCH_LIMIT = 1;

export function createLearningHlsPreloadSource(options: {
  manifestUrl: string;
  mediaKey?: string;
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  /** The master playlist from the bootstrap, served in place of fetching it. */
  inlinedMasterManifest?: string;
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>;
  /**
   * How many segments the preload fetches past the start; one unless the
   * lesson is very likely to be opened next (the home page's).
   */
  segmentPrefetchLimit?: number;
}) {
  const startTime =
    options.mediaKey && shouldResumeFromLastPosition()
      ? readStartPosition(options.mediaKey)
      : 0;
  const isDash = /\.mpd(?:$|[?#])/i.test(options.manifestUrl);
  return {
    id: options.mediaKey,
    src: toAbsoluteLearningMediaUrl(options.manifestUrl),
    type: isDash ? "application/dash+xml" : LEARNING_HLS_MIME_TYPE,
    kind: isDash ? ("dash" as const) : ("hls" as const),
    startTime,
    streaming: {
      ...learningHlsStreaming(options.manifestUrl),
      segmentPrefetchLimit:
        options.segmentPrefetchLimit ?? PRELOAD_SEGMENT_PREFETCH_LIMIT,
    },
    inlinedManifest: options.inlinedMasterManifest,
    networking: {
      requestFilter: createLearningHlsRequestFilter({
        protectedPlayback: options.protectedPlayback,
        segmentToken: options.segmentToken,
        segmentTokenExpiresAt: options.segmentTokenExpiresAt,
        refreshSegmentToken: options.refreshSegmentToken,
      }),
    },
  };
}
