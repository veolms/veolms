import type { CourseRole } from "./catalogue";
import { CourseCardSkeleton } from "./CourseCardSkeleton";

export const getCourseCatalogueGridClasses = (role: CourseRole) =>
  role === "creator"
    ? "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3"
    : "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

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
