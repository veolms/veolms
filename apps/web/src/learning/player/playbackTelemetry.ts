import {
  networkFailureHttpStatus,
  type VideoPlayerEvent,
} from "@veolms/video-player";
import type { PlaybackSummary } from "@veolms/web-core";
import { trackPlayback } from "../../lib/analytics-track";
import { readDeviceTier } from "./deviceTier";
import {
  getTokenRefreshStats,
  type TokenRefreshStats,
} from "./learningHlsConstants";
import { getSegmentCacheStats, type SegmentCacheStats } from "./segmentCache";

export interface PlaybackTelemetryContext {
  courseKey: string | null;
  lessonNumber: number | null;
}

interface OpenPlayback {
  playbackId: string;
  mediaKey: string;
  /** Known at the load, or looked up again when the playback ends. */
  courseKey: string | null;
  lessonNumber: number | null;
  startedAt: number;
  loadStartedAt: number;
  /** When play was asked for; a video left ready and played later starts
   * its clock here, not at the load. */
  playRequestedAt: number | null;
  firstFrameAt: number | null;
  errorCode: string | undefined;
  errorHttpStatus: number | undefined;
  /** Errors the player got over by itself (see `recoveredErrors`). */
  recoveredErrors: number;
  /** Streaming retries the engine reported (see `streamingretry`). */
  streamingRetries: number;
  /** The token renewal counts when the load started. */
  tokenRefreshAtStart: TokenRefreshStats;
  bufferingSince: number | null;
  bufferingCount: number;
  bufferingMs: number;
  playing: boolean;
  lastMediaTime: number | null;
  watchedSeconds: number;
  currentHeight: number | null;
  secondsByHeight: Map<number, number>;
  /** The segment cache's counts when the load started. */
  segmentCacheAtStart: SegmentCacheStats;
}

/** What the segment cache did between two readings of its counts. */
function segmentCacheSince(
  start: SegmentCacheStats,
): PlaybackSummary["segmentCache"] {
  const now = getSegmentCacheStats();
  const delta = {
    hits: now.hits - start.hits,
    misses: now.misses - start.misses,
    bytesFromCache: now.bytesFromCache - start.bytesFromCache,
    bytesFromNetwork: now.bytesFromNetwork - start.bytesFromNetwork,
    skippedForReserve: now.skippedForReserve - start.skippedForReserve,
    lessonsEvicted: now.lessonsEvicted - start.lessonsEvicted,
  };
  return delta.hits || delta.misses || delta.bytesFromNetwork
    ? delta
    : undefined;
}

/** A gap between two time updates larger than this is a seek, not play. */
const MAX_TIMEUPDATE_STEP_SECONDS = 2;
/**
 * Play asked for this long ago with no frame shown yet, when the playback
 * is given up on: reported as a failed start (`STUCK_START`).
 */
const STUCK_START_MS = 8_000;

/**
 * Turns the player's events into one {@link PlaybackSummary} per video
 * played, handed to the analytics sink when the video is unloaded, fails,
 * or the page is left. Startup is measured from the load starting to the
 * first frame; buffering counts only after that first frame, so a slow
 * start is not also a rebuffer. Nothing is kept once reported.
 */
export function createPlaybackTelemetry(
  getContext: () => PlaybackTelemetryContext,
): {
  handle: (event: VideoPlayerEvent) => void;
  flush: () => void;
} {
  let open: OpenPlayback | null = null;

  const finish = (reason: "unloaded" | "error" | "flush") => {
    const playback = open;
    if (!playback) return;
    open = null;
    if (playback.bufferingSince !== null) {
      playback.bufferingMs += performance.now() - playback.bufferingSince;
    }
    // The course key arrives through a prop that can settle after the
    // load has started; asked again now, so an early load is not lost.
    const context = getContext();
    const courseKey = playback.courseKey ?? context.courseKey;
    if (!courseKey) return;
    const now = Date.now();
    const device = readDeviceTier();
    const stuckStart =
      reason !== "error" &&
      playback.firstFrameAt === null &&
      playback.playRequestedAt !== null &&
      performance.now() - playback.playRequestedAt >= STUCK_START_MS;
    const summary: PlaybackSummary = {
      playbackId: playback.playbackId,
      courseKey,
      lessonNumber: playback.lessonNumber ?? context.lessonNumber,
      mediaKey: playback.mediaKey,
      startedAt: new Date(playback.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      startupMs:
        playback.firstFrameAt === null
          ? null
          : Math.max(
              0,
              Math.round(
                playback.firstFrameAt -
                  Math.max(
                    playback.loadStartedAt,
                    playback.playRequestedAt ?? playback.loadStartedAt,
                  ),
              ),
            ),
      // A video whose first frame never came, given up on (the page
      // left, another lesson opened) after waiting this long, failed to
      // start as surely as one that errored; it used to go unreported.
      startFailed:
        playback.firstFrameAt === null && (reason === "error" || stuckStart),
      ...(playback.errorCode
        ? { errorCode: playback.errorCode }
        : stuckStart
          ? { errorCode: "STUCK_START" }
          : {}),
      ...(playback.errorHttpStatus !== undefined
        ? { errorHttpStatus: playback.errorHttpStatus }
        : {}),
      streamingRetries: playback.streamingRetries,
      recoveredErrors: playback.recoveredErrors,
      tokenRefreshFailures:
        getTokenRefreshStats().failures - playback.tokenRefreshAtStart.failures,
      ...(device.deviceMemoryGb !== null
        ? { deviceMemoryGb: device.deviceMemoryGb }
        : {}),
      ...(device.cpuCores !== null ? { cpuCores: device.cpuCores } : {}),
      bufferingCount: playback.bufferingCount,
      bufferingMs: Math.round(playback.bufferingMs),
      watchedSeconds: Math.round(playback.watchedSeconds),
      qualities: [...playback.secondsByHeight.entries()]
        .map(([height, seconds]) => ({ height, seconds: Math.round(seconds) }))
        .filter((entry) => entry.seconds > 0),
    };
    const segmentCache = segmentCacheSince(playback.segmentCacheAtStart);
    if (segmentCache) summary.segmentCache = segmentCache;
    // A load that was abandoned before anything happened says nothing.
    if (
      summary.startupMs === null &&
      !summary.startFailed &&
      summary.watchedSeconds === 0
    ) {
      return;
    }
    trackPlayback(summary);
  };

  const handle = (event: VideoPlayerEvent) => {
    switch (event.type) {
      case "loadstart": {
        finish("unloaded");
        const context = getContext();
        open = {
          playbackId: crypto.randomUUID(),
          mediaKey: event.detail.source.id ?? "",
          courseKey: context.courseKey,
          lessonNumber: context.lessonNumber,
          startedAt: Date.now(),
          loadStartedAt: performance.now(),
          playRequestedAt: null,
          firstFrameAt: null,
          errorCode: undefined,
          errorHttpStatus: undefined,
          recoveredErrors: 0,
          streamingRetries: 0,
          tokenRefreshAtStart: getTokenRefreshStats(),
          bufferingSince: null,
          bufferingCount: 0,
          bufferingMs: 0,
          playing: false,
          lastMediaTime: null,
          watchedSeconds: 0,
          currentHeight: null,
          secondsByHeight: new Map(),
          segmentCacheAtStart: getSegmentCacheStats(),
        };
        return;
      }
      case "play": {
        if (
          open &&
          open.firstFrameAt === null &&
          open.playRequestedAt === null
        ) {
          open.playRequestedAt = performance.now();
        }
        return;
      }
      case "playing": {
        if (!open) return;
        open.playing = true;
        open.lastMediaTime = null;
        if (open.firstFrameAt === null) {
          open.firstFrameAt = performance.now();
        }
        return;
      }
      case "pause":
      case "ended": {
        if (!open) return;
        open.playing = false;
        open.lastMediaTime = null;
        return;
      }
      case "seeking":
      case "seeked": {
        if (open) open.lastMediaTime = null;
        return;
      }
      case "timeupdate": {
        if (!open || !open.playing) return;
        const mediaTime = event.detail.currentTime;
        const previous = open.lastMediaTime;
        open.lastMediaTime = mediaTime;
        if (previous === null) return;
        const step = mediaTime - previous;
        if (step <= 0 || step > MAX_TIMEUPDATE_STEP_SECONDS) return;
        open.watchedSeconds += step;
        if (open.currentHeight !== null) {
          open.secondsByHeight.set(
            open.currentHeight,
            (open.secondsByHeight.get(open.currentHeight) ?? 0) + step,
          );
        }
        return;
      }
      case "bufferingchange": {
        if (!open || open.firstFrameAt === null) return;
        if (event.detail.buffering) {
          if (open.bufferingSince === null) {
            open.bufferingSince = performance.now();
            open.bufferingCount += 1;
          }
        } else if (open.bufferingSince !== null) {
          open.bufferingMs += performance.now() - open.bufferingSince;
          open.bufferingSince = null;
        }
        return;
      }
      case "qualitychange": {
        if (!open) return;
        open.currentHeight = event.detail.quality?.height ?? null;
        return;
      }
      case "streamingretry": {
        if (open) open.streamingRetries += 1;
        return;
      }
      case "error": {
        if (!open) return;
        const error = event.detail.error;
        // An error the player got over by itself (Shaka switching away
        // from a quality the CDN refused, a decode hiccup it reset) used to
        // close the summary as a failure, so the rest of the lesson went
        // unrecorded and the Viewing tab counted an error no learner saw.
        // It is counted and the playback goes on.
        if (!error.fatal) {
          open.recoveredErrors += 1;
          return;
        }
        open.errorCode =
          error.code !== undefined ? String(error.code) : "unknown";
        const status = networkFailureHttpStatus(error);
        open.errorHttpStatus = status === null ? undefined : status;
        finish("error");
        return;
      }
      case "unloaded": {
        finish("unloaded");
        return;
      }
      default:
        return;
    }
  };

  return { handle, flush: () => finish("flush") };
}
