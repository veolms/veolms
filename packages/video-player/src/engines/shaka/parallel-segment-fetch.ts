/**
 * How many segments to fetch at once.
 *
 * One at a time is right for almost all playback: a segment arrives several
 * times faster than it plays. It stops being enough when a fetch takes long
 * next to how fast segments are used up. At 16× a video cut into 2 s
 * segments uses 8 a second; a segment Cloudflare does not hold near the
 * learner takes 0.2-0.8 s to start arriving, whatever the connection, so one
 * at a time brings about 3 a second and the video plays at 5-6× with a stop
 * every second (measured on production and on localhost, 20 Nov 2026, on a
 * 200 Mbps link; the same 16 segments asked for together arrived in 0.84 s).
 *
 * Playback uses `rate / segmentSeconds` segments a second and `count`
 * fetches running together bring `count / fetchSeconds`, so
 *
 *   count ≥ rate × fetchSeconds / segmentSeconds
 *
 * The same rule covers every speed and segment length: at normal speeds it
 * answers 1, and for 6 s segments a third of what 2 s ones need.
 */

/**
 * Room over what the rule asks for. Segments are appended in order, so the
 * slowest of those under way holds back the ones that arrived before it.
 */
const HEADROOM = 1.5;
/**
 * Under this much of what one fetch after another brings, one at a time is
 * kept: it keeps up (a 2 s-segment video at 2× whose fetches took 0.7 s
 * played without a wait, its buffer growing), and fetching together has
 * costs of its own (see `LINK_BOUND_SHARE`, and what a seek throws away).
 */
const ONE_AT_A_TIME_KEEPS_UP = 0.8;
/**
 * Never more than this at once. Audio kept apart from the video is fetched
 * the same way beside it, so twice this many requests can be open.
 */
export const PARALLEL_SEGMENT_FETCH_MAX = 8;
/** What a fetch is taken to last until this page has timed a few. */
export const ASSUMED_SEGMENT_FETCH_SECONDS = 0.4;
/**
 * From this share of the link the link itself is what holds the video back,
 * not the waiting: fetching together then brings nothing sooner, and each
 * download looks slower to the quality chooser than the link is.
 */
const LINK_BOUND_SHARE = 0.5;

export function parallelSegmentFetchCount(options: {
  /** The speed the video plays at (1 is normal). */
  rate: number;
  /** How long the segments about to be fetched play for, in seconds. */
  segmentSeconds: number | null;
  /** Seconds a segment takes from asked for to arrived; null when not timed. */
  fetchSeconds: number | null;
  /** What the link carries (bits per second); null when not measured. */
  bandwidth?: number | null;
  /** What the playing video takes at normal speed (bits per second). */
  bitrate?: number | null;
}): number {
  const { rate, segmentSeconds, bandwidth, bitrate } = options;
  if (!(rate > 0) || !segmentSeconds || !(segmentSeconds > 0)) return 1;
  const fetchSeconds = options.fetchSeconds ?? ASSUMED_SEGMENT_FETCH_SECONDS;
  if (!(fetchSeconds > 0)) return 1;
  if (
    bandwidth &&
    bitrate &&
    bandwidth > 0 &&
    bitrate > 0 &&
    (rate * bitrate) / bandwidth >= LINK_BOUND_SHARE
  ) {
    return 1;
  }
  const needed = (rate * fetchSeconds) / segmentSeconds;
  if (needed < ONE_AT_A_TIME_KEEPS_UP) return 1;
  // A hair over a whole number is that number (0.1 + 0.2 is not 0.3).
  return Math.min(
    PARALLEL_SEGMENT_FETCH_MAX,
    Math.max(1, Math.ceil(HEADROOM * needed - 1e-9)),
  );
}

/**
 * Shaka's `segmentPrefetchLimit` for `count` segments at once at `rate`.
 * Shaka 5.2.7 fetches `ceil(limit × rate)` together, the one being appended
 * included, so the limit is the count over the rate (half a segment under,
 * so that rounding never asks for one more). 0, Shaka's plain one at a
 * time, for a count of 1.
 */
export function segmentPrefetchLimitFor(count: number, rate: number): number {
  if (!(count > 1) || !(rate > 0)) return 0;
  return (count - 0.5) / rate;
}

/** The fields of a `PerformanceResourceTiming` this module reads. */
export interface SegmentFetchTiming {
  name: string;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  encodedBodySize: number;
  transferSize: number;
}

export interface SegmentFetchMeasure {
  /** Seconds from asked for to arrived (upper quartile). */
  fetchSeconds: number | null;
  /** The fastest a segment's body arrived (bits per second). */
  bandwidth: number | null;
  /** The size of a segment, in bytes (mean). */
  meanBytes: number | null;
}

const SEGMENT_ADDRESS = /\.(?:m4s|ts|mp4)(?:[?#]|$)/u;
/** Smaller is an init segment or a subtitle, not media. */
const MEASURED_MIN_BYTES = 10_000;
const MEASURED_SAMPLES = 8;
const MEASURED_MIN_SAMPLES = 3;
/** Older than this says little about the connection now. */
const MEASURED_MAX_AGE_MS = 120_000;
/** A body timed shorter than this is counted as this (clock grain). */
const MIN_BODY_MS = 5;

/**
 * What the newest media segments fetched from the network showed, from the
 * browser's own timing of them (`performance.getEntriesByType("resource")`,
 * `now` on the same clock). A segment the page kept and answered itself
 * leaves no entry. The fetch time is the upper quartile: a video partly held
 * by the CDN mixes 0.03 s fetches with 0.5 s ones, and the slow ones are
 * what stop it. The link is the fastest single body: a slow one can be the
 * storage behind the CDN, a fast one cannot be faster than the link.
 */
export function measureSegmentFetches(
  entries: ReadonlyArray<SegmentFetchTiming>,
  now: number,
): SegmentFetchMeasure {
  const fetches: number[] = [];
  let bytes = 0;
  let fastest = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (now - entry.responseEnd > MEASURED_MAX_AGE_MS) break;
    if (!SEGMENT_ADDRESS.test(entry.name)) continue;
    if (entry.encodedBodySize < MEASURED_MIN_BYTES) continue;
    // No timing allowed across origins, or answered from the browser's
    // own cache (no network in it).
    if (!(entry.requestStart > 0) || entry.responseStart < entry.requestStart) {
      continue;
    }
    if (entry.transferSize === 0) continue;
    fetches.push((entry.responseEnd - entry.requestStart) / 1000);
    bytes += entry.encodedBodySize;
    const bodyMs = Math.max(
      MIN_BODY_MS,
      entry.responseEnd - entry.responseStart,
    );
    fastest = Math.max(fastest, (entry.encodedBodySize * 8_000) / bodyMs);
    if (fetches.length === MEASURED_SAMPLES) break;
  }
  if (fetches.length < MEASURED_MIN_SAMPLES) {
    return { fetchSeconds: null, bandwidth: null, meanBytes: null };
  }
  fetches.sort((left, right) => left - right);
  return {
    fetchSeconds: fetches[Math.ceil((fetches.length - 1) * 0.75)]!,
    bandwidth: fastest > 0 ? fastest : null,
    meanBytes: bytes / fetches.length,
  };
}
