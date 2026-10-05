import type { EnrolledCoursesResponse } from "@veolms/contracts";
import type { LearningCourse } from "../StudentPages";
import { lazy, Suspense, type ReactNode } from "react";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { useEnrolledCourses } from "../services/enrollments";
import { useCourses } from "../services/courses";
import { useRecentLearningUpdates } from "../services/recent-updates";
import type { StudentHomeEnrollmentState } from "../StudentHome";
import "../styles/features/home.css";

const StudentHome = lazy(() =>
  import("../StudentHome").then((module) => ({
    default: module.StudentHome,
  })),
);
const DiscoveryHome = lazy(() =>
  import("./DiscoveryHome").then((module) => ({
    default: module.DiscoveryHome,
  })),
);
const StudentHomeZeroProgress = lazy(() =>
  import("../StudentHomeZeroProgress").then((module) => ({
    default: module.StudentHomeZeroProgress,
  })),
);

interface AuthenticatedHomeBoundaryProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  studentName?: string;
  /**
   * Rendered while enrollments load and while the lazy dashboard chunk
   * resolves, instead of the spinner states. The shell passes the seeded
   * guest home here so a signed-in load swaps content exactly once
   * (guest home -> dashboard) rather than flashing spinners in between,
   * which scored large layout shifts in Lighthouse.
   */
  pendingContent?: ReactNode;
}

function HomeState({
  children,
  description,
  role,
}: {
  children: ReactNode;
  description?: string;
  role: "alert" | "status";
}) {
  return (
    <section
      className="grid min-h-52 place-items-center rounded-xl border border-(--border) bg-(--card-surface,var(--surface)) px-5 py-8 text-center"
      role={role}
    >
      <div>
        <strong className="block text-sm font-semibold text-(--text)">
          {children}
        </strong>
        {description ? (
          <p className="mt-1 text-sm text-(--muted)">{description}</p>
        ) : null}
      </div>
    </section>
  );
}

function HomeLoadingState() {
  return (
    <div className="home-boundary-loading" role="status" aria-busy="true">
      <LoadingSpinnerIcon size={22} />
      <span>Preparing your Home…</span>
    </div>
  );
}

function HomeEnrollmentErrorState({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <HomeState
      role="alert"
      description="We couldn't load your enrolled courses."
    >
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center rounded-(--control-radius-action) border border-(--border) bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) hover:text-(--accent-ink,var(--accent)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        onClick={onRetry}
        disabled={isRetrying}
        aria-busy={isRetrying}
      >
        {isRetrying ? "Retrying…" : "Try again"}
      </button>
    </HomeState>
  );
}

function AuthenticatedZeroProgressHome({
  enrolledData,
  onNavigatePage,
  setNotice,
  studentName,
}: {
  enrolledData: EnrolledCoursesResponse;
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  studentName?: string;
}) {
  const { data: publishedCoursesData, isLoading: publishedCoursesLoading } =
    useCourses();
  const {
    data: recentUpdatesResponse,
    isLoading: recentUpdatesLoading,
    isError: recentUpdatesError,
    isFetching: recentUpdatesFetching,
    refetch: refetchRecentUpdates,
  } = useRecentLearningUpdates();

  return (
    <Suspense
      fallback={
        <section className="home-resume-card home-resume-card--state">
          <div className="home-resume-state" role="status" aria-busy="true">
            <strong>Preparing your learning Home…</strong>
          </div>
        </section>
      }
    >
      <StudentHomeZeroProgress
        studentName={studentName}
        enrolledCourses={enrolledData.courses}
        publishedCourses={publishedCoursesData?.courses ?? []}
        publishedCoursesLoading={publishedCoursesLoading}
        recentUpdateCourses={recentUpdatesResponse?.courses ?? []}
        hasRecentUpdatesData={recentUpdatesResponse !== undefined}
        recentUpdatesLoading={recentUpdatesLoading}
        recentUpdatesError={recentUpdatesError}
        recentUpdatesFetching={recentUpdatesFetching}
        refetchRecentUpdates={() => refetchRecentUpdates()}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    </Suspense>
  );
}

export function AuthenticatedHomeBoundary({
  onOpenCourse,
  onNavigatePage,
  setNotice,
  studentName,
  pendingContent,
}: AuthenticatedHomeBoundaryProps) {
  const enrollmentQuery = useEnrolledCourses();
  const enrollmentData = enrollmentQuery.data;

  if (enrollmentData === undefined) {
    if (enrollmentQuery.isError) {
      return (
        <HomeEnrollmentErrorState
          isRetrying={enrollmentQuery.isFetching}
          onRetry={() => void enrollmentQuery.refetch()}
        />
      );
    }

    return <>{pendingContent ?? <HomeLoadingState />}</>;
  }

  if (enrollmentQuery.isError && enrollmentData.courses.length === 0) {
    return (
      <HomeEnrollmentErrorState
        isRetrying={enrollmentQuery.isFetching}
        onRetry={() => void enrollmentQuery.refetch()}
      />
    );
  }

  if (enrollmentData.courses.length === 0) {
    return (
      <Suspense fallback={pendingContent ?? <HomeLoadingState />}>
        <DiscoveryHome
          mode="authenticated"
          studentName={studentName}
          accessibleCourseIds={new Set()}
          onDiscussionNavigatePage={onNavigatePage}
          onDiscussionAccessDenied={() =>
            setNotice?.("You don't have access to this course.")
          }
        />
      </Suspense>
    );
  }

  const hasMeaningfulLearningProgress = enrollmentData.courses.some(
    (course) => (course.progress ?? 0) > 0,
  );

  if (!hasMeaningfulLearningProgress) {
    return (
      <AuthenticatedZeroProgressHome
        enrolledData={enrollmentData}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
        studentName={studentName}
      />
    );
  }

  const enrollment: StudentHomeEnrollmentState = {
    data: enrollmentData,
    isLoading: enrollmentQuery.isLoading,
    isError: enrollmentQuery.isError,
    isFetching: enrollmentQuery.isFetching,
    refetch: () => enrollmentQuery.refetch(),
  };

  return (
    <Suspense fallback={pendingContent ?? <HomeLoadingState />}>
      <StudentHome
        onOpenCourse={onOpenCourse}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
        studentName={studentName}
        enrollment={enrollment}
      />
    </Suspense>
  );
}
