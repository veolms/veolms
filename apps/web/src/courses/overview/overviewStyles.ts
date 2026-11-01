/**
 * What the pieces under the hero share. Each is a box of its own on the
 * page: the price (or progress, or the manager's actions), the curriculum,
 * and the About text.
 */

import {
  elevatedCardClasses,
  elevatedCardPaddingClasses,
} from "../../components/ElevatedCard";

/**
 * A box: the application's shared card (see `components/ElevatedCard`),
 * which was first made for this page. The fill is `--elevated-card`, for
 * anything that has to fade into it (the About text's "See more"). Each box
 * carries `data-fixed-radius`, since the roundness preference would
 * otherwise set every section on this page to its own, smaller radius.
 */
export const overviewCardClasses = elevatedCardClasses;

/**
 * For the column under a hero that runs edge to edge: the first box sits
 * on the hero's lower edge and overlaps it a little (1rem), above it.
 * The hero leaves that much more room under its own contents (see
 * `heroPlacementClasses.edge`). Put on the column; the page's own gap must
 * be 0.
 */
export const overviewColumnUnderHeroClasses =
  "[&>:first-child]:relative [&>:first-child]:z-10 [&>:first-child]:-mt-4 " +
  // On a phone the boxes run to the screen's edges, as the hero does: the
  // column is pulled out over the page's side padding. The boxes keep their
  // rounded corners.
  "max-[640px]:-mx-(--application-page-inline-gutter) max-[640px]:w-[calc(100%_+_2_*_var(--application-page-inline-gutter))] max-[640px]:max-w-none";

/**
 * The course page measures its own width (`/overview`) for the layout
 * below. Put on the page's outermost box.
 */
export const overviewPageContainerClasses = "@container/overview";

/**
 * On a wide page (54rem and up, which leaves the curriculum 30rem or more)
 * the column under the hero is two: the curriculum and the About text on
 * the left, and the first band (the price, a learner's progress or a
 * manager's actions) in a 23rem column on the right, where it stays in view
 * while the page scrolls. At that width the price card takes its phone form
 * (it stacks under 28rem). Put on the
 * column, with `overviewColumnUnderHeroClasses`: the left column's first box
 * overlaps the hero as the band does. The rows are `auto 1fr`: the band
 * spans both, and a band taller than the curriculum must not stretch the
 * curriculum's row (that opened a gap above the About text). Side by
 * side, both boxes overlap the hero by 0.5rem, not the 1rem a single
 * column does (the user's call, 2026-10-16).
 */
export const overviewTwoColumnClasses =
  "@min-[54rem]/overview:grid @min-[54rem]/overview:grid-cols-[minmax(0,1fr)_23rem] @min-[54rem]/overview:grid-rows-[auto_1fr] @min-[54rem]/overview:items-start " +
  "@min-[54rem]/overview:[&>:nth-child(2)]:relative @min-[54rem]/overview:[&>:nth-child(2)]:z-10 @min-[54rem]/overview:[&>:nth-child(2)]:-mt-2";

/**
 * The band in that right column: it sticks 0.75rem below the top of the
 * scrolling area. The offset is counted inside the page's own top padding
 * (`--application-page-block-start`), so that is taken off.
 * (`sticky` and the margin are marked important: the column gives its first
 * box `relative` and `-mt-4` for the overlap onto the hero, with a stronger
 * selector.)
 */
export const overviewBandColumnClasses =
  "@min-[54rem]/overview:sticky! @min-[54rem]/overview:-mt-2! @min-[54rem]/overview:top-[calc(0.75rem_-_var(--application-page-block-start,0px))] @min-[54rem]/overview:col-start-2 @min-[54rem]/overview:row-span-2 @min-[54rem]/overview:row-start-1";

/** A box's inner room, a little less on a phone. */
export const overviewCardPaddingClasses = elevatedCardPaddingClasses;

/** A band's heading: the title, one supporting line and an action on the right. */
export const bandHeaderClasses =
  "flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-2";

export const bandTitleClasses =
  "m-0 text-[1.35rem] leading-tight font-bold tracking-[-0.02em] text-(--text)";

export const bandSubtitleClasses = "m-0 mt-1 text-[0.86rem] text-(--muted)";

/**
 * A quiet action in the band's heading: words in the accent, an icon, no
 * box. It dims a little at rest and comes up under the pointer.
 */
export const bandLinkClasses =
  "inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-[0.86rem] font-semibold whitespace-nowrap text-(--accent-ink,var(--accent)) opacity-90 transition-opacity duration-140 hover:opacity-100 hover:underline focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/**
 * A secondary button: a thin ring, no fill, the page's own text. For the
 * actions that sit beside a primary one.
 */
export const quietButtonClasses =
  "inline-flex h-11 min-w-0 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-3 text-[0.9rem] font-semibold whitespace-nowrap text-(--text) @md/price:px-4 transition-colors duration-140 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-55";
