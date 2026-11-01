import type { CourseRole } from "../courses/catalogue";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CourseCatalogueLoadingSkeleton } from "../courses/CourseCatalogueSkeleton";
import { CreatorDashboardSkeleton } from "../home/creator/CreatorDashboardSkeleton";
import { CouponsTableLoadingRows } from "../coupons/CouponsTableLoadingRows";
import { LoadingRows } from "../components/analytics/StatTiles";
import { AnalyticsPageLoading } from "../analytics/AnalyticsPageChrome";
import { ProgressPageSkeleton } from "../progress/ProgressPageSkeleton";
import { QuizAuthoringLoadingSkeleton } from "../quizzes/QuizAuthoringLoadingSkeleton";
import { StudentDetailsSkeleton } from "../students/StudentDetailsSkeleton";
import { StudentsTableSkeleton } from "../students/StudentsTableSkeleton";

interface AcademyRouteSkeletonProps {
  page?: string;
  role?: CourseRole;
  quizId?: string;
  /** For the analytics page: which sections to show in its frame. */
  isAdmin?: boolean;
  /** For the analytics page: the section from the path. */
  analyticsTab?: string;
}

export function AcademyRouteSkeleton({
  page,
  role = "student",
  quizId,
  isAdmin = false,
  analyticsTab,
}: AcademyRouteSkeletonProps) {
  if (page === "courses") {
    return <CourseCatalogueLoadingSkeleton role={role} />;
  }

  if (page === "home" && role === "creator") {
    return <CreatorDashboardSkeleton />;
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
    // The page's own frame, so the heading, tabs and filters are there
    // before the page's code is; only the numbers come later.
    return <AnalyticsPageLoading isAdmin={isAdmin} tab={analyticsTab} />;
  }

  if (page === "students") {
    return <StudentsTableSkeleton />;
  }

  if (page === "student-details") {
    return <StudentDetailsSkeleton />;
  }

  if (page === "progress") {
    return <ProgressPageSkeleton />;
  }

  return (
    <div
      className="grid min-h-52 place-items-center"
      role="status"
      aria-label="Loading page"
    >
      <CircleNotch size={26} className="animate-spin text-(--accent)" />
    </div>
  );
}
