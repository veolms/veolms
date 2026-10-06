import type {
  CourseSummary,
  HomeDiscoveryResponse,
  PublicPopularDiscussion,
} from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { lazy, Suspense, useMemo } from "react";
import { PublicCourseCard } from "../courses/CourseCard";
import { CourseCardSkeleton } from "../courses/CourseCardSkeleton";
import {
  courseCatalogueHorizontalRowClasses,
  courseCatalogueStaticRowClasses,
} from "../courses/CourseCatalogueSkeleton";
import { adaptCourseSummaryToCatalogueCourse } from "../courses/courseAdapter";
import { useHomeDiscovery } from "../services/home";
import { usePopularDiscussions } from "../services/learning-interactions";
import type { NavigateTo } from "../routing/navigation";
import { HomeCourseRow, HomeStaticCourseRow } from "./HomeCourseRow";
import { HomeSectionHeader } from "./HomePresentation";
import { GuestHomeDiscussions } from "./GuestHomeDiscussions";
import {
  GUEST_HOME_COURSES_PER_SECTION,
  GUEST_HOME_DISCUSSION_COUNT,
} from "./guestHomeLimits";
import { useHomeTimeGreeting } from "./homeGreeting";
import "../styles/features/student-learning.css";
import "../styles/features/home.css";
import "../styles/features/guest-home.css";

// The full discussion cards belong to the discussions workspace. Only the
// signed-in variant shows them, so the guest home does not pay for that
// feature's code and styles.
const PopularDiscussionsPanel = lazy(() =>
  import("./PopularDiscussionsPanel").then((module) => ({
    default: module.PopularDiscussionsPanel,
  })),
);

export type DiscoveryHomeMode = "guest" | "authenticated";

interface DiscoveryHomeProps {
  mode: DiscoveryHomeMode;
  onNavigatePage: (destination: string) => void;
  studentName?: string;
  accessibleCourseIds?: ReadonlySet<string>;
  onDiscussionNavigatePage?: NavigateTo;
  onDiscussionAccessDenied?: () => void;
  initialDiscovery?: HomeDiscoveryResponse;
  initialPopularDiscussions?: PublicPopularDiscussion[];
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
  staticRow = false,
  prioritizeImages = true,
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
  /** A fixed grid of the given cards instead of the horizontal scroller. */
  staticRow?: boolean;
  /** Load the leading thumbnails eagerly; only the first section needs it. */
  prioritizeImages?: boolean;
}) {
  const sectionId =
    "guest-home-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (hideWhenEmpty && !isLoading && !isError && courses.length === 0) {
    return null;
  }

  const rowContent = isLoading ? (
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
        imagePriority={prioritizeImages && index < 2}
        publicAction={publicAction}
        onNavigatePage={onNavigatePage}
        studentHome
      />
    ))
  );

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
        {staticRow ? (
          <HomeStaticCourseRow
            id={sectionId + "-courses"}
            label={title}
            viewportClassName={courseCatalogueStaticRowClasses}
          >
            {rowContent}
          </HomeStaticCourseRow>
        ) : (
          <HomeCourseRow
            id={sectionId + "-courses"}
            label={title}
            isBusy={isLoading || isFetching}
            viewportClassName={courseCatalogueHorizontalRowClasses}
          >
            {rowContent}
          </HomeCourseRow>
        )}
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
  initialDiscovery,
  initialPopularDiscussions,
}: DiscoveryHomeProps) {
  // The guest home is a fixed page: a few courses per section in a plain
  // grid and a short discussion list. In the production build both come from
  // build-time data, so the whole page is prerendered and no request is made
  // here; without that data (the dev server) the same layout loads them.
  const isGuest = mode === "guest";
  const discoveryQuery = useHomeDiscovery({
    enabled: !(isGuest && initialDiscovery),
  });
  const discussionsQuery = usePopularDiscussions({
    enabled: !(isGuest && initialPopularDiscussions),
  });
  const discovery =
    isGuest && initialDiscovery ? initialDiscovery : discoveryQuery.data;
  const popularDiscussions =
    isGuest && initialPopularDiscussions
      ? initialPopularDiscussions
      : discussionsQuery.data?.discussions;
  const sectionCourses = (courses: readonly CourseSummary[] | undefined) =>
    isGuest
      ? (courses ?? []).slice(0, GUEST_HOME_COURSES_PER_SECTION)
      : (courses ?? []);
  const discussions = useMemo(
    () =>
      isGuest
        ? (popularDiscussions ?? []).slice(0, GUEST_HOME_DISCUSSION_COUNT)
        : (popularDiscussions ?? []),
    [isGuest, popularDiscussions],
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
            courses={sectionCourses(discovery?.popularCourses)}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Explore courses learners are enjoying right now."
            staticRow={isGuest}
          />
          <DiscoveryCourseSection
            title="Free Courses"
            courses={sectionCourses(discovery?.freeCourses)}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Start learning with courses available at no cost."
            staticRow={isGuest}
            prioritizeImages={!isGuest}
            viewAllLabel="Explore all"
            hideWhenEmpty
          />
          <DiscoveryCourseSection
            title="Recently Added"
            courses={sectionCourses(discovery?.recentCourses)}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={onNavigatePage}
            publicAction={mode === "authenticated" ? "enroll" : "view"}
            subtitle="Discover the latest courses added to the catalogue."
            staticRow={isGuest}
            prioritizeImages={!isGuest}
          />
        </div>

        <aside className="guest-home__discussion-column">
          {isGuest ? (
            <GuestHomeDiscussions
              className="guest-home__discussion-panel"
              discussions={discussions}
              onNavigatePage={onDiscussionNavigatePage}
            />
          ) : (
            <Suspense fallback={null}>
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
            </Suspense>
          )}
        </aside>
      </div>
    </main>
  );
}
