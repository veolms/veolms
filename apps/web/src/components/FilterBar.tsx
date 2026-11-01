import type { ComponentProps } from "react";

/**
 * The row of search and filter controls above a list (Discussions, Orders,
 * Students and the rest). It has no box of its own: the controls lie
 * straight on the page, in line with the cards under them.
 *
 * One control is 44px tall with 12px corners (4px rounder than the
 * roundness preference's other controls, when one is set), a soft fill and
 * a thin accent line that brightens while the control has focus. The Discussions page
 * still lays its bar out from `discussions.css` (a subgrid, and a sheet on
 * phones); the sizes there are kept equal to these by hand.
 *
 * Written out in full: Tailwind only generates classes it can read as
 * literals.
 */

/** The surface of one control: a search field, or the frame around a select. */
export const filterControlClasses =
  "flex min-h-11 items-center rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]";

/**
 * For a `ThemedSelect` trigger inside a control: the frame around it
 * already draws the surface, so the trigger itself is bare.
 */
export const filterSelectTriggerClasses =
  "min-h-11! p-0! bg-transparent! shadow-none! border-0! text-xs md:text-sm font-medium text-(--text-secondary) hover:bg-transparent! hover:text-(--text)! focus:outline-none! flex items-center justify-between";

/** A plain button in the row (Reset, a mobile "Filters" toggle): the size and corners only. */
export const filterButtonSizeClasses = "min-h-11 rounded-xl";

export function FilterBar({ className = "", ...rest }: ComponentProps<"div">) {
  return (
    <div
      // Tells the roundness preference these are filter controls (see
      // `styles/global/control-radius.css`).
      data-filter-bar=""
      className={`flex flex-col ${className}`.trim()}
      {...rest}
    />
  );
}
