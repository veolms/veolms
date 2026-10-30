import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import type { MouseEvent } from "react";

function CourseWishlistHeartIcon({
  wishlisted,
  size,
}: {
  wishlisted: boolean;
  size: number;
}) {
  return (
    <span className="relative inline-flex items-center justify-center">
      <Heart
        size={size}
        weight={wishlisted ? "fill" : "regular"}
        className={wishlisted ? "text-[#ff6684]" : "text-current"}
        aria-hidden
      />
      {!wishlisted ? (
        <Heart
          size={size}
          weight="fill"
          className="pointer-events-none absolute text-[#ff6684] opacity-0 transition-opacity duration-150 group-hover/wishlist:opacity-[0.28] group-focus-visible/wishlist:opacity-[0.28]"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export type CourseWishlistHeartButtonProps = {
  wishlisted: boolean;
  "aria-label": string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  variant: "card-media" | "overview-hero";
};

export function CourseWishlistHeartButton({
  wishlisted,
  disabled = false,
  onClick,
  title,
  variant,
  "aria-label": ariaLabel,
}: CourseWishlistHeartButtonProps) {
  const heartSize = variant === "card-media" ? 23 : 22;

  if (variant === "card-media") {
    return (
      <button
        type="button"
        className="group/wishlist absolute right-3 top-3 z-20 flex min-h-10 min-w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white shadow-lg transition-colors hover:bg-slate-950/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-label={ariaLabel}
        aria-pressed={wishlisted}
        disabled={disabled}
        onClick={onClick}
        title={title}
      >
        <CourseWishlistHeartIcon wishlisted={wishlisted} size={heartSize} />
      </button>
    );
  }

  return (
    <button
      type="button"
      // On the course page's hero, which is dark by day as well: dark
      // glass with no ring round it, as the hero's back and play buttons
      // have. A wishlisted course tints the glass pink instead of outlining
      // it.
      className={`group/wishlist inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_4px_16px_rgb(0_0_0/0.25)] backdrop-blur-md transition-[background-color] duration-160 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default ${
        wishlisted
          ? "bg-[color-mix(in_srgb,#ff6684_26%,rgb(0_0_0/0.4))] hover:bg-[color-mix(in_srgb,#ff6684_34%,rgb(0_0_0/0.6))]"
          : "bg-black/40 hover:bg-black/60"
      }`}
      aria-label={ariaLabel}
      aria-pressed={wishlisted}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <CourseWishlistHeartIcon wishlisted={wishlisted} size={heartSize} />
    </button>
  );
}
