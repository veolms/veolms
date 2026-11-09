import type {
  ChatPattern,
  ChatTextSize,
  ChatWallpaper,
} from "../store/chatPrefs.store";

/**
 * Wallpaper colours, like WhatsApp's: each mixed into the theme's own chat
 * background, so it suits every palette by day and by night; the last few
 * are soft two-colour gradients.
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
  teal: {
    label: "Teal",
    value: "color-mix(in srgb, #14b8a6 15%, var(--chat-bg))",
  },
  mint: {
    label: "Mint",
    value: "color-mix(in srgb, #6ee7b7 16%, var(--chat-bg))",
  },
  peach: {
    label: "Peach",
    value: "color-mix(in srgb, #fdba74 18%, var(--chat-bg))",
  },
  plum: {
    label: "Plum",
    value: "color-mix(in srgb, #a21caf 13%, var(--chat-bg))",
  },
  lavender: {
    label: "Lavender",
    value: "color-mix(in srgb, #c4b5fd 18%, var(--chat-bg))",
  },
  navy: {
    label: "Navy",
    value: "color-mix(in srgb, #1e3a8a 22%, var(--chat-bg))",
  },
  midnight: {
    label: "Midnight",
    value: "color-mix(in srgb, #020617 35%, var(--chat-bg))",
  },
  coffee: {
    label: "Coffee",
    value: "color-mix(in srgb, #78350f 16%, var(--chat-bg))",
  },
  aurora: {
    label: "Aurora",
    value:
      "linear-gradient(160deg, color-mix(in srgb, #22c55e 14%, var(--chat-bg)), color-mix(in srgb, #8b5cf6 16%, var(--chat-bg)))",
  },
  dusk: {
    label: "Dusk",
    value:
      "linear-gradient(160deg, color-mix(in srgb, #f97316 14%, var(--chat-bg)), color-mix(in srgb, #db2777 15%, var(--chat-bg)))",
  },
  lagoon: {
    label: "Lagoon",
    value:
      "linear-gradient(160deg, color-mix(in srgb, #0ea5e9 15%, var(--chat-bg)), color-mix(in srgb, #14b8a6 15%, var(--chat-bg)))",
  },
  ember: {
    label: "Ember",
    value:
      "linear-gradient(160deg, color-mix(in srgb, #ef4444 13%, var(--chat-bg)), color-mix(in srgb, #f59e0b 14%, var(--chat-bg)))",
  },
};

/** Patterns over the colour (chat.css draws them). */
export const CHAT_PATTERNS: Record<ChatPattern, { label: string }> = {
  doodles: { label: "Study" },
  code: { label: "Code" },
  science: { label: "Science" },
  space: { label: "Space" },
  geometric: { label: "Shapes" },
  waves: { label: "Waves" },
  grid: { label: "Grid" },
  dots: { label: "Dots" },
  none: { label: "None" },
};

export const CHAT_TEXT_SIZES: Record<
  ChatTextSize,
  { label: string; size: string }
> = {
  small: { label: "Small", size: "0.84rem" },
  medium: { label: "Medium", size: "0.92rem" },
  large: { label: "Large", size: "1.04rem" },
};
