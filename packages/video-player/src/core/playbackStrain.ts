/**
 * Notices a fast video that keeps standing still: the speed is more than
 * this device (or its connection) can keep up with.
 *
 * Two ways it happens, told apart by what is downloaded ahead:
 *
 * - "device": plenty is downloaded, and the decoder falls behind. At 16x a
 *   30 fps video asks for 480 frames a second; Chrome's decoder now and
 *   again reports it has only the frame on screen (`readyState` 2) and stays
 *   so until the playhead is moved, about a second each time, with minutes
 *   ahead (Chrome 158, `chrome://media-internals`: video DECODER_UNDERFLOW,
 *   2026-11-21).
 * - "loading": nothing is left ahead. The connection, or a processor too
 *   slow to fetch and hand over segments at that speed: with Chrome running
 *   the page 6 times slower, a lesson at 16x stood still 232 s of 259 with
 *   0-3 s downloaded. From the page the two cannot be told apart.
 *
 * Fed a sample of the video a few times a second, it says when stops have
 * come `STRAIN_STOPS` times within `STRAIN_WINDOW_MS` (one alone can be
 * chance), and which of the two most of them were.
 */

/** Only faster than this: below it there is room to spare. */
export const STRAIN_MIN_RATE = 2;
/** At least this much downloaded ahead: the stop is the device's. */
export const STRAIN_MIN_AHEAD_SECONDS = 10;

export type PlaybackStrainCause = "device" | "loading";

export interface PlaybackStrainReport {
  stops: number;
  cause: PlaybackStrainCause;
}
/** Standing still at least this long is one stop. */
export const STRAIN_STOP_MS = 500;
export const STRAIN_STOPS = 2;
export const STRAIN_WINDOW_MS = 30_000;
/**
 * Not counted this long after a start, a seek or a speed change: the first
 * pictures come from the previous key frame, and a fast start waits for them.
 */
export const STRAIN_GRACE_MS = 2_000;

export interface PlaybackStrainSample {
  /** A clock in milliseconds (`performance.now()`). */
  now: number;
  /** Where the video is, in seconds. */
  currentTime: number;
  /** The speed the learner chose (not the 0 a stall holds the element at). */
  rate: number;
  /** Playing: not paused, ended or seeking. */
  playing: boolean;
  /** `HTMLMediaElement.readyState`. */
  readyState: number;
  /** Seconds downloaded ahead of `currentTime`. */
  aheadSeconds: number;
  /** The page is hidden: the browser slows it down, nothing to judge. */
  hidden: boolean;
}

/** HTMLMediaElement.HAVE_FUTURE_DATA. */
const HAVE_FUTURE_DATA = 3;
/** Moved less than this share of what the speed asks for: standing still. */
const STILL_SHARE = 0.1;

export class PlaybackStrainDetector {
  #last: PlaybackStrainSample | null = null;
  #graceUntil = Number.NEGATIVE_INFINITY;
  #stillSince: number | null = null;
  /** Whether the stop under way had plenty downloaded when it began. */
  #stillWithData = false;
  #counted = false;
  #stops: { at: number; withData: boolean }[] = [];

  /**
   * Starts over: a new video, a seek, a new speed. What came before says
   * nothing about what follows.
   */
  reset(now: number): void {
    this.#last = null;
    this.#graceUntil = now + STRAIN_GRACE_MS;
    this.#stillSince = null;
    this.#counted = false;
    this.#stops = [];
  }

  /**
   * Takes one sample. Returns the stops in the window, and what most of them
   * were, when their number has just reached `STRAIN_STOPS`; else null.
   */
  sample(sample: PlaybackStrainSample): PlaybackStrainReport | null {
    const last = this.#last;
    this.#last = sample;
    if (
      !last ||
      !sample.playing ||
      sample.hidden ||
      !(sample.rate > STRAIN_MIN_RATE) ||
      sample.now < this.#graceUntil
    ) {
      this.#stillSince = null;
      this.#counted = false;
      return null;
    }
    const elapsed = (sample.now - last.now) / 1000;
    const moved = sample.currentTime - last.currentTime;
    // Standing still while it can play on (the next frames ready) is a
    // pause in the page, not the video falling behind.
    const still =
      elapsed > 0 &&
      moved < STILL_SHARE * sample.rate * elapsed &&
      sample.readyState < HAVE_FUTURE_DATA;
    if (!still) {
      this.#stillSince = null;
      this.#counted = false;
      return null;
    }
    if (this.#stillSince === null) {
      this.#stillSince = last.now;
      this.#stillWithData = last.aheadSeconds >= STRAIN_MIN_AHEAD_SECONDS;
    }
    if (this.#counted || sample.now - this.#stillSince < STRAIN_STOP_MS) {
      return null;
    }
    this.#counted = true;
    this.#stops = this.#stops.filter(
      (stop) => sample.now - stop.at < STRAIN_WINDOW_MS,
    );
    this.#stops.push({ at: sample.now, withData: this.#stillWithData });
    if (this.#stops.length !== STRAIN_STOPS) return null;
    const withData = this.#stops.filter((stop) => stop.withData).length;
    return {
      stops: this.#stops.length,
      cause: withData * 2 >= this.#stops.length ? "device" : "loading",
    };
  }
}
