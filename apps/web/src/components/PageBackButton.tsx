import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";

/**
 * The app's back button: a rounded square with an arrow, the shape the
 * other controls have.
 *
 * - "surface" (the default): on the page, in a page's heading.
 * - "glass": over a picture (the course page's hero on a phone), dark
 *   frosted glass so it reads on any thumbnail, as the hero's play and
 *   wishlist buttons do; slightly larger, as a touch target on an image.
 */
export function PageBackButton({
  onClick,
  variant = "surface",
  label = "Go back to the previous page",
  title = "Go back",
  className = "",
}: {
  onClick: () => void;
  variant?: "surface" | "glass";
  /** What the button says to screen readers: where it leads, when known. */
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
        variant === "glass"
          ? "size-10 border-0 bg-black/40 text-white shadow-[0_4px_16px_rgb(0_0_0/0.25)] backdrop-blur-md hover:bg-black/60 focus-visible:outline-white"
          : // Most palettes do not name a card surface of their own; without
            // the fallback the button had no background on them.
            "size-9 self-center border border-(--border) bg-(--card-surface,var(--surface)) text-(--muted) shadow-sm hover:bg-(--hover) hover:text-(--text) focus-visible:outline-(--accent)"
      } ${className}`}
    >
      <ArrowLeft size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
