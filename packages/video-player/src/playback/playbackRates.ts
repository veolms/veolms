export const DEFAULT_PLAYBACK_RATES = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
] as const;

export const MIN_CUSTOM_PLAYBACK_RATE = 0.25;
export const MAX_CUSTOM_PLAYBACK_RATE = 4;
export const CUSTOM_PLAYBACK_RATE_STEP = 0.05;

export function formatPlaybackRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function playbackRatesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}
