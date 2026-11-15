import type {
  PlaybackIncident,
  PlaybackIncidentRequest,
} from "@veolms/web-core";
import { trackPlaybackIncident } from "../../lib/analytics-track";
import { readDeviceTier } from "./deviceTier";

/**
 * What a playback incident carries besides its kind: the moment in the
 * video and the state of the connection, the device and the last requests,
 * so a stuck or failed video can be explained from the analytics alone.
 */
export interface PlaybackIncidentContext {
  playbackId: string;
  courseKey: string;
  lessonNumber: number | null;
  mediaKey: string;
  /** The first frame has been shown. */
  started: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  qualityHeight: number | null;
  bufferAheadSeconds: number | null;
}

/** Requests worth showing beside an incident: the video's own. */
const VIDEO_REQUEST =
  /\.(?:m4s|mp4|ts|mpd|m3u8)(?:[?#]|$)|\/clearkey\/license|\/playback-(?:bootstrap|token)|\/storyboard/iu;
/** The newest requests kept with an incident, and how far back they go. */
const MAX_REQUESTS = 10;
const REQUEST_WINDOW_MS = 90_000;
/** `veo:` performance marks kept with an incident. */
const MAX_MARKS = 12;
/** Incidents one page sends at most per hour, whatever happens. */
const MAX_PER_HOUR = 60;

let sentTimes: number[] = [];

/** The last part of a request's path, without its query (the token). */
function requestPath(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.split("/").slice(-2).join("/").slice(0, 80);
  } catch {
    return url.split("?")[0]!.slice(-80);
  }
}

function recentVideoRequests(): PlaybackIncidentRequest[] {
  if (typeof performance === "undefined") return [];
  const now = performance.now();
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const picked: PlaybackIncidentRequest[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (now - entry.responseEnd > REQUEST_WINDOW_MS) break;
    if (!VIDEO_REQUEST.test(entry.name)) continue;
    picked.push({
      path: requestPath(entry.name),
      status: entry.responseStatus ?? 0,
      ms: Math.round(entry.duration),
      kb: Math.round((entry.transferSize ?? 0) / 1024),
      agoMs: Math.round(now - entry.responseEnd),
    });
    if (picked.length === MAX_REQUESTS) break;
  }
  return picked.reverse();
}

function recentMarks(): string[] {
  if (typeof performance === "undefined") return [];
  try {
    return performance
      .getEntriesByType("mark")
      .filter((mark) => mark.name.startsWith("veo:"))
      .slice(-MAX_MARKS)
      .map((mark) => {
        const detail = (mark as PerformanceMark).detail as {
          code?: unknown;
          attempt?: unknown;
        } | null;
        const extra =
          detail && typeof detail === "object"
            ? [detail.code, detail.attempt].filter((value) => value != null)
            : [];
        return [mark.name.slice(4), ...extra].join(":").slice(0, 60);
      });
  } catch {
    return [];
  }
}

function connection(): { connectionType?: string; downlinkMbps?: number } {
  const info =
    typeof navigator === "undefined"
      ? undefined
      : (
          navigator as Navigator & {
            connection?: { effectiveType?: string; downlink?: number };
          }
        ).connection;
  return {
    ...(typeof info?.effectiveType === "string"
      ? { connectionType: info.effectiveType.slice(0, 16) }
      : {}),
    ...(typeof info?.downlink === "number" && Number.isFinite(info.downlink)
      ? { downlinkMbps: Math.round(info.downlink * 10) / 10 }
      : {}),
  };
}

/** Whether another incident may go out (see MAX_PER_HOUR). */
function underHourlyLimit(): boolean {
  const now = Date.now();
  sentTimes = sentTimes.filter((at) => now - at < 60 * 60_000);
  if (sentTimes.length >= MAX_PER_HOUR) return false;
  sentTimes.push(now);
  return true;
}

/**
 * Sends one incident to the analytics sink (nothing without one), with
 * everything that helps explain it. Never throws.
 */
export function reportPlaybackIncident(
  kind: PlaybackIncident["kind"],
  context: PlaybackIncidentContext,
  fields: {
    code?: string;
    httpStatus?: number | null;
    waitedMs?: number;
    attempts?: number;
  } = {},
): void {
  try {
    if (!context.courseKey || !underHourlyLimit()) return;
    const device = readDeviceTier();
    const round = (value: number | null) =>
      value === null || !Number.isFinite(value)
        ? null
        : Math.round(value * 10) / 10;
    trackPlaybackIncident({
      playbackId: context.playbackId,
      courseKey: context.courseKey,
      lessonNumber: context.lessonNumber,
      mediaKey: context.mediaKey,
      kind,
      at: new Date().toISOString(),
      started: context.started,
      positionSeconds: round(context.positionSeconds),
      durationSeconds: round(context.durationSeconds),
      ...(context.qualityHeight !== null
        ? { qualityHeight: context.qualityHeight }
        : {}),
      ...(context.bufferAheadSeconds !== null
        ? { bufferAheadSeconds: round(context.bufferAheadSeconds) ?? 0 }
        : {}),
      ...(fields.code ? { code: fields.code.slice(0, 64) } : {}),
      ...(typeof fields.httpStatus === "number"
        ? { httpStatus: fields.httpStatus }
        : {}),
      ...(fields.waitedMs !== undefined
        ? { waitedMs: Math.round(fields.waitedMs) }
        : {}),
      ...(fields.attempts !== undefined ? { attempts: fields.attempts } : {}),
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      pageVisible:
        typeof document === "undefined" ||
        document.visibilityState === "visible",
      ...connection(),
      ...(device.deviceMemoryGb !== null
        ? { deviceMemoryGb: device.deviceMemoryGb }
        : {}),
      ...(device.cpuCores !== null ? { cpuCores: device.cpuCores } : {}),
      requests: recentVideoRequests(),
      marks: recentMarks(),
    });
  } catch {
    // Diagnostics never break playback.
  }
}
