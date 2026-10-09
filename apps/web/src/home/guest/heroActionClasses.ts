/**
 * The actions that sit on the hero picture, shared by every hero that uses
 * the desk scene (`HeroDesk`).
 *
 * The hero's second action is a pane of glass lying over the picture, set
 * apart from it by a shadow underneath rather than a border or a glow. While
 * the lamp is on, its warm light falls on the glass from the top right
 * corner (the `before` layer, which fades with the lamp); by day that light
 * is fainter.
 *
 * The lamp hangs at the hero's right edge and the action sits near its left
 * one, so the wider the hero, the further the glass is from the lamp and the
 * less of its light reaches it: `--lamp-reach` runs from 1 on a hero up to
 * 800px wide down to 0 at 1450px (a desktop window with the sidebar closed),
 * where switching the lamp no longer shows on the glass at all. The hero's
 * width is a length (100cqw of the page container) and opacity wants a
 * number; `tan(atan2(length, 1px))` is the CSS way to turn one into the other.
 *
 * The lamp's light is its own set of classes because it falls on the primary
 * action beside the glass as well.
 */
export const lampLightClasses = [
  "relative isolate",
  "before:[--lamp-reach:clamp(0,(1450_-_tan(atan2(100cqw,1px)))_/_650,1)]",
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[radial-gradient(130%_170%_at_100%_0%,rgb(255_190_120/0.36),rgb(255_190_120/0.1)_38%,transparent_68%)] before:opacity-(--lamp-reach) before:transition-opacity before:duration-300 motion-reduce:before:transition-none",
  "[[data-lamp=off]_&]:before:opacity-0",
  "[:root[data-theme=light]_&]:before:opacity-0 [:root[data-theme=light]_[data-lamp=on]_&]:before:opacity-[calc(var(--lamp-reach)*0.7)]",
].join(" ");

/**
 * The same lamp light for a larger pane of glass, as a layer of its own to
 * put inside the pane (first, so it lies under the pane's content) rather
 * than a `before` on it. The pane has to be `relative`, and clip to its own
 * corners.
 *
 * On something this size the light is kept to the corner nearest the lamp.
 * A pane this large also stands nearer the lamp than the actions do, so the
 * light never quite leaves it: its reach runs from 1 on a hero up to 1000px
 * wide down to 0.4 from 1540px on.
 */
export const lampLightLayerClasses = [
  "[--lamp-reach:clamp(0.4,(1900_-_tan(atan2(100cqw,1px)))_/_900,1)]",
  "pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(95%_125%_at_100%_0%,rgb(255_190_120/0.38),rgb(255_190_120/0.12)_34%,transparent_64%)] opacity-(--lamp-reach) transition-opacity duration-300 motion-reduce:transition-none",
  "[[data-lamp=off]_&]:opacity-0",
  "[:root[data-theme=light]_&]:opacity-0 [:root[data-theme=light]_[data-lamp=on]_&]:opacity-[calc(var(--lamp-reach)*0.7)]",
].join(" ");

export const glassActionClasses = [
  "inline-flex min-h-12 items-center justify-center rounded-lg px-6 text-base font-semibold text-white backdrop-blur-md",
  "transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
  // Night: dark glass with a faint tint of the screen's light, a touch
  // stronger in the bottom left corner where the picture behind is at its
  // darkest. It is lifted off the picture by a dark shadow, never a glow.
  "bg-white/8 bg-[linear-gradient(45deg,rgb(150_170_255/0.1),rgb(255_255_255/0.03)_55%,rgb(124_150_255/0.08))] hover:bg-white/16",
  "shadow-[0_12px_26px_-10px_rgb(0_0_0/0.7),0_3px_8px_-3px_rgb(0_0_0/0.45)]",
  lampLightClasses,
  // Day.
  "[:root[data-theme=light]_&]:bg-white/45 [:root[data-theme=light]_&]:bg-none [:root[data-theme=light]_&]:text-slate-900 [:root[data-theme=light]_&]:hover:bg-white/60 [:root[data-theme=light]_&]:focus-visible:outline-slate-900",
  "[:root[data-theme=light]_&]:shadow-[0_12px_28px_-8px_rgb(15_23_42/0.28),0_4px_10px_-4px_rgb(15_23_42/0.12)]",
].join(" ");

// Dark text on the bright accent reads thinner than the white text of the
// action beside it at the same weight, so by night it is set a step heavier
// to look the same.
export const primaryActionClasses = `${lampLightClasses} group/cta inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-(--accent) px-6 text-base font-bold text-(--on-accent) shadow-[0_12px_28px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)] transition-[background-color,box-shadow] duration-150 hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [:root[data-theme=light]_&]:font-semibold`;
