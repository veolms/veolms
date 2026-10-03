import type { LearningCourse } from "../StudentPages";
import { lazy, Suspense, type ReactNode } from "react";
import { useEnrolledCourses } from "../services/enrollments";
import type { StudentHomeEnrollmentState } from "../StudentHome";

const StudentHome = lazy(() =>
  import("../StudentHome").then((module) => ({
    default: module.StudentHome,
  })),
);

interface AuthenticatedHomeBoundaryProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  studentName?: string;
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
    <HomeState role="status" description="Preparing your Home.">
      Loading your courses…
    </HomeState>
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

export function AuthenticatedHomeBoundary({
  onOpenCourse,
  onNavigatePage,
  studentName,
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

    return <HomeLoadingState />;
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
      <HomeState
        role="status"
        description="Your discovery Home is coming soon."
      >
        No enrolled courses
      </HomeState>
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
    <Suspense fallback={<HomeLoadingState />}>
      <StudentHome
        onOpenCourse={onOpenCourse}
        onNavigatePage={onNavigatePage}
        studentName={studentName}
        enrollment={enrollment}
      />
    </Suspense>
  );
}
