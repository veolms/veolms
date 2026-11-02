import { useEffect } from "react";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";

/**
 * Whether a modal layer is showing over the page: an open `<dialog>` (as a
 * modal or a popover, like the login card) or a modal drawer. Escape is that
 * layer's to answer, not the player's underneath it.
 */
const isModalLayerShown = () => {
  for (const dialog of document.querySelectorAll("dialog")) {
    if (dialog.open) return true;
    try {
      if (dialog.matches(":popover-open")) return true;
    } catch {
      // A browser without popovers has no popover to be open.
    }
  }
  for (const layer of document.querySelectorAll(
    '[role="dialog"][aria-modal="true"]',
  )) {
    if (layer.getClientRects().length > 0) return true;
  }
  return false;
};

export function useLearningPlayerMinimizeShortcut({
  enabled,
  onTrigger,
  onClose,
}: {
  enabled: boolean;
  onTrigger: () => void;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.code === "Escape" && onClose && !event.shiftKey) {
        if (isModalLayerShown()) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (isEditingShortcutTarget(event.target)) return;

      if (event.code !== "KeyI" || event.shiftKey) {
        return;
      }

      event.preventDefault();
      onTrigger();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onClose, onTrigger]);
}
