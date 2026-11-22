import { useEffect, useState } from "react";

/** The tallest visible height seen with the keyboard down. */
let tallestSeen = 0;

function visibleHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

/**
 * Whether a phone's on-screen keyboard is up while the editor has focus.
 * The site's viewport resizes its content for the keyboard on Android
 * (`interactive-widget=resizes-content`); iOS ignores that setting, so the
 * visual viewport is watched too. "Up" means the visible height is below
 * 75 % of the tallest seen while the editor was not focused.
 */
export function useKeyboardOpen(editorFocused: boolean) {
  const [state, setState] = useState<{ open: boolean; height: number | null }>({
    open: false,
    height: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.matchMedia("(pointer: coarse)").matches) return undefined;
    const check = () => {
      const height = visibleHeight();
      if (!editorFocused) {
        tallestSeen = Math.max(tallestSeen, height);
        setState({ open: false, height: null });
        return;
      }
      const open = tallestSeen > 0 && height < tallestSeen * 0.75;
      setState({ open, height: open ? Math.round(height) : null });
    };
    check();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      viewport?.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, [editorFocused]);

  return { keyboardOpen: state.open, visibleHeight: state.height };
}
