/**
 * What a lesson's opening needs, per picture size.
 *
 * A manifest's `bandwidth` is the whole-lesson average. Screen recordings
 * average very little (1080p at 0.5 Mbps), but they open with a face-camera
 * intro three to five times heavier (2 Mbps and more for 30 to 100 s). ABR
 * choosing by the average picks 1080p on a 2 Mbps connection and the picture
 * stops for 7 to 18 s in the first minute (measured 24 Nov 2026).
 *
 * The encoder's publish step therefore states, on each video Representation
 * whose opening is heavier than its average, what the opening needs:
 *
 *   <SupplementalProperty schemeIdUri="urn:veolms:start-need:2026"
 *                         value="<bits per second>,<seconds>" />
 *
 * bits per second: the connection speed that downloads the opening no later
 * than it plays. seconds: where the opening ends. Until the playhead is past
 * it, automatic quality goes no higher than the tallest size the connection
 * is KNOWN to carry (`startNeedMaxHeight`). A connection never measured is
 * not held back: nothing is known about it, and a fast one must not open in
 * a low quality. A quality the viewer chose is never touched.
 *
 * Read from the manifest text that comes with the source; without the text,
 * or without the property (every lesson encoded before it existed), nothing
 * here applies.
 */
export const DASH_START_NEED_SCHEME = "urn:veolms:start-need:2026";

export interface DashStartNeed {
  /** Picture height of the Representation. */
  height: number;
  /** Bits per second the opening needs at this size (video only). */
  bandwidth: number;
  /** Where the opening ends, in seconds from the start of the video. */
  seconds: number;
}

const REPRESENTATION_START = /(?=<Representation\b)/u;
const REPRESENTATION_HEAD = /^<Representation\b([^>]*)>/u;
const HEIGHT = /\bheight="(\d+)"/u;
const START_NEED = new RegExp(
  `<SupplementalProperty\\b[^>]*\\bschemeIdUri="${DASH_START_NEED_SCHEME}"[^>]*\\bvalue="(\\d+),(\\d+)"`,
  "u",
);

/** The start needs stated in a DASH manifest, shortest picture first. */
export function readDashStartNeeds(text: string | undefined): DashStartNeed[] {
  if (typeof text !== "string" || !text.includes(DASH_START_NEED_SCHEME)) {
    return [];
  }
  const needs = new Map<number, DashStartNeed>();
  for (const part of text.split(REPRESENTATION_START).slice(1)) {
    const end = part.indexOf("</Representation>");
    const body = end < 0 ? part : part.slice(0, end);
    const height = Number(
      HEIGHT.exec(REPRESENTATION_HEAD.exec(body)?.[1] ?? "")?.[1],
    );
    const need = START_NEED.exec(body);
    const bandwidth = Number(need?.[1]);
    const seconds = Number(need?.[2]);
    if (!(height > 0) || !(bandwidth > 0) || !(seconds > 0)) continue;
    // Two Representations of one height: the heavier need stands.
    const known = needs.get(height);
    if (!known || bandwidth > known.bandwidth) {
      needs.set(height, { height, bandwidth, seconds });
    }
  }
  return [...needs.values()].sort((left, right) => left.height - right.height);
}

/** Where the last opening ends: nothing applies from there on. */
export function startNeedEnd(needs: readonly DashStartNeed[]): number {
  return needs.reduce((end, need) => Math.max(end, need.seconds), 0);
}

/**
 * The tallest picture automatic quality may choose during the opening, on a
 * connection known to carry `knownBandwidth` bits per second, or null for no
 * limit (the tallest stated size fits, or nothing is known).
 *
 * `extraBandwidth`: what plays alongside the video (the audio track).
 * `target`: the share of the connection a variant may take, as for ABR's own
 * upgrades (0.85). A connection too slow for every stated size gets the
 * shortest one: there is nothing lower to offer.
 */
export function startNeedMaxHeight(
  needs: readonly DashStartNeed[],
  knownBandwidth: number | null,
  extraBandwidth = 0,
  target = 0.85,
): number | null {
  if (!needs.length) return null;
  if (knownBandwidth === null || !(knownBandwidth > 0)) return null;
  const budget = knownBandwidth * target - Math.max(0, extraBandwidth);
  let fits: number | null = null;
  for (const need of needs) {
    if (need.bandwidth <= budget) fits = need.height;
    // Heights are in order: once one does not fit, none above is taken,
    // even if stated lighter (it never is; the rule stays predictable).
    else break;
  }
  const tallest = needs[needs.length - 1]!.height;
  if (fits === tallest) return null;
  return fits ?? needs[0]!.height;
}

/** A fetched resource, as the browser timed it (`PerformanceResourceTiming`). */
export interface StartNeedFetchTiming {
  name: string;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  encodedBodySize: number;
  transferSize: number;
}

const MEDIA_SEGMENT_ADDRESS = /\.(?:m4s|mp4)(?:[?#]|$)/u;
/**
 * Only a body this large says how fast the link is: a small one arrives in a
 * burst (timed far too fast) or shares the line with a video segment (timed
 * at half). Every size's opening segments are larger than this.
 */
const LINK_SAMPLE_MIN_BYTES = 150_000;
const LINK_SAMPLES = 6;
const LINK_SAMPLE_MAX_AGE_MS = 60_000;

/**
 * How fast the link carried the newest large media segments, in bits per
 * second: the fastest of the last few, each timed from its first byte to
 * its last. Null until one has been fetched from the network. The fastest,
 * because a segment that shared the line with another was timed slower than
 * the link is, and none can be timed faster.
 */
export function measureLinkBandwidth(
  entries: ReadonlyArray<StartNeedFetchTiming>,
  now: number,
): number | null {
  let fastest = 0;
  let samples = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (now - entry.responseEnd > LINK_SAMPLE_MAX_AGE_MS) break;
    if (!MEDIA_SEGMENT_ADDRESS.test(entry.name)) continue;
    if (entry.encodedBodySize < LINK_SAMPLE_MIN_BYTES) continue;
    // No timing allowed across origins, or answered without the network.
    if (!(entry.requestStart > 0) || entry.responseStart < entry.requestStart) {
      continue;
    }
    if (entry.transferSize === 0) continue;
    const bodyMs = entry.responseEnd - entry.responseStart;
    if (!(bodyMs > 0)) continue;
    fastest = Math.max(fastest, (entry.encodedBodySize * 8_000) / bodyMs);
    samples += 1;
    if (samples === LINK_SAMPLES) break;
  }
  return fastest > 0 ? Math.round(fastest) : null;
}
