import type { CourseRole } from "./catalogue";
import { CourseCardSkeleton } from "./CourseCardSkeleton";

export const getCourseCatalogueGridClasses = (role: CourseRole) =>
  role === "creator"
    ? "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3"
    : "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

export const courseCatalogueHorizontalRowClasses =
  "grid min-w-0 max-w-full auto-cols-[calc(100%-1rem)] grid-flow-col gap-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[560px]:auto-cols-[calc((100%-1rem)/2)] lg:auto-cols-[calc((100%-2rem)/3)]";

export function CourseCatalogueLoadingSkeleton({ role }: { role: CourseRole }) {
  return (
    <div
      className="mt-4 min-[640px]:mt-6"
      data-course-grid-section
      data-course-catalogue-grid
      suppressHydrationWarning
    >
      <div
        className={getCourseCatalogueGridClasses(role)}
        data-testid="course-catalogue-skeleton"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <CourseCardSkeleton key={index} role={role} />
        ))}
      </div>
    </div>
  );
}
