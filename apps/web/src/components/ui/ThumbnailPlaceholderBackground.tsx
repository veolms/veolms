interface ThumbnailPlaceholderBackgroundProps {
  className?: string;
}

/** Neutral, theme-aware thumbnail background shared by media placeholders. */
export function ThumbnailPlaceholderBackground({
  className = "",
}: ThumbnailPlaceholderBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="thumbnail-placeholder-background"
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--surface-strong)_85%,transparent)_0%,color-mix(in_srgb,var(--track)_95%,var(--canvas))_100%)] ${className}`}
    >
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}
