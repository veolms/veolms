/**
 * The hero holds its video twice, in the laptop and in the narrow page's
 * card, and shows one of them; a window resized across the switch shows
 * the other. What the visitor has done with the video is kept here, for
 * the one coming into view to carry on from: whether it was started, where
 * it is, and whether it was playing.
 */
export const heroVideoSync = {
  started: false,
  time: 0,
  playing: false,
};

const listeners = new Set<() => void>();

export function markHeroVideoStarted(): void {
  if (heroVideoSync.started) return;
  heroVideoSync.started = true;
  for (const listener of listeners) listener();
}

export function subscribeToHeroVideoStarted(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isHeroVideoStarted(): boolean {
  return heroVideoSync.started;
}
