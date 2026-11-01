import type { ComponentProps, ElementType } from "react";

/**
 * The application's card: a lighter pane on a deeper ground, with a faint
 * light along its top edge and a soft shadow falling away under it. It has
 * no border. First built for the course page; every page that shows cards
 * is meant to use this one.
 *
 * Three pieces work together:
 *
 * - The ground. A page that wants the full effect lies on a deeper ground
 *   than the application frame: its scroller takes `deepGroundClasses` and
 *   is marked `data-deep-ground` (the shell, `CoursesPage`, does both). The
 *   ground's colour is kept in `--card-ground`.
 * - The card's fill, `--elevated-card`: that ground made one fixed step
 *   lighter, so the card is as clearly apart from the ground in every
 *   palette. The palettes space their own surface colours very differently
 *   (the darkest ones by about half as much as the others), and a mix of
 *   those gave cards that all but vanished in some of them. The step is
 *   small on purpose; the card must not glare. A browser without relative
 *   colours gets a mix of the palette's surfaces instead. Where the ground
 *   is not deepened (the course editor's preview, the unframed layout) the
 *   fill is the raised `--surface`, so the card still differs from what is
 *   behind it.
 * - The shadow, in `elevatedCardShadowClasses`.
 *
 * Written out in full: Tailwind only generates classes it can read as
 * literals.
 */

/**
 * A page's deeper ground; goes on the scroller, with `data-deep-ground`.
 *
 * It also points the older card tokens (`--card-surface`, `--card-shadow`
 * and their kin) at this card's fill and shadow for everything on that
 * ground, so a card still painted from those tokens, by a stylesheet or by
 * utility classes, matches an `ElevatedCard` beside it. A card that answers
 * the pointer gets a slightly lighter fill under it; its shadow does not
 * change. The "elevated surfaces" preference that turns shadows off still
 * applies: the shadow tokens are left alone when it is off.
 */
export const deepGroundClasses = [
  "in-data-[content-layout=framed]:bg-(--card-ground)!",
  "in-data-[content-layout=framed]:[--card-ground:color-mix(in_srgb,var(--main-surface)_42%,var(--canvas))]",
  "[:root[data-theme=light]_&]:supports-[color:oklch(from_white_l_c_h)]:in-data-[content-layout=framed]:[--card-ground:oklch(from_var(--main-surface)_calc(l_-_0.018)_c_h)]",
  "in-data-[content-layout=framed]:[--elevated-card:color-mix(in_srgb,var(--main-surface)_60%,var(--surface))]",
  "supports-[color:oklch(from_white_l_c_h)]:in-data-[content-layout=framed]:[--elevated-card:oklch(from_var(--card-ground)_calc(l_+_0.042)_c_h)]",
  "[:root[data-theme=light]_&]:supports-[color:oklch(from_white_l_c_h)]:in-data-[content-layout=framed]:[--elevated-card:oklch(from_var(--card-ground)_calc(l_+_0.03)_c_h)]",
  "in-data-[content-layout=framed]:[--card-surface:var(--elevated-card)] in-data-[content-layout=framed]:[--card-surface-raised:var(--elevated-card)]",
  "in-data-[content-layout=framed]:[--card-surface-hover:color-mix(in_srgb,var(--text)_4%,var(--elevated-card))]",
  "[:root:not([data-elevated-surfaces=false])_&]:in-data-[content-layout=framed]:[--card-shadow:inset_0_1px_0_rgb(255_255_255/0.07),0_10px_22px_-12px_rgb(0_0_0/0.4),0_22px_44px_-24px_rgb(0_0_0/0.45)]",
  "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&]:in-data-[content-layout=framed]:[--card-shadow:inset_0_1px_0_rgb(255_255_255/0.7),0_10px_22px_-12px_rgb(15_23_42/0.16),0_22px_44px_-24px_rgb(15_23_42/0.2)]",
  "[:root:not([data-elevated-surfaces=false])_&]:in-data-[content-layout=framed]:[--card-hover-shadow:var(--card-shadow)]",
].join(" ");

/** Sets `--elevated-card`, the card's fill, for this element and below. */
const elevatedCardFillTokenClasses = [
  "[--elevated-card:var(--surface)]",
  "in-data-[content-layout=framed]:in-data-deep-ground:[--elevated-card:color-mix(in_srgb,var(--main-surface)_60%,var(--surface))]",
  "supports-[color:oklch(from_white_l_c_h)]:in-data-[content-layout=framed]:in-data-deep-ground:[--elevated-card:oklch(from_var(--card-ground)_calc(l_+_0.042)_c_h)]",
  "[:root[data-theme=light]_&]:supports-[color:oklch(from_white_l_c_h)]:in-data-[content-layout=framed]:in-data-deep-ground:[--elevated-card:oklch(from_var(--card-ground)_calc(l_+_0.03)_c_h)]",
].join(" ");

const elevatedCardShadowClasses = [
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_10px_22px_-12px_rgb(0_0_0/0.4),0_22px_44px_-24px_rgb(0_0_0/0.45)]",
  "[:root[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_10px_22px_-12px_rgb(15_23_42/0.16),0_22px_44px_-24px_rgb(15_23_42/0.2)]",
].join(" ");

/**
 * The card as a class list, for an element that cannot be an
 * `ElevatedCard` (it needs `data-fixed-radius` beside these: the roundness
 * preference would otherwise set its own, smaller radius on a `section`).
 * The corners are a course card's, 16px.
 */
export const elevatedCardClasses = [
  "rounded-2xl border-0 bg-(--elevated-card)",
  elevatedCardFillTokenClasses,
  elevatedCardShadowClasses,
].join(" ");

/** A card's inner room, a little less on a phone. */
export const elevatedCardPaddingClasses = "px-6 py-5 max-[640px]:px-4";

/**
 * For a page whose cards are still painted by an older stylesheet from the
 * shared card tokens (`--card-surface`, `--card-shadow` and their kin). Put
 * on the page's root, it points those tokens at this card's fill and
 * shadow, so every card under it matches an `ElevatedCard` without each
 * rule being rewritten. A card that answers the pointer gets a slightly
 * lighter fill under it; its shadow does not change.
 */
export const elevatedCardTokenScopeClasses = [
  elevatedCardFillTokenClasses,
  "[--card-surface:var(--elevated-card)] [--card-surface-raised:var(--elevated-card)]",
  "[--card-surface-hover:color-mix(in_srgb,var(--text)_4%,var(--elevated-card))]",
  "[--card-shadow:inset_0_1px_0_rgb(255_255_255/0.07),0_10px_22px_-12px_rgb(0_0_0/0.4),0_22px_44px_-24px_rgb(0_0_0/0.45)]",
  "[--card-hover-shadow:var(--card-shadow)]",
  "[:root[data-theme=light]_&]:[--card-shadow:inset_0_1px_0_rgb(255_255_255/0.7),0_10px_22px_-12px_rgb(15_23_42/0.16),0_22px_44px_-24px_rgb(15_23_42/0.2)]",
].join(" ");

type ElevatedCardProps<Tag extends ElementType> = {
  /** The element to render; a `section` unless told otherwise. */
  as?: Tag;
  /** Gives the card its usual inner room. Off for a card that lays out its own. */
  padded?: boolean;
  className?: string;
} & Omit<ComponentProps<Tag>, "as" | "className">;

export function ElevatedCard<Tag extends ElementType = "section">(
  props: ElevatedCardProps<Tag>,
) {
  const { as, padded = false, className = "", ...rest } = props;
  const Element: ElementType = as ?? "section";
  return (
    <Element
      data-fixed-radius
      className={`${elevatedCardClasses} ${padded ? elevatedCardPaddingClasses : ""} ${className}`.trim()}
      {...rest}
    />
  );
}
