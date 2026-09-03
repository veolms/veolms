import { ImageIcon as Image } from "@phosphor-icons/react/Image";

export interface CourseThumbnailPlaceholderProps {
  className?: string;
}

export function CourseThumbnailPlaceholder({
  className = "",
}: CourseThumbnailPlaceholderProps) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--surface-strong)_85%,transparent)_0%,color-mix(in_srgb,var(--track)_95%,var(--canvas))_100%)] select-none pointer-events-none ${className}`}
      aria-hidden="true"
      data-testid="course-thumbnail-placeholder"
    >
      {/* Subtle geometric pattern */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Centered neutral icon badge */}
      <div className="relative flex items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_65%,transparent)] p-3.5 shadow-sm backdrop-blur-xs">
        <Image
          size={30}
          weight="duotone"
          className="text-(--muted) opacity-60"
        />
      </div>
    </div>
  );
}
