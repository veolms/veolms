import { ImageIcon as Image } from "@phosphor-icons/react/Image";
import { ThumbnailPlaceholderBackground } from "../components/ui/ThumbnailPlaceholderBackground";

export interface CourseThumbnailPlaceholderProps {
  className?: string;
}

export function CourseThumbnailPlaceholder({
  className = "",
}: CourseThumbnailPlaceholderProps) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden select-none pointer-events-none ${className}`}
      aria-hidden="true"
      data-testid="course-thumbnail-placeholder"
    >
      <ThumbnailPlaceholderBackground />

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
