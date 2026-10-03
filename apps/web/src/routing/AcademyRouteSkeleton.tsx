import type { CourseRole } from "../courses/catalogue";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CourseCatalogueLoadingSkeleton } from "../courses/CourseCatalogueSkeleton";
import { CouponsTableLoadingRows } from "../coupons/CouponsTableLoadingRows";
import { LoadingCards, LoadingRows } from "../components/analytics/StatTiles";
import { QuizAuthoringLoadingSkeleton } from "../quizzes/QuizAuthoringLoadingSkeleton";
import { StudentDetailsSkeleton } from "../students/StudentDetailsSkeleton";
import { StudentsTableSkeleton } from "../students/StudentsTableSkeleton";

interface AcademyRouteSkeletonProps {
  page?: string;
  role?: CourseRole;
  quizId?: string;
}

export function AcademyRouteSkeleton({
  page,
  role = "student",
  quizId,
}: AcademyRouteSkeletonProps) {
  if (page === "courses") {
    return <CourseCatalogueLoadingSkeleton role={role} />;
  }

  if (page === "coupons") {
    return <CouponsTableLoadingRows />;
  }

  if (page === "quizzes") {
    return <LoadingRows />;
  }

  if (page === "quiz-builder" && quizId) {
    return <QuizAuthoringLoadingSkeleton />;
  }

  if (page === "analytics") {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        <LoadingCards />
      </div>
    );
  }

  if (page === "students") {
    return <StudentsTableSkeleton />;
  }

  if (page === "student-details") {
    return <StudentDetailsSkeleton />;
  }

  return (
    <div className="grid min-h-52 place-items-center" role="status" aria-label="Loading page">
      <CircleNotch size={26} className="animate-spin text-(--accent)" />
    </div>
  );
}
