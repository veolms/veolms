/**
 * The payment button's icon: a bank card reduced to what reads at a button's
 * size, an outline and the one stripe across it. The icon set's own card has
 * two small marks in its corner that turn to specks at this size.
 *
 * Under the pointer (or the keyboard's focus) the part of the card above
 * the stripe fills in, the stripe growing into a solid band; the part below
 * it stays an outline, so it still reads as a card and not as a block. The
 * button carries `group/action` (it is in `priceBarActionClasses`). It is a little larger than the other
 * button icons: a card is wide and low, and at their size it looked smaller
 * than they do.
 */
export function PayCardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.3em] shrink-0"
      aria-hidden="true"
    >
      {/* The card's upper part, from the top down to the stripe, with the
          outline's own top corners. Already in the page, so nothing moves
          when it comes up. */}
      <path
        d="M2.5 10V7.5A2.5 2.5 0 0 1 5 5h14a2.5 2.5 0 0 1 2.5 2.5V10z"
        fill="currentColor"
        stroke="none"
        className="opacity-0 transition-opacity duration-140 group-hover/action:opacity-100 group-focus-visible/action:opacity-100 motion-reduce:transition-none"
      />
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
    </svg>
  );
}
