import type { CourseSummary, PublicPopularDiscussion } from "@veolms/contracts";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { PublicCourseCard } from "./courses/CourseCard";
import { CourseCardSkeleton } from "./courses/CourseCardSkeleton";
import { courseCatalogueHorizontalRowClasses } from "./courses/CourseCatalogueSkeleton";
import { adaptCourseSummaryToCatalogueCourse } from "./courses/courseAdapter";
import { HomeCourseRow } from "./home/HomeCourseRow";
import { HomeSectionHeader } from "./home/HomePresentation";
import { useHomeDiscovery } from "./services/home";
import { usePopularDiscussions } from "./services/learning-interactions";
import { PublicDiscussionWorkspaceCard } from "./workspace/DiscussionsWorkspace";
import { DashboardDiscussionCardSkeletons } from "./workspace/DashboardDiscussionPreview";
import "./styles/features/student-learning.css";
import "./styles/features/home.css";
import "./styles/features/guest-home.css";

const HOME_DISCUSSION_LIMIT = 20;

function GuestHomeState({
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

function GuestCourseSection({
  title,
  courses,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onNavigatePage,
  viewAllLabel = "View all",
}: {
  title: string;
  courses: readonly CourseSummary[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onNavigatePage: (destination: string) => void;
  viewAllLabel?: string;
}) {
  const sectionId =
    "guest-home-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <section
      className="dashboard-panel home-continue-panel guest-home__course-section"
      aria-labelledby={sectionId}
    >
      <HomeSectionHeader
        icon={BookOpen}
        title={title}
        id={sectionId}
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
            <GuestHomeState
              title="Courses are unavailable right now"
              message="We couldn't load this discovery section."
              onRetry={onRetry}
              isRetrying={isFetching}
            />
          ) : courses.length === 0 ? (
            <GuestHomeState
              title={"No " + title.toLowerCase() + " yet"}
              message="Check back soon for more courses to explore."
            />
          ) : (
            courses.map((course, index) => (
              <PublicCourseCard
                key={course.id}
                course={adaptCourseSummaryToCatalogueCourse(course)}
                imagePriority={index < 2}
                onNavigatePage={onNavigatePage}
              />
            ))
          )}
        </HomeCourseRow>
      </div>
    </section>
  );
}

function PopularDiscussionsPanel({
  isLoading,
  isError,
  isFetching,
  discussions,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  discussions: readonly PublicPopularDiscussion[];
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="guest-home-popular-discussions"
      className="dashboard-panel home-discussions-panel guest-home__discussion-panel"
    >
      <HomeSectionHeader
        icon={ChatCircleDots}
        title="Popular Discussions"
        id="guest-home-popular-discussions"
      />

      {isLoading ? (
        <DashboardDiscussionCardSkeletons />
      ) : isError ? (
        <GuestHomeState
          title="Discussions are unavailable"
          message="Courses are still available to explore."
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : discussions.length === 0 ? (
        <GuestHomeState
          title="No public discussions yet"
          message="Check back soon for learner conversations."
        />
      ) : (
        <div
          className="home-discussion-workspace-list creator-discussion-list discussion-hub"
          data-dashboard-discussion-preview
        >
          {discussions.slice(0, HOME_DISCUSSION_LIMIT).map((discussion) => (
            <PublicDiscussionWorkspaceCard
              key={discussion.id}
              discussion={discussion}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function GuestHome() {
  const discoveryQuery = useHomeDiscovery();
  const discussionsQuery = usePopularDiscussions();
  const navigate = useNavigate();
  const discovery = discoveryQuery.data;
  const discussions = useMemo(
    () => discussionsQuery.data?.discussions ?? [],
    [discussionsQuery.data?.discussions],
  );

  return (
    <main className="student-home guest-home">
      <header className="home-greeting-row guest-home__greeting">
        <div>
          <h1>
            Start learning <span aria-hidden="true">👋</span>
          </h1>
          <p>
            Explore popular courses, start something for free, or discover
            something new.
          </p>
        </div>
      </header>

      <div className="home-dashboard-grid guest-home__layout">
        <div className="guest-home__course-column">
          <GuestCourseSection
            title="Popular Courses"
            courses={discovery?.popularCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={(destination) => navigate(destination)}
          />
          <GuestCourseSection
            title="Free Courses"
            courses={discovery?.freeCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={(destination) => navigate(destination)}
            viewAllLabel="Explore all"
          />
          <GuestCourseSection
            title="Recently Added"
            courses={discovery?.recentCourses ?? []}
            isLoading={discoveryQuery.isLoading}
            isError={discoveryQuery.isError}
            isFetching={discoveryQuery.isFetching}
            onRetry={() => void discoveryQuery.refetch()}
            onNavigatePage={(destination) => navigate(destination)}
          />
        </div>

        <aside className="guest-home__discussion-column">
          <PopularDiscussionsPanel
            isLoading={discussionsQuery.isLoading}
            isError={discussionsQuery.isError}
            isFetching={discussionsQuery.isFetching}
            discussions={discussions}
            onRetry={() => void discussionsQuery.refetch()}
          />
        </aside>
      </div>
    </main>
  );
}
