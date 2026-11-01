import type { Icon } from "@phosphor-icons/react";

/**
 * An icon for the bar's main button: drawn in outline, and filled in while
 * the button is under the pointer or has the keyboard's focus. The button
 * itself stays where it is; this is what answers the pointer. The button
 * carries `group/action` (it is in `priceBarActionClasses`).
 *
 * Both drawings are in the page, one over the other, so nothing is fetched
 * or laid out again when they swap.
 */
export function HoverFillIcon({ icon: IconGlyph }: { icon: Icon }) {
  return (
    <span
      className="relative inline-flex size-[1.15em] shrink-0"
      aria-hidden="true"
    >
      <IconGlyph
        size="1.15em"
        weight="bold"
        className="transition-opacity duration-140 group-hover/action:opacity-0 group-focus-visible/action:opacity-0 motion-reduce:transition-none"
      />
      <IconGlyph
        size="1.15em"
        weight="fill"
        className="absolute inset-0 opacity-0 transition-opacity duration-140 group-hover/action:opacity-100 group-focus-visible/action:opacity-100 motion-reduce:transition-none"
      />
    </span>
  );
}
