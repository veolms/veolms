import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";

import { cn } from "../lib/utils";

// The full catalogue (categories, search, skin tones) loads only when the
// panel first opens, so it adds nothing to the chat page's first load.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

function isTouchScreen(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function useColorScheme(): "light" | "dark" {
  const read = () =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  const [scheme, setScheme] = useState<"light" | "dark">(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/** The picker in chat's colours, so it suits every palette (light and dark). */
const PICKER_THEME = {
  "--epr-bg-color": "var(--chat-panel)",
  "--epr-category-label-bg-color": "var(--chat-panel)",
  "--epr-picker-border-color": "transparent",
  "--epr-search-input-bg-color": "var(--chat-input)",
  "--epr-search-input-bg-color-active": "var(--chat-input)",
  "--epr-search-border-color": "transparent",
  "--epr-search-border-color-active": "var(--accent)",
  "--epr-hover-bg-color": "var(--chat-hover)",
  "--epr-focus-bg-color": "var(--chat-selected)",
  "--epr-highlight-color": "var(--accent)",
  "--epr-category-icon-active-color": "var(--accent)",
  "--epr-text-color": "var(--text)",
  "--epr-category-label-text-color": "var(--muted)",
  "--epr-search-input-text-color": "var(--text)",
  "--epr-search-input-placeholder-color": "var(--muted)",
  "--epr-emoji-size": "30px",
  "--epr-emoji-padding": "6px",
  "--epr-search-input-height": "40px",
  "--epr-search-input-padding": "0 16px 0 40px",
  "--epr-search-input-border-radius": "999px",
  "--epr-horizontal-padding": "14px",
  "--epr-category-navigation-button-size": "28px",
  borderRadius: 0,
  border: 0,
} as CSSProperties;

/**
 * WhatsApp's emoji panel: category tabs along the top, "Search emoji",
 * titled sections (recently used first), large emoji, skin tones on a long
 * press. Uses the device's own emoji, like the messages it goes into.
 */
export function EmojiPanel({
  onPick,
  className,
  height = 360,
}: {
  onPick: (emoji: string) => void;
  className?: string;
  height?: number | string;
}) {
  const scheme = useColorScheme();
  return (
    <div
      role="dialog"
      aria-label="Emoji"
      className={cn(
        "overflow-hidden rounded-2xl border border-solid border-(--chat-line) bg-(--chat-panel) shadow-[0_18px_48px_rgb(0_0_0/0.3)]",
        className,
      )}
    >
      <Suspense
        fallback={
          <div
            className="grid place-items-center text-[0.86rem] text-(--muted)"
            style={{ height }}
          >
            Loading emoji…
          </div>
        }
      >
        <EmojiPicker
          emojiStyle="native"
          colorScheme={scheme}
          width="100%"
          height={height}
          lazyLoadEmojis
          autoFocusSearch={!isTouchScreen()}
          searchPlaceholder="Search emoji"
          suggestedEmojisMode="recent"
          previewConfig={{ showPreview: false }}
          style={PICKER_THEME}
          onEmojiClick={(emoji) => onPick(emoji.emoji)}
        />
      </Suspense>
    </div>
  );
}
