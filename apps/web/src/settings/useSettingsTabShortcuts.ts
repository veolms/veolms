import { useEffect } from "react";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";

// Elements that use the arrow keys themselves; the page leaves those to them.
const ARROW_KEY_OWNER_SELECTOR = [
  '[role="dialog"]',
  '[role="grid"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tab"]',
  '[role="tree"]',
  // A part of the page with arrow keys of its own (the Discussions panel,
  // which steps through discussions with them).
  "[data-arrow-keys-owner]",
].join(",");

/**
 * The keyboard shortcuts of a settings-style page (Settings, Platform):
 * Alt+1, Alt+2 … open a section, and the left and right arrows step to the
 * previous or next one, wrapping around.
 */
export function useSettingsTabShortcuts<Id extends string>({
  tabIds,
  getCurrentTab,
  onNavigate,
}: {
  tabIds: readonly Id[];
  /** The section open now (read when a key is pressed). */
  getCurrentTab: () => Id;
  onNavigate: (id: Id) => void;
}) {
  useEffect(() => {
    const navigateTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target))
        return;

      let destination: Id | undefined;
      if (event.altKey) {
        const index = getNumberShortcutIndex(event);
        destination = index === null ? undefined : tabIds[index];
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !(
          event.target instanceof Element &&
          event.target.closest(ARROW_KEY_OWNER_SELECTOR)
        )
      ) {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = tabIds.indexOf(getCurrentTab());
        const nextIndex =
          (currentIndex + offset + tabIds.length) % tabIds.length;
        destination = tabIds[nextIndex];
      }

      if (!destination) return;
      event.preventDefault();
      onNavigate(destination);
    };

    document.addEventListener("keydown", navigateTab);
    return () => document.removeEventListener("keydown", navigateTab);
  }, [getCurrentTab, onNavigate, tabIds]);
}
