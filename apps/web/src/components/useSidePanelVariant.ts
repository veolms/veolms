import { useSyncExternalStore } from "react";

/**
 * Which form a page's side panel takes: beside the page on a desktop
 * (SplitFramePane), over the page from the right on a tablet
 * (SlideOverFrame), a sheet from the bottom on a phone (Drawer). The
 * Discussions page and the Orders page share these sizes.
 */
export type SidePanelVariant = "desktop" | "tablet" | "phone";

// Desktop is Tailwind's `lg`; a phone is the Discussions list's own phone
// width (see DiscussionWorkspaceVirtualFeed).
const DESKTOP_QUERY = "(min-width: 64rem)";
const PHONE_QUERY = "(max-width: 780px)";

const subscribeToPanelVariant = (listener: () => void) => {
  const queries = [DESKTOP_QUERY, PHONE_QUERY].map((query) =>
    window.matchMedia(query),
  );
  queries.forEach((media) => media.addEventListener("change", listener));
  return () =>
    queries.forEach((media) => media.removeEventListener("change", listener));
};

const getPanelVariant = (): SidePanelVariant =>
  window.matchMedia(DESKTOP_QUERY).matches
    ? "desktop"
    : window.matchMedia(PHONE_QUERY).matches
      ? "phone"
      : "tablet";

export function useSidePanelVariant(): SidePanelVariant {
  return useSyncExternalStore(
    subscribeToPanelVariant,
    getPanelVariant,
    () => "desktop",
  );
}
