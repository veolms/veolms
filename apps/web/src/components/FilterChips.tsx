import type { ReactNode } from "react";

import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { cn } from "../lib/utils";

/**
 * The app's filter chips (the course catalogue's quick filters, Chats' All /
 * Unread / Groups, the storage page's kinds), coloured from the theme in
 * both light and dark: resting chips take a light tint of the accent, with
 * no outline, and the selected one is filled with the accent and lifted by
 * a soft shadow of the same colour, with no edge lines. Its shadow is kept
 * short, because a chip row clips anything that reaches far past it. The
 * accent is laid on as an image, and under it the selected chip keeps the
 * resting tint; only the hover fill is animated, so a chip that loses the
 * selection takes its resting look at once instead of fading.
 *
 * Written out in full: Tailwind only generates classes it can read as
 * literals.
 */
export const filterChipClassName =
  "group/quick-filter relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-(--control-radius-structured) border border-[color-mix(in_srgb,var(--text)_12%,transparent)] [--quick-filter-fill:color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-(--quick-filter-fill) px-3.5 text-xs! leading-5! font-semibold max-[640px]:font-semibold! text-(--text) shadow-[0_5px_14px_color-mix(in_srgb,var(--accent-shadow)_16%,transparent)] transition-[background-color,border-color,color,box-shadow] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,var(--surface))] hover:text-(--text) aria-selected:border-[color-mix(in_srgb,var(--accent)_70%,transparent)] aria-selected:bg-(--accent) aria-selected:text-(--on-accent) aria-selected:shadow-[0_4px_11px_color-mix(in_srgb,var(--accent-shadow)_40%,transparent)] aria-selected:hover:bg-(--accent-hover) sm:min-h-9 sm:px-4 sm:text-[0.8rem]! [:root:not([data-elevated-surfaces=false])_&]:border-transparent [:root:not([data-elevated-surfaces=false])_&:not([aria-selected=true])]:shadow-none [:root:not([data-elevated-surfaces=false])_&[aria-selected=true]]:bg-[linear-gradient(var(--accent),var(--accent))] [:root:not([data-elevated-surfaces=false])_&[aria-selected=true]]:bg-(--quick-filter-fill) [:root:not([data-elevated-surfaces=false])_&]:transition-[background-color] [:root[data-theme=light]:not([data-elevated-surfaces=false])_&[aria-selected=true]]:shadow-[0_1px_3px_color-mix(in_srgb,var(--accent)_28%,transparent),0_5px_14px_color-mix(in_srgb,var(--accent)_32%,transparent)] [:root[data-theme=dark]:not([data-elevated-surfaces=false])_&[aria-selected=true]]:shadow-[0_1px_3px_rgb(0_0_0/35%),0_5px_14px_color-mix(in_srgb,var(--accent)_30%,transparent)]";

/**
 * A chip's count is not drawn inside it (a boxed number reads as a keyboard
 * shortcut there). It stays in the chip's text for screen readers and shows
 * only while the chip is hovered or focused from the keyboard, as a
 * notification badge on its top-right corner. Touch screens cannot hover,
 * so there the selected chip always shows its count. On the selected chip
 * the badge swaps its colours so it stands apart from the accent fill.
 */
export const filterChipCountClassName =
  "pointer-events-none absolute -top-1.5 -right-1.5 z-1 inline-flex h-4 min-w-4 scale-75 items-center justify-center rounded-full bg-(--accent) px-[3px] text-[0.625rem]! leading-none font-bold tabular-nums text-(--on-accent) opacity-0 transition-[opacity,scale] duration-150 ease-out group-hover/quick-filter:scale-100 group-hover/quick-filter:opacity-100 group-focus-visible/quick-filter:scale-100 group-focus-visible/quick-filter:opacity-100 motion-reduce:transition-none group-aria-selected/quick-filter:bg-(--on-accent) group-aria-selected/quick-filter:text-(--accent) [@media(hover:none)]:group-aria-selected/quick-filter:scale-100 [@media(hover:none)]:group-aria-selected/quick-filter:opacity-100";

/** A badge that always shows (unread chats, requests waiting). */
const alwaysCountClassName =
  "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-(--accent) px-1 text-[0.65rem] leading-none font-bold tabular-nums text-(--on-accent) group-aria-selected/quick-filter:bg-(--on-accent) group-aria-selected/quick-filter:text-(--accent)";

export interface FilterChipItem<T extends string> {
  id: T;
  label: ReactNode;
  /** A number drawn inside the chip (only when above 0). */
  count?: number;
}

/** A row of filter chips (a tablist: arrow keys move between them). */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: ReadonlyArray<FilterChipItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-2 overflow-x-auto [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={handleRovingTabKeyDown}
          className={cn(filterChipClassName, "cursor-pointer")}
        >
          <span>{item.label}</span>
          {item.count && item.count > 0 ? (
            <span className={alwaysCountClassName}>
              {item.count > 99 ? "99+" : item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
