import { useSyncExternalStore } from "react";

/** The width under which the home's hero takes its phone form. */
const PHONE_QUERY = "(max-width: 639.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the screen is a phone's width, followed as it changes (a phone
 * turned on its side). For what CSS cannot leave out by itself: a part a
 * phone does not show, but would still load if it were only hidden.
 */
export function useIsPhone() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
