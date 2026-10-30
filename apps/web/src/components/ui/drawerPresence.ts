/**
 * How many bottom sheets (`DrawerContent`) are on screen. A sheet's content
 * is mounted only while it is open or closing, so its mount is the count.
 *
 * Something drawn in the browser's top layer (the lesson mini player is a
 * popover, to stay above a page in full screen) would otherwise cover every
 * sheet, whatever their z-index; it listens here and steps down while one
 * is open.
 */
let openDrawers = 0;
const listeners = new Set<(open: boolean) => void>();

export function markDrawerOpen(): () => void {
  openDrawers += 1;
  if (openDrawers === 1) listeners.forEach((listener) => listener(true));
  return () => {
    openDrawers -= 1;
    if (openDrawers === 0) listeners.forEach((listener) => listener(false));
  };
}

export function isAnyDrawerOpen() {
  return openDrawers > 0;
}

export function subscribeToDrawerPresence(
  listener: (open: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
