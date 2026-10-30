import type { ReactNode } from "react";

/** Small text buttons under a post: Like, Reply. */
export function DiscussionRowAction({
  icon,
  label,
  pressed,
  onClick,
  ariaLabel,
  plain = false,
}: {
  icon: ReactNode;
  label: ReactNode;
  pressed?: boolean;
  onClick: () => void;
  ariaLabel?: string;
  /** No box: the pressed state is the colour alone (Like, as under a
   * lesson video). */
  plain?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        // A double click counts once (it would otherwise like and unlike).
        if (event.detail > 1) return;
        onClick();
      }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${
        plain
          ? pressed
            ? "text-(--accent-ink,var(--accent))"
            : "text-(--muted) hover:text-(--text)"
          : pressed
            ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)"
            : "text-(--muted) hover:bg-(--hover) hover:text-(--text)"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
