/**
 * The lesson cards' surfaces in the course sidebar, shared with other lists
 * that should look like it (the Coding Lab's question list).
 */

/**
 * The sidebar's active surface, with a tighter bottom cast: the sidebar
 * shadow token spreads too far for cards stacked in a list, so only its
 * widest layers are reined in here.
 */
export const LESSON_CARD_ACTIVE_SURFACE =
  "bg-(image:--sidebar-menu-active-background) shadow-[inset_0_1px_0_rgb(255_255_255/15%),inset_1px_0_0_rgb(255_255_255/7%),inset_0_-1px_0_rgb(0_0_0/28%),0_2px_5px_rgb(0_0_0/45%),0_7px_14px_rgb(0_0_0/36%)] [[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/96%),0_2px_5px_rgb(25_32_45/10%),0_7px_16px_rgb(25_32_45/14%)]";

/** A resting card: fainter than a section's, so sections read as headings. */
export const LESSON_CARD_REST_SURFACE =
  "bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)]";

/** The resting card under the pointer. */
export const LESSON_CARD_HOVER_SURFACE =
  "hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]";
