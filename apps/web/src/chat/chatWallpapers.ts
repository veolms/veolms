import type { ChatTextSize, ChatWallpaper } from "../store/chatPrefs.store";

/**
 * Wallpaper colours: each a light tint mixed into the theme's own chat
 * background, so it suits every palette by day and by night.
 */
export const CHAT_WALLPAPERS: Record<
  ChatWallpaper,
  { label: string; value: string }
> = {
  default: { label: "Default", value: "var(--chat-bg)" },
  ocean: {
    label: "Ocean",
    value: "color-mix(in srgb, #0ea5e9 14%, var(--chat-bg))",
  },
  forest: {
    label: "Forest",
    value: "color-mix(in srgb, #22c55e 13%, var(--chat-bg))",
  },
  sunset: {
    label: "Sunset",
    value: "color-mix(in srgb, #f97316 13%, var(--chat-bg))",
  },
  rose: {
    label: "Rose",
    value: "color-mix(in srgb, #f43f5e 12%, var(--chat-bg))",
  },
  violet: {
    label: "Violet",
    value: "color-mix(in srgb, #8b5cf6 14%, var(--chat-bg))",
  },
  sand: {
    label: "Sand",
    value: "color-mix(in srgb, #c9a46a 18%, var(--chat-bg))",
  },
  slate: {
    label: "Slate",
    value: "color-mix(in srgb, var(--text) 7%, var(--chat-bg))",
  },
};

export const CHAT_TEXT_SIZES: Record<
  ChatTextSize,
  { label: string; size: string }
> = {
  small: { label: "Small", size: "0.84rem" },
  medium: { label: "Medium", size: "0.92rem" },
  large: { label: "Large", size: "1.04rem" },
};
