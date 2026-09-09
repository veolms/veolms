import { useEffect } from "react";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";

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
