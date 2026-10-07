/**
 * Card elevation for the pages that show course cards (the home page and the
 * Courses page). A page puts `courseSurfaceElevation` on its root; everything
 * inside then reads the shared card shadow tokens from here:
 *
 * - `--card-shadow` / `--card-hover-shadow` / `--card-compact-shadow`: the
 *   lit edges and contact shadow of a card, without the wide soft layers the
 *   app-wide values spread well past each card.
 * - `--raised-surface-shadow`: a quieter lift for panels that are not cards
 *   in their own right (the home page's highlights and comments). By night
 *   it matches the sidebar menu's resting elevation.
 *
 * By day these surfaces wear the sidebar's raised-menu treatment (the one its
 * selected item and its theme button have):
 *
 * - every shadow above is the sidebar's raised-menu shadow, read from its
 *   token rather than copied;
 * - `--card-border` is cleared, because that treatment has no outline: the
 *   shadow alone marks the edge;
 * - `--raised-surface-image` is a tinted gradient fill in the same direction
 *   as the sidebar's, which a surface paints with
 *   `bg-(image:--raised-surface-image)`.
 *
 * The fill is not the sidebar's own gradient. That one mixes the accent into
 * the surface, which suits the sidebar's darker ground but darkens with the
 * accent: a palette whose accent is near black (Veo Onyx) turns it grey, and
 * on the page, which is lighter than the sidebar, grey cards look dirty.
 * This one takes only the accent's hue. The more colour the accent has, the
 * more tint (and a little less lightness) the surface takes, so a blue
 * palette still gets the sidebar's pale blue while a neutral one stays near
 * white, lighter than the page behind it. Where relative colours are not
 * supported the image is simply absent and the plain card surface shows.
 *
 * The sidebar's resting light shadow is not used: it is tuned for the
 * sidebar's surface and vanishes on the page.
 *
 * The "elevated surfaces" preference that turns shadows off still applies:
 * nothing is set when it is off, and the tokens fall back to none.
 *
 * Written out in full: Tailwind only generates classes it can read as
 * literals.
 */
const nightElevation = [
  "[:root:not([data-elevated-surfaces=false])_&]:[--card-shadow:inset_0_1px_0_rgb(255_255_255/15%),inset_1px_0_0_rgb(255_255_255/7%),inset_0_-1px_0_rgb(0_0_0/28%),0_1px_3px_rgb(0_0_0/45%),0_6px_14px_rgb(0_0_0/38%)]",
  "[:root:not([data-elevated-surfaces=false])_&]:[--card-hover-shadow:inset_0_1px_0_rgb(255_255_255/19%),inset_1px_0_0_rgb(255_255_255/9%),inset_0_-1px_0_rgb(0_0_0/32%),0_2px_4px_rgb(0_0_0/50%),0_9px_20px_rgb(0_0_0/44%)]",
  "[:root:not([data-elevated-surfaces=false])_&]:[--card-compact-shadow:0_1px_3px_rgb(0_0_0/42%),0_4px_10px_rgb(0_0_0/36%)]",
  "[:root:not([data-elevated-surfaces=false])_&]:[--raised-surface-shadow:inset_0_1px_0_rgb(255_255_255/8%),0_3px_7px_rgb(0_0_0/28%),0_11px_25px_rgb(0_0_0/34%)]",
].join(" ");

const dayElevation = [
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--card-shadow:var(--sidebar-menu-active-shadow)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--card-hover-shadow:inset_0_1px_0_rgb(255_255_255/100%),0_4px_9px_rgb(25_32_45/14%),0_18px_36px_rgb(25_32_45/20%),0_5px_15px_color-mix(in_srgb,var(--accent-shadow)_24%,transparent)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--card-compact-shadow:var(--sidebar-menu-active-shadow)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--raised-surface-shadow:var(--sidebar-menu-active-shadow)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--raised-surface-image:linear-gradient(108deg,oklch(from_var(--accent)_calc(0.99_-_c_*_0.35)_calc(c_*_0.11)_h)_0%,oklch(from_var(--accent)_calc(0.995_-_c_*_0.3)_calc(c_*_0.09)_h)_100%)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:[--card-border:transparent]",
].join(" ");

export const courseSurfaceElevation = `${nightElevation} ${dayElevation}`;
