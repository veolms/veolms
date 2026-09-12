import type { CourseRole } from "./catalogue";

export interface CourseCardSkeletonProps {
  role?: CourseRole;
}

export function CourseCardSkeleton({ role = "student" }: CourseCardSkeletonProps) {
  return (
    <article
      className="group relative min-w-0 overflow-visible rounded-xl border border-(--border) bg-(--card-surface,var(--surface)) shadow-(--card-shadow) animate-pulse"
      aria-hidden="true"
      data-testid="course-card-skeleton"
    >
      {/* Thumbnail Aspect Ratio Box */}
      <div className="relative aspect-video overflow-hidden rounded-t-[11px] bg-(--track)">
        {/* Status Badge Placeholder */}
        <div className="absolute left-3.5 top-3.5 h-7 w-20 rounded-lg bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />

        {/* Wishlist Button Placeholder for Students */}
        {role === "student" && (
          <div className="absolute right-3 top-3 h-11 w-11 rounded-full bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
        )}
      </div>

      {/* Details Box */}
      <div className="relative flex min-h-46 flex-col p-4">
        {/* Title & Metadata Skeletons */}
        <div className="flex flex-col gap-2">
          <div className="h-5 w-3/4 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
          <div className="h-3.5 w-1/2 rounded bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
        </div>

        {/* Action Button Placeholder */}
        <div className="mt-auto pt-4">
          <div className="h-11 w-full rounded-(--control-radius-action) bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))]" />
        </div>
      </div>
    </article>
  );
}
