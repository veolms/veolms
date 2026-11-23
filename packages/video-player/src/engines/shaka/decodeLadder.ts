import type { VideoEngineError } from "../../core/errors";

/**
 * What the player does when the browser cannot decode a part of a video
 * (owner and team, 23 Nov 2026, "Lesson video decode errors"). Old encodes
 * have segments that start on a scene-change I-frame flagged as a
 * keyframe; where the next frames point back into the previous segment,
 * desktop Chrome fails with PIPELINE_ERROR_DECODE. The player used to
 * reload the same spot in the same quality and fail again, in a loop.
 *
 * The ladder, stopping at the first step that works:
 * 1. step down one quality at that spot (even a quality chosen by hand);
 * 2. once past it, test the higher quality in a hidden player, and come
 *    back up when it decodes;
 * 3. if the higher quality fails again in this lesson, stay lower for the
 *    lesson (remembered on this device for a week);
 * 4. if the lower quality fails at the same spot too, skip to the next
 *    segment (at most about 6 s);
 * 5. after DECODE_ERRORS_BEFORE_STOP errors within DECODE_ERROR_WINDOW_MS,
 *    or a skip that did not help: the error screen, no more reloads.
 */

export const DECODE_ERROR_WINDOW_MS = 60_000;
export const DECODE_ERRORS_BEFORE_STOP = 3;
/** How long "stay at the lower quality for this lesson" is kept. */
const STAY_LOWER_KEEP_MS = 7 * 24 * 60 * 60_000;
const STAY_LOWER_KEY = "veolms.lowerQualityLessons";
/** A background test that has not finished by then counts as failed. */
const PROBE_TIMEOUT_MS = 20_000;

/** A decode failure, as opposed to a network, licence or support one. */
export function isDecodeError(error: VideoEngineError): boolean {
  if (error.code === "MEDIA_ERR_DECODE") return true;
  // Shaka reports the same failure as 3016 (VIDEO_ERROR), with the
  // browser's words in its details.
  let details = "";
  try {
    details = JSON.stringify(error.details ?? "");
  } catch {
    // Not serialisable: the message alone decides.
  }
  return /PIPELINE_ERROR_DECODE|video decode error|MEDIA_ERR_DECODE/iu.test(
    `${error.message} ${details}`,
  );
}

/**
 * The browser's own words for a decode failure ("PIPELINE_ERROR_DECODE:
 * video decode error" in Chrome), wherever the error keeps them.
 */
export function browserDecodeText(error: VideoEngineError): string {
  let details = "";
  try {
    details = JSON.stringify(error.details ?? "");
  } catch {
    // Not serialisable: the message alone.
  }
  // The message first, then the data (as JSON, so the words end at a quote).
  const words = /[A-Za-z:]*PIPELINE_ERROR_[A-Z_]+(?::[^"\\]{0,100})?/u;
  const pipeline = words.exec(error.message)?.[0] ?? words.exec(details)?.[0];
  return (pipeline ?? error.message).trim().slice(0, 120);
}

/**
 * A segment the browser refused to take in (Chrome:
 * "CHUNK_DEMUXER_ERROR_APPEND_FAILED: Failed to prepare video sample for
 * decode"): it fails as it is added, at the end of what is buffered, not
 * where the video is playing.
 */
export function isAppendFailure(error: VideoEngineError): boolean {
  return /APPEND_FAILED|prepare video sample/iu.test(browserDecodeText(error));
}

/** The end of the buffered range that holds `time`, if there is one. */
export function bufferedEndAt(
  media: HTMLMediaElement,
  time: number,
): number | null {
  try {
    const ranges = media.buffered;
    for (let index = 0; index < ranges.length; index += 1) {
      if (ranges.start(index) <= time + 0.1 && time < ranges.end(index)) {
        return ranges.end(index);
      }
    }
  } catch {
    // A media element in error may refuse: the playing position is used.
  }
  return null;
}

type StayLowerStore = Record<string, { height: number; at: number }>;

function readStore(): StayLowerStore {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STAY_LOWER_KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object"
      ? (parsed as StayLowerStore)
      : {};
  } catch {
    return {};
  }
}

/** The quality a lesson stays at on this device, if one was remembered. */
export function rememberedLowerHeight(lessonKey: string): number | null {
  const entry = readStore()[lessonKey];
  if (!entry || Date.now() - entry.at > STAY_LOWER_KEEP_MS) return null;
  return entry.height;
}

export function rememberLowerHeight(lessonKey: string, height: number): void {
  try {
    const now = Date.now();
    const kept = Object.fromEntries(
      Object.entries(readStore()).filter(
        ([, entry]) => now - entry.at < STAY_LOWER_KEEP_MS,
      ),
    );
    kept[lessonKey] = { height, at: now };
    localStorage.setItem(STAY_LOWER_KEY, JSON.stringify(kept));
  } catch {
    // Storage refused: the lesson stays lower for this visit only.
  }
}

/**
 * Whether the higher quality may be tested in the background here: a
 * computer (a precise pointer), not saving data, on a good connection. A
 * test costs about 2-3 MB at 1080p, once per bad spot.
 */
export function backgroundTestAllowed(): boolean {
  if (typeof window === "undefined" || typeof MediaSource === "undefined") {
    return false;
  }
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && connection.effectiveType !== "4g") {
    return false;
  }
  return window.matchMedia?.("(pointer: fine)").matches === true;
}

export interface ProbeInput {
  /** `video/mp4; codecs="…"` of the quality to test. */
  mimeType: string;
  initUri: string | null;
  /** The segment before the spot to test, then the two after it. */
  segmentUris: readonly string[];
  fetchBytes: (uri: string) => Promise<ArrayBuffer>;
  /** Why the test could not say (for the playback marks). */
  onUnknown?: (reason: string) => void;
}

/**
 * Plays `segmentUris` in a hidden, muted video of its own, appended the
 * way the player appends them (each after `abort()`, which is what makes
 * Chrome drop the previous segment's last frame), and says whether every
 * frame decoded. Decoding one segment alone, or with WebCodecs, would pass
 * a segment that fails in the player.
 */
export async function probeDecodes(
  input: ProbeInput,
): Promise<"ok" | "failed" | "unknown"> {
  if (
    typeof MediaSource === "undefined" ||
    !MediaSource.isTypeSupported(input.mimeType)
  ) {
    input.onUnknown?.(`unsupported ${input.mimeType}`);
    return "unknown";
  }
  let video: HTMLVideoElement | null = null;
  let objectUrl: string | null = null;
  try {
    const [init, ...segments] = await Promise.all([
      input.initUri ? input.fetchBytes(input.initUri) : Promise.resolve(null),
      ...input.segmentUris.map((uri) => input.fetchBytes(uri)),
    ]);
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText =
      "position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.append(video);
    const mediaSource = new MediaSource();
    objectUrl = URL.createObjectURL(mediaSource);
    video.src = objectUrl;
    await new Promise<void>((resolve) =>
      mediaSource.addEventListener("sourceopen", () => resolve(), {
        once: true,
      }),
    );
    const buffer = mediaSource.addSourceBuffer(input.mimeType);
    const append = (bytes: ArrayBuffer) =>
      new Promise<void>((resolve, reject) => {
        buffer.addEventListener("updateend", () => resolve(), { once: true });
        buffer.addEventListener("error", () => reject(new Error("append")), {
          once: true,
        });
        buffer.appendBuffer(bytes);
      });
    if (init) await append(init);
    for (const segment of segments) {
      if (!buffer.updating) buffer.abort();
      await append(segment);
    }
    if (buffer.buffered.length === 0) {
      input.onUnknown?.("nothing buffered");
      return "unknown";
    }
    const start = buffer.buffered.start(0);
    const end = buffer.buffered.end(buffer.buffered.length - 1);
    const media = video;
    return await new Promise<"ok" | "failed" | "unknown">((resolve) => {
      const timer = window.setTimeout(() => {
        input.onUnknown?.(
          `timeout at ${media.currentTime.toFixed(2)} of ${end.toFixed(2)}`,
        );
        finish("unknown");
      }, PROBE_TIMEOUT_MS);
      const check = () => {
        // The last frames before the end of what was appended may never
        // be shown (the video waits for more): within a second is through.
        if (media.currentTime >= end - 1 || media.ended) finish("ok");
      };
      const fail = () => finish("failed");
      function finish(result: "ok" | "failed" | "unknown") {
        window.clearTimeout(timer);
        media.removeEventListener("timeupdate", check);
        media.removeEventListener("waiting", check);
        media.removeEventListener("error", fail);
        resolve(result);
      }
      media.addEventListener("timeupdate", check);
      media.addEventListener("waiting", check);
      media.addEventListener("error", fail);
      media.currentTime = start;
      media.playbackRate = 4;
      void media.play().catch((error: unknown) => {
        input.onUnknown?.(`play: ${String(error).slice(0, 80)}`);
        finish("unknown");
      });
    });
  } catch (error) {
    input.onUnknown?.(String(error).slice(0, 100));
    return "unknown";
  } finally {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
