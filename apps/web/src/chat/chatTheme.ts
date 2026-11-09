/**
 * Chat's own surface colours, mixed from the active palette so every theme
 * (16 palettes, light and dark) keeps WhatsApp's order of surfaces:
 * conversation ≤ panel < hover < selected, a raised colour for incoming
 * bubbles, inputs and chips, and an accent-tinted outgoing bubble.
 *
 * Some palettes have a transparent `--border`, so lines are mixed from the
 * text colour instead. Put this on the chat page and on anything it portals
 * (dialogs, the media viewer).
 */
export const CHAT_THEME = [
  "[--chat-panel:var(--main-surface)]",
  "[--chat-bg:var(--canvas)]",
  "[--chat-in:var(--surface)]",
  "[--chat-input:var(--surface)]",
  "[--chat-out:color-mix(in_srgb,var(--accent)_26%,var(--surface))]",
  "[--chat-hover:color-mix(in_srgb,var(--text)_5%,var(--chat-panel))]",
  "[--chat-selected:color-mix(in_srgb,var(--text)_10%,var(--chat-panel))]",
  "[--chat-line:color-mix(in_srgb,var(--text)_9%,transparent)]",
  "[--chat-line-strong:color-mix(in_srgb,var(--text)_20%,transparent)]",
  "[--chat-read:#53bdeb]",
  // By day the panel is white and inputs a step darker, as in WhatsApp.
  "[:root[data-theme=light]_&]:[--chat-panel:var(--surface)]",
  "[:root[data-theme=light]_&]:[--chat-input:var(--surface-strong)]",
  "[:root[data-theme=light]_&]:[--chat-out:color-mix(in_srgb,var(--accent)_15%,var(--surface))]",
  "[:root[data-theme=light]_&]:[--chat-read:#0f9fe6]",
].join(" ");
