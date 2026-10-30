/**
 * Shape shared by the small buttons at the bottom right of a lesson card
 * (quiz, resources, and those plugins add, such as download). Each button
 * adds its own tint on top. The tints are opaque, so a button reads the same
 * on the active card's accent wash as it does on a plain card. The corners
 * are rounded here: left to each button, the resources one came out square
 * wherever the page's own button radius did not reach it (phones, some
 * themes) while the download one beside it was rounded.
 */
export const LESSON_CARD_ACTION_CLASS =
  "inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150";
