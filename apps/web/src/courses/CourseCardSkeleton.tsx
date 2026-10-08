import type { CourseRole } from "./catalogue";

/**
 * `role` and `variant` no longer change the placeholder: the thumbnail is a
 * plain block for everyone, as on the real card. They are still accepted so
 * callers do not have to change.
 */
export interface CourseCardSkeletonProps {
  role?: CourseRole;
  variant?: "catalogue" | "public";
}

export function CourseCardSkeleton(_props: CourseCardSkeletonProps) {
  return (
    <article
      className="group relative min-w-0 overflow-visible rounded-xl border border-(--border) bg-(--card-surface,var(--surface)) shadow-(--card-shadow) animate-pulse"
      aria-hidden="true"
      data-testid="course-card-skeleton"
    >
      {/* Thumbnail Aspect Ratio Box */}
      <div className="relative aspect-video overflow-hidden rounded-t-[11px] bg-(--track)" />

      {/* Details Box */}
      <div className="relative flex min-h-46 flex-col p-4">
        {/* Title & Metadata Skeletons */}
        <div className="flex flex-col gap-2">
          <div className="h-5 w-3/4 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
          <div className="h-3.5 w-1/2 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
        </div>

        {/* Price, then the action button */}
        <div className="mt-auto flex flex-col gap-3 pt-4">
          <div className="h-5 w-[35%] rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
          <div className="h-11 w-full rounded-(--control-radius-action) bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
        </div>
      </div>
    </article>
  );
}
