export const DEFAULT_PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3] as const;

/**
 * The speeds the speed panel offers as buttons, a quarter apart up to 3×;
 * anything else is the slider's.
 */
export const PRESET_PLAYBACK_RATES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3,
] as const;

export const MIN_CUSTOM_PLAYBACK_RATE = 0.25;
/** As fast as browsers play a video (Chrome and Firefox stop at 16×). */
export const MAX_CUSTOM_PLAYBACK_RATE = 16;
export const KEYBOARD_PLAYBACK_RATE_STEP = 0.25;

/**
 * The speeds the slider's ticks name: each double the one before, so they
 * sit evenly along it.
 */
export const PLAYBACK_RATE_SLIDER_TICKS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

/** Positions along the slider, as an `<input type="range">` counts them. */
export const PLAYBACK_RATE_SLIDER_STEPS = 1000;

const RATE_RANGE_OCTAVES = Math.log2(
  MAX_CUSTOM_PLAYBACK_RATE / MIN_CUSTOM_PLAYBACK_RATE,
);

export function clampPlaybackRate(rate: number): number {
  return Math.min(
    MAX_CUSTOM_PLAYBACK_RATE,
    Math.max(MIN_CUSTOM_PLAYBACK_RATE, rate),
  );
}

/**
 * How finely a speed is set around a rate: in twentieths near normal
 * speed, coarser the faster it goes (nobody needs 9.35×).
 */
function playbackRateGrain(rate: number): number {
  if (rate < 2) return 0.05;
  if (rate < 4) return 0.25;
  if (rate < 8) return 0.5;
  return 1;
}

export function roundPlaybackRate(rate: number): number {
  const grain = playbackRateGrain(rate);
  return clampPlaybackRate(
    Math.round(Math.round(rate / grain) * grain * 100) / 100,
  );
}

/**
 * Where a speed sits along the slider (0 to `PLAYBACK_RATE_SLIDER_STEPS`).
 * The slider is logarithmic: 0.25× to 16× is six doublings, each the same
 * length, so the speeds people use (0.5× to 3×) take up half of it rather
 * than the first sixth.
 */
export function playbackRateToSliderPosition(rate: number): number {
  return (
    (Math.log2(clampPlaybackRate(rate) / MIN_CUSTOM_PLAYBACK_RATE) /
      RATE_RANGE_OCTAVES) *
    PLAYBACK_RATE_SLIDER_STEPS
  );
}

export function sliderPositionToPlaybackRate(position: number): number {
  return roundPlaybackRate(
    MIN_CUSTOM_PLAYBACK_RATE *
      2 ** ((position / PLAYBACK_RATE_SLIDER_STEPS) * RATE_RANGE_OCTAVES),
  );
}

/** The next speed up or down from a rate, at that rate's grain. */
export function stepPlaybackRate(rate: number, direction: -1 | 1): number {
  const current = roundPlaybackRate(rate);
  // Going down from the start of a coarser range uses the finer grain below.
  const grain = playbackRateGrain(direction < 0 ? current - 0.001 : current);
  return roundPlaybackRate(current + direction * grain);
}

export function getKeyboardPlaybackRate(
  currentRate: number,
  direction: -1 | 1,
): number {
  // A quarter at a time up to 4× (as the arrow keys always did), then the
  // slider's steps.
  if (currentRate < 4 || (direction < 0 && currentRate <= 4)) {
    const nextRate =
      Math.round(
        (currentRate + direction * KEYBOARD_PLAYBACK_RATE_STEP) * 100,
      ) / 100;
    return clampPlaybackRate(nextRate);
  }
  return stepPlaybackRate(currentRate, direction);
}

export function formatPlaybackRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function playbackRatesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}
