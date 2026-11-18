import { useSyncExternalStore } from "react";

/**
 * The phone layout of the chats page: an open chat covers the whole screen
 * (the page's `max-[640px]` rules), as in WhatsApp's app.
 */
const PHONE_QUERY = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
