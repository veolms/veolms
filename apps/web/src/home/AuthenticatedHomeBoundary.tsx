import type { LearningCourse } from "../StudentPages";
import type { CourseOpenOptions } from "../courses/catalogue";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { NavigateTo } from "../routing/navigation";
import { useEnrolledCourses } from "../services/enrollments";
import type { GuestHomeCourseCardActions } from "./guest/GuestHomeCourseSection";
import { readHomeHint, rememberHomeHint } from "../store/homeHint";
import { learnerHomeBody } from "../routing/prerenderedBodies";
import { LearnerHomeShell } from "./learner/LearnerHomeSkeleton";

const LearnerHome = learnerHomeBody.Body;

interface AuthenticatedHomeBoundaryProps {
  onOpenCourse: (course: LearningCourse, options?: CourseOpenOptions) => void;
  onNavigatePage: NavigateTo;
  /** The learner's display name; it may be empty. */
  learnerName: string;
  /** What the home's course cards need from the page shell. */
  courseCardActions: GuestHomeCourseCardActions;
  /**
   * The session check has not answered yet, but this browser was signed in
   * last time. The learner's home is put up at once, with placeholders
   * where the learner's own things go, and nothing of theirs is asked for
   * until the session is confirmed.
   */
  sessionPending?: boolean;
  /**
   * Rendered while enrollments load, in place of the learner's home with
   * its placeholders. The shell passes the seeded guest home here when that
   * is what is already on screen (someone who has just signed in), so the
   * page swaps content exactly once (guest home -> learner home).
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
  sessionPending = false,
  pendingContent,
  notEnrolledContent,
}: AuthenticatedHomeBoundaryProps) {
  const enrollmentQuery = useEnrolledCourses({ enabled: !sessionPending });
  // Nothing is asked for until the session is confirmed, but the courses
  // this tab kept for the account (see services/accountSessionCopies.ts)
  // are shown meanwhile: a reload draws the home as it was.
  const enrollmentData = enrollmentQuery.data;
  // Which home this learner had last time, read once: it only stands in
  // until their courses answer, and must not change under the page.
  const [wasNotEnrolled] = useState(() => readHomeHint() === "new-learner");
  const isNotEnrolled = enrollmentData
    ? enrollmentData.courses.length === 0
    : undefined;
  useEffect(() => {
    if (isNotEnrolled !== undefined) {
      rememberHomeHint(isNotEnrolled ? "new-learner" : null);
    }
  }, [isNotEnrolled]);

  if (!sessionPending) {
    if (
      enrollmentQuery.isError &&
      (enrollmentData === undefined || enrollmentData.courses.length === 0)
    ) {
      return (
        <HomeEnrollmentErrorState
          isRetrying={enrollmentQuery.isFetching}
          onRetry={() => void enrollmentQuery.refetch()}
        />
      );
    }

    if (enrollmentData === undefined && pendingContent) {
      return <>{pendingContent}</>;
    }
  }

  if (enrollmentData?.courses.length === 0) {
    return <>{notEnrolledContent}</>;
  }

  // A learner who had no courses last time is shown that home while the
  // session and the courses are on their way, from the same place as when
  // they have answered, so its picture is drawn once and stays where it is.
  if (enrollmentData === undefined && wasNotEnrolled) {
    return <>{notEnrolledContent}</>;
  }

  // The learner's home is the same element from the moment the page opens
  // until its courses are on it: it puts up its own placeholders while the
  // session and the courses are on their way, so the hero's picture is
  // drawn once and stays. The shell stands in only while its code loads.
  return (
    <Suspense fallback={<LearnerHomeShell learnerName={learnerName} />}>
      <LearnerHome
        enrolledCourses={enrollmentData?.courses}
        sessionPending={sessionPending}
        learnerName={learnerName}
        courseCardActions={courseCardActions}
        onOpenCourse={onOpenCourse}
        onNavigatePage={onNavigatePage}
      />
    </Suspense>
  );
}
