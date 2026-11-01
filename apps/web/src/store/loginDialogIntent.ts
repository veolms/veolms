import { useSyncExternalStore } from "react";

// The login pop-up belongs to the address (`?login=1`), but changing the
// address re-renders the whole page behind it: on a phone that kept the
// pop-up from showing for 300-400 ms after Login was tapped. So a tap first
// puts up the pop-up from here (only its host re-renders), and the address
// follows once the pop-up has painted. From then on the address rules again:
// the host lets go of this as soon as the address carries the pop-up.

let pendingPath: string | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The login address the pop-up is showing ahead of, if any. */
export function getLoginDialogIntent(): string | null {
  return pendingPath;
}

export function useLoginDialogIntent(): string | null {
  return useSyncExternalStore(subscribe, getLoginDialogIntent, () => null);
}

/**
 * Shows the pop-up for `path` (a login address over the current page) at
 * once, then calls `followWithAddress` after the frame that paints it,
 * unless the pop-up was closed meanwhile.
 */
export function showLoginDialogAhead(
  path: string,
  followWithAddress: () => void,
): void {
  pendingPath = path;
  notify();
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (pendingPath === path) followWithAddress();
    }, 0);
  });
}

export function clearLoginDialogIntent(): void {
  if (pendingPath === null) return;
  pendingPath = null;
  notify();
}
