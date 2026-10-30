import { useSyncExternalStore } from "react";

/**
 * Posts an admin hid from the Discussions page in this visit. A hidden post
 * leaves the list, but the panel it was hidden from keeps showing it, and
 * its menu then offers to show it again rather than to hide it once more.
 */
const hiddenIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function markDiscussionPostHidden(id: string, hidden: boolean) {
  if (hidden ? hiddenIds.has(id) : !hiddenIds.has(id)) return;
  if (hidden) hiddenIds.add(id);
  else hiddenIds.delete(id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDiscussionPostHidden(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hiddenIds.has(id),
    () => false,
  );
}
