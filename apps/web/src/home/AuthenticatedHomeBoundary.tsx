import type { LearningCourse } from "../StudentPages";
import { lazy, Suspense, type ReactNode } from "react";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import type { NavigateTo } from "../routing/navigation";
import { useEnrolledCourses } from "../services/enrollments";
import type { GuestHomeCourseCardActions } from "./guest/GuestHomeCourseSection";

const LearnerHome = lazy(() =>
  import("./learner/LearnerHome").then((module) => ({
    default: module.LearnerHome,
  })),
);

interface AuthenticatedHomeBoundaryProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: NavigateTo;
  /** The learner's display name; it may be empty. */
  learnerName: string;
  /** What the home's course cards need from the page shell. */
  courseCardActions: GuestHomeCourseCardActions;
  /**
   * Rendered while enrollments load and while the lazy learner home chunk
   * resolves, instead of the spinner states. The shell passes the seeded
   * guest home here so a signed-in load swaps content exactly once
   * (guest home -> learner home) rather than flashing spinners in between,
   * which scored large layout shifts in Lighthouse.
   */
  pendingContent?: ReactNode;
  /**
   * The home of a learner who has not enrolled in anything yet: the guest
   * home with a hero that greets them. It is returned from the same place
   * as `pendingContent`, so a guest home that is already on screen is kept
   * and only its hero copy changes.
   */
  notEnrolledContent: ReactNode;
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
    <div
      className="flex min-h-[clamp(18rem,40vh,28rem)] items-center justify-center gap-2.5 px-4 py-6 text-center text-[0.88rem] font-[550] text-(--muted)"
      role="status"
      aria-busy="true"
    >
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

export function AuthenticatedHomeBoundary({
  onOpenCourse,
  onNavigatePage,
  learnerName,
  courseCardActions,
  pendingContent,
  notEnrolledContent,
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
    return <>{notEnrolledContent}</>;
  }

  return (
    <Suspense fallback={pendingContent ?? <HomeLoadingState />}>
      <LearnerHome
        enrolledCourses={enrollmentData.courses}
        learnerName={learnerName}
        courseCardActions={courseCardActions}
        onOpenCourse={onOpenCourse}
        onNavigatePage={onNavigatePage}
      />
    </Suspense>
  );
}
