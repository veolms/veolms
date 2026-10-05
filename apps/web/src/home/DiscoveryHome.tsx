import type { CourseSummary } from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { useMemo } from "react";
import { PublicCourseCard } from "../courses/CourseCard";
import { CourseCardSkeleton } from "../courses/CourseCardSkeleton";
import { courseCatalogueHorizontalRowClasses } from "../courses/CourseCatalogueSkeleton";
import { adaptCourseSummaryToCatalogueCourse } from "../courses/courseAdapter";
import { useHomeDiscovery } from "../services/home";
import { usePopularDiscussions } from "../services/learning-interactions";
import type { NavigateTo } from "../routing/navigation";
import { HomeCourseRow } from "./HomeCourseRow";
import { HomeSectionHeader } from "./HomePresentation";
import { PopularDiscussionsPanel } from "./PopularDiscussionsPanel";
import { useHomeTimeGreeting } from "./homeGreeting";
import "../styles/features/student-learning.css";
import "../styles/features/home.css";
import "../styles/features/guest-home.css";
import "../styles/features/dashboard-discussion-preview.css";

export type DiscoveryHomeMode = "guest" | "authenticated";

interface DiscoveryHomeProps {
  mode: DiscoveryHomeMode;
  onNavigatePage: (destination: string) => void;
  studentName?: string;
  accessibleCourseIds?: ReadonlySet<string>;
  onDiscussionNavigatePage?: NavigateTo;
  onDiscussionAccessDenied?: () => void;
}

function DiscoveryHomeState({
  title,
  message,
  onRetry,
  isRetrying = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div
      className="col-span-full rounded-xl border border-(--border) bg-(--card-surface,var(--surface)) px-5 py-8 text-center"
      role={onRetry ? "alert" : "status"}
    >
      <strong className="block text-sm font-semibold text-(--text)">
        {title}
      </strong>
      <p className="mt-1 text-sm text-(--muted)">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-(--control-radius-action) border border-(--border) bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) hover:text-(--accent-ink,var(--accent)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          onClick={onRetry}
          disabled={isRetrying}
          aria-busy={isRetrying}
        >
          {isRetrying ? "Retrying…" : "Try again"}
        </button>
      ) : null}
    </div>
  );
}

function DiscoveryCourseSection({
  title,
  courses,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onNavigatePage,
  publicAction,
  subtitle,
  viewAllLabel = "View all",
  hideWhenEmpty = false,
}: {
  title: string;
  courses: readonly CourseSummary[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onNavigatePage: (destination: string) => void;
  publicAction: "view" | "enroll";
  subtitle?: string;
  viewAllLabel?: string;
  hideWhenEmpty?: boolean;
}) {
  const sectionId =
    "guest-home-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (hideWhenEmpty && !isLoading && !isError && courses.length === 0) {
    return null;
  }

  return (
    <section
      className="dashboard-panel home-continue-panel home-course-section guest-home__course-section"
      aria-labelledby={sectionId}
    >
      <HomeSectionHeader
        icon={BookOpen}
        title={title}
        id={sectionId}
        subtitle={subtitle}
        action={viewAllLabel}
        onAction={() => onNavigatePage("/courses")}
      />

      <div
        className="guest-home__course-row min-w-0 max-w-full"
        data-course-grid-section
      >
        <HomeCourseRow
          id={sectionId + "-courses"}
          label={title}
          isBusy={isLoading || isFetching}
          viewportClassName={courseCatalogueHorizontalRowClasses}
        >
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <CourseCardSkeleton
                key={sectionId + "-skeleton-" + index}
                variant="public"
              />
            ))
          ) : isError ? (
            <DiscoveryHomeState
              title="Courses are unavailable right now"
              message="We couldn't load this discovery section."
              onRetry={onRetry}
              isRetrying={isFetching}
            />
          ) : courses.length === 0 ? (
            <DiscoveryHomeState
              title={"No " + title.toLowerCase() + " yet"}
              message="Check back soon for more courses to explore."
            />
          ) : (
            courses.map((course, index) => (
              <PublicCourseCard
                key={course.id}
                course={adaptCourseSummaryToCatalogueCourse(course)}
                imagePriority={index < 2}
                publicAction={publicAction}
                onNavigatePage={onNavigatePage}
                studentHome
              />
            ))
          )}
        </HomeCourseRow>
      </div>
    </section>
  );
}

function DiscoveryHomeHeader({
  mode,
  studentName,
}: Pick<DiscoveryHomeProps, "mode" | "studentName">) {
  const displayName = studentName?.trim() || "there";
  const timeGreeting = useHomeTimeGreeting();

  return (
    <header className="home-greeting-row guest-home__greeting">
      <div>
        <h1>
          {mode === "authenticated" ? (
            <>
              {timeGreeting}, {displayName}{" "}
            </>
          ) : (
            <>Start learning </>
          )}
          <span aria-hidden="true">👋</span>
        </h1>
        <p>
          Explore popular courses, start something for free, or discover
          something new.
        </p>
      </div>
    </header>
  );
}

function DiscoveryEnrollmentBanner({ onExplore }: { onExplore: () => void }) {
  return (
    <section
      className="dashboard-panel flex min-w-0 flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      aria-labelledby="discovery-home-enrollment-banner-title"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--accent)/15 text-(--accent-ink,var(--accent))">
          <GraduationCap size={20} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="discovery-home-enrollment-banner-title"
            className="text-sm font-semibold leading-snug text-(--text)"
          >
            You have not enrolled in any course yet.
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-(--muted)">
            Explore the catalogue and start learning something new today.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="primary-learning-action !mt-0 w-full shrink-0 sm:w-auto"
        onClick={onExplore}
      >
        Explore Courses <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

export function DiscoveryHome({
  mode,
  onNavigatePage,
  studentName,
  accessibleCourseIds,
  onDiscussionNavigatePage,
  onDiscussionAccessDenied,
}: DiscoveryHomeProps) {
  const discoveryQuery = useHomeDiscovery();
  const discussionsQuery = usePopularDiscussions();
  const discovery = discoveryQuery.data;
  const discussions = useMemo(
    () => discussionsQuery.data?.discussions ?? [],
    [discussionsQuery.data?.discussions],
  );

  return (
    <main className={`student-home guest-home guest-home--${mode}`}>
      <DiscoveryHomeHeader mode={mode} studentName={studentName} />

      <div className="home-dashboard-grid guest-home__layout">
        <div className="guest-home__course-column">
          {mode === "authenticated" ? (
            <DiscoveryEnrollmentBanner
              onExplore={() => onNavigatePage("/courses")}
            />
          ) : null}
          <DiscoveryCourseSection
            title="Popular Courses"
            courses={discovery?.popularCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Explore courses learners are enjoying right now."
          />
          <DiscoveryCourseSection
            title="Free Courses"
            courses={discovery?.freeCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Start learning with courses available at no cost."
            viewAllLabel="Explore all"
            hideWhenEmpty
          />
          <DiscoveryCourseSection
            title="Recently Added"
            courses={discovery?.recentCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Discover the latest courses added to the catalogue."
          />
        </div>

        <aside className="guest-home__discussion-column">
          <PopularDiscussionsPanel
            className="guest-home__discussion-panel"
            isLoading={discussionsQuery.isLoading}
            isError={discussionsQuery.isError}
            isFetching={discussionsQuery.isFetching}
            discussions={discussions}
            onRetry={() => void discussionsQuery.refetch()}
            accessibleCourseIds={accessibleCourseIds}
            onDiscussionNavigatePage={onDiscussionNavigatePage}
            onDiscussionAccessDenied={onDiscussionAccessDenied}
          />
        </aside>
      </div>
    </main>
  );
}
