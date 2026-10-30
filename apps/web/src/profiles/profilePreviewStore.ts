import { useSyncExternalStore } from "react";

/**
 * Whose profile is open in the preview (a pop-up beside the name or picture
 * on a desktop, a bottom sheet on a phone), and the element it was opened
 * from. A name or picture opens it, the same one again closes it; the
 * preview itself leads on to the full profile page.
 *
 * Kept on the window, not in this module: when the dev server reloads one
 * of the files that use it, the links and the host can hold different copies
 * of this module, and a preview opened in one would never reach the other.
 */
const CHANGE_EVENT = "veolms:profile-preview";

export interface ProfilePreviewState {
  username: string;
  /** The name or picture it was opened from; the pop-up sits beside it. */
  anchor: HTMLElement | null;
}

interface ProfilePreviewWindow extends Window {
  __veolmsProfilePreview?: ProfilePreviewState | null;
}

function previewWindow(): ProfilePreviewWindow | null {
  return typeof window === "undefined"
    ? null
    : (window as ProfilePreviewWindow);
}

function setPreview(state: ProfilePreviewState | null) {
  const win = previewWindow();
  if (!win) return;
  win.__veolmsProfilePreview = state;
  win.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Opens the preview, or closes it when it is already open from `anchor`. */
export function toggleProfilePreview(
  username: string,
  anchor: HTMLElement | null,
) {
  const current = previewWindow()?.__veolmsProfilePreview;
  if (current && anchor && current.anchor === anchor) {
    setPreview(null);
    return;
  }
  setPreview({ username: username.trim().replace(/^@+/, ""), anchor });
}

export function closeProfilePreview() {
  if (previewWindow()?.__veolmsProfilePreview) setPreview(null);
}

function subscribe(onChange: () => void) {
  const win = previewWindow();
  win?.addEventListener(CHANGE_EVENT, onChange);
  return () => win?.removeEventListener(CHANGE_EVENT, onChange);
}

/** The open preview, or null. */
export function useProfilePreview(): ProfilePreviewState | null {
  return useSyncExternalStore(
    subscribe,
    () => previewWindow()?.__veolmsProfilePreview ?? null,
    () => null,
  );
}
