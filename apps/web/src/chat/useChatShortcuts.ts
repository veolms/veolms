import { useEffect, useRef } from "react";

import { isEditingShortcutTarget } from "../keyboardShortcuts";

export interface ChatShortcutHandlers {
  newChat: () => void;
  previousChat: () => void;
  nextChat: () => void;
  info: () => void;
  archive: () => void;
  mute: () => void;
  pin: () => void;
  escape: () => boolean;
  typeIntoComposer: () => void;
  /** Shift + ? (or Ctrl/⌘ + /): the keyboard shortcuts list. */
  showShortcuts: () => void;
}

/**
 * WhatsApp Web's shortcuts, adapted (CHAT_SHORTCUTS lists them):
 * Ctrl/⌘+Alt+N new chat, Alt+↑/↓ (or Ctrl+Alt+Shift+[ / ]) previous/next
 * chat, Ctrl/⌘+Alt+P info, Ctrl/⌘+Alt+E archive, Ctrl/⌘+Alt+Shift+M mute,
 * Ctrl/⌘+Alt+Shift+P pin, Shift+? (or Ctrl/⌘+/) the shortcuts list, Esc
 * closes, and typing anywhere goes to the box.
 */
export function useChatShortcuts(handlers: ChatShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const h = ref.current;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const code = event.code;

      // WhatsApp: Shift + ? lists the shortcuts (Ctrl/⌘ + / too, even
      // while typing).
      if (
        (event.key === "?" &&
          !mod &&
          !event.altKey &&
          !isEditingShortcutTarget(event.target)) ||
        (mod && !event.altKey && code === "Slash")
      ) {
        event.preventDefault();
        h.showShortcuts();
        return;
      }
      if (mod && event.altKey && !event.shiftKey && code === "KeyN") {
        event.preventDefault();
        h.newChat();
        return;
      }
      if (
        (event.altKey &&
          !mod &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")) ||
        (mod &&
          event.altKey &&
          event.shiftKey &&
          (code === "BracketLeft" || code === "BracketRight"))
      ) {
        event.preventDefault();
        if (event.key === "ArrowUp" || code === "BracketLeft") h.previousChat();
        else h.nextChat();
        return;
      }
      if (mod && event.altKey && !event.shiftKey && code === "KeyP") {
        event.preventDefault();
        h.info();
        return;
      }
      if (mod && event.altKey && !event.shiftKey && code === "KeyE") {
        event.preventDefault();
        h.archive();
        return;
      }
      if (mod && event.altKey && event.shiftKey && code === "KeyM") {
        event.preventDefault();
        h.mute();
        return;
      }
      if (mod && event.altKey && event.shiftKey && code === "KeyP") {
        event.preventDefault();
        h.pin();
        return;
      }
      if (event.key === "Escape" && !event.defaultPrevented) {
        if (h.escape()) event.preventDefault();
        return;
      }
      // Typing with nothing focused goes into the message box.
      if (
        !mod &&
        !event.altKey &&
        key.length === 1 &&
        key !== "/" &&
        !isEditingShortcutTarget(event.target) &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        h.typeIntoComposer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
