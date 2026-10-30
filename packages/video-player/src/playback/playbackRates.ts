export const DEFAULT_PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3] as const;

export const MIN_CUSTOM_PLAYBACK_RATE = 0.25;
export const MAX_CUSTOM_PLAYBACK_RATE = 8;
export const CUSTOM_PLAYBACK_RATE_STEP = 0.25;
export const KEYBOARD_PLAYBACK_RATE_STEP = 0.25;

export function getKeyboardPlaybackRate(
  currentRate: number,
  direction: -1 | 1,
): number {
  const nextRate =
    Math.round((currentRate + direction * KEYBOARD_PLAYBACK_RATE_STEP) * 100) /
    100;
  return Math.min(
    MAX_CUSTOM_PLAYBACK_RATE,
    Math.max(MIN_CUSTOM_PLAYBACK_RATE, nextRate),
  );
}

export function formatPlaybackRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function playbackRatesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}
