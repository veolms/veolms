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
    <span className="relative inline-flex size-[1em] items-center justify-center">
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
  variant: "card-media" | "overview-surface";
};

export function CourseWishlistHeartButton({
  wishlisted,
  disabled = false,
  onClick,
  title,
  variant,
  "aria-label": ariaLabel,
}: CourseWishlistHeartButtonProps) {
  const heartSize = variant === "card-media" ? 21 : 20;

  if (variant === "card-media") {
    return (
      <button
        type="button"
        className="group/wishlist absolute right-3 top-3 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white shadow-lg transition-colors hover:bg-slate-950/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
      className={`group/wishlist inline-flex h-9.5 w-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] text-(--muted) transition-[border-color,color,background-color] duration-160 ease-out hover:border-[color-mix(in_srgb,var(--text)_32%,transparent)] hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
        wishlisted
          ? "border-[color-mix(in_srgb,#ff6684_55%,transparent)]! bg-[color-mix(in_srgb,#ff6684_14%,transparent)]! text-[#ff6684]!"
          : ""
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
