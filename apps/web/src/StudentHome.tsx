import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import { useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import javascriptThumbnail from "./assets/course-thumbnails/javascript-960.webp";
import nodeThumbnail from "./assets/course-thumbnails/nodejs-960.webp";
import typescriptThumbnail from "./assets/course-thumbnails/typescript-960.webp";
import typescriptInstructorHero800 from "./assets/learning-thumbnails/typescript-instructor-hero-800.webp";
import {
  adaptEnrolledCourseToLearningCourse,
  type LearningCourse,
} from "./StudentPages";
import { getCourseThumbnail } from "./learning/courseMetadata";
import { formatRelativeTime } from "./learning/learning-notes.adapter";
import { useEnrolledCourses } from "./services/enrollments";
import { useDashboardRecentDiscussions } from "./services/learning-interactions";
import { useRecentLearningUpdates } from "./services/recent-updates";
import { adaptDiscussionWorkspaceItem } from "./workspace/discussions-workspace.adapter";
import { DiscussionWorkspaceCard } from "./workspace/DiscussionsWorkspace";
import {
  DashboardDiscussionCardSkeletons,
  DashboardDiscussionRetryContent,
} from "./workspace/DashboardDiscussionPreview";

interface StudentHomeProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  studentName?: string;
}

interface SectionHeaderProps {
  icon: typeof BookOpen;
  title: string;
  action?: string;
  onAction?: () => void;
}

/*
// LEGACY CODE REFERENCE:
const legacyCurrentCourse: LearningCourse = {
  id: "typescript-course",
  title: "The Ultimate TypeScript Course",
  sections: 24,
  lectures: 160,
  status: "in-progress",
  progress: 52,
  lastLesson: "Conditional Types",
  accessed: "2h ago",
  thumbnail: typescriptThumbnail,
};

const legacyJavascriptCourse: LearningCourse = {
  id: "javascript-course",
  title: "The Complete JavaScript Course",
  sections: 20,
  lectures: 142,
  status: "in-progress",
  progress: 38,
  lastLesson: "Closures and the Event Loop",
  accessed: "4h ago",
  thumbnail: javascriptThumbnail,
};

const legacyBackendCourse: LearningCourse = {
  id: "backend-nodejs",
  title: "Complete Backend with Node.js",
  sections: 23,
  lectures: 600,
  status: "in-progress",
  progress: 76,
  lastLesson: "Error Handling in Express",
  accessed: "1d ago",
  thumbnail: nodeThumbnail,
};
*/

function getCourseTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareContinueLearningCourses(
  left: LearningCourse,
  right: LearningCourse,
) {
  const leftAccessedAt = getCourseTimestamp(left.lastAccessedAt);
  const rightAccessedAt = getCourseTimestamp(right.lastAccessedAt);

  if (leftAccessedAt !== null || rightAccessedAt !== null) {
    if (leftAccessedAt === null) return 1;
    if (rightAccessedAt === null) return -1;
    if (leftAccessedAt !== rightAccessedAt) {
      return rightAccessedAt - leftAccessedAt;
    }
  }

  const leftEnrolledAt = getCourseTimestamp(left.enrolledAt);
  const rightEnrolledAt = getCourseTimestamp(right.enrolledAt);
  if (leftEnrolledAt !== null || rightEnrolledAt !== null) {
    if (leftEnrolledAt === null) return 1;
    if (rightEnrolledAt === null) return -1;
    if (leftEnrolledAt !== rightEnrolledAt) {
      return rightEnrolledAt - leftEnrolledAt;
    }
  }

  return left.id.localeCompare(right.id);
}

function SectionHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: SectionHeaderProps) {
  return (
    <div className="dashboard-section-heading">
      <h2>
        <Icon size={19} weight="duotone" /> {title}
      </h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <span className="learning-progress-track" aria-hidden="true">
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

function RecentUpdatesSkeletons() {
  return (
    <>
      {[0, 1].map((item) => (
        <div className="home-update-skeleton" key={item} aria-hidden="true">
          <span />
          <span>
            <i />
            <i />
            <i />
          </span>
          <i />
        </div>
      ))}
    </>
  );
}

function RecentUpdatesState({
  error,
  isRetrying,
  onRetry,
}: {
  error?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="home-update-state" role="alert">
        <strong>Couldn&apos;t load recent updates</strong>
        <small>Something went wrong while loading course updates.</small>
        <button type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div className="home-update-state" role="status">
      <strong>No recent updates</strong>
      <small>New lesson updates from your enrolled courses will appear here.</small>
    </div>
  );
}

function ContinueLearningSkeletons() {
  return (
    <>
      {[0, 1].map((item) => (
        <article
          key={item}
          className="home-mini-course home-mini-course--skeleton"
          aria-hidden="true"
        >
          <span className="home-mini-course-skeleton__media" />
          <span className="home-mini-course-skeleton__copy">
            <i />
            <i />
          </span>
          <span className="home-mini-course-skeleton__progress">
            <i />
            <i />
          </span>
          <span className="home-mini-course-skeleton__button" />
        </article>
      ))}
    </>
  );
}

function ContinueLearningState({
  error = false,
  hasHeroCourse = false,
  isRetrying = false,
  onBrowse,
  onRetry,
}: {
  error?: boolean;
  hasHeroCourse?: boolean;
  isRetrying?: boolean;
  onBrowse?: () => void;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="home-continue-state" role="alert">
        <strong>Couldn&apos;t load your courses</strong>
        <small>Something went wrong while loading your learning courses.</small>
        <button type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div className="home-continue-state" role="status">
      <strong>
        {hasHeroCourse ? "Nothing else to continue yet" : "Nothing to continue yet"}
      </strong>
      <small>
        {hasHeroCourse
          ? "Keep going with the highlighted course above."
          : "Start a course and your learning progress will appear here."}
      </small>
      {!hasHeroCourse && onBrowse ? (
        <button type="button" onClick={onBrowse}>
          Browse courses
        </button>
      ) : null}
    </div>
  );
}

function ProgressMetricSkeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((item) => (
        <article
          key={item}
          className="home-metric home-metric-skeleton"
          aria-hidden="true"
        >
          <div className="home-metric__lead">
            <span />
            <i className="home-metric-skeleton__value" />
          </div>
          <i className="home-metric-skeleton__label" />
        </article>
      ))}
    </>
  );
}

export function StudentHome({
  onOpenCourse,
  onNavigatePage,
  studentName,
}: StudentHomeProps) {
  const navigate = useNavigate();
  const goalCompletion = 72;
  const firstName =
    (studentName?.trim() || "Ashi Singh").split(/\s+/)[0] || "Ashi";

  const {
    data: enrolledData,
    isLoading: enrolledCoursesLoading,
    isError: enrolledCoursesError,
    isFetching: enrolledCoursesFetching,
    refetch: refetchEnrolledCourses,
  } = useEnrolledCourses();
  const hasEnrolledCourseData = enrolledData !== undefined;
  const enrolledCourses = useMemo(() => {
    return (enrolledData?.courses || []).map(adaptEnrolledCourseToLearningCourse);
  }, [enrolledData?.courses]);

  const progressMetrics = useMemo(() => {
    const courses = enrolledData?.courses ?? [];
    const progressValues = courses.map((course) => course.progress ?? 0);
    const totalProgress = progressValues.reduce(
      (total, progress) => total + progress,
      0,
    );

    return [
      {
        value: String(courses.length),
        label: "Active Courses",
        icon: BookOpen,
        tone: "violet",
      },
      {
        value: String(
          progressValues.filter((progress) => progress > 0 && progress < 100)
            .length,
        ),
        label: "Courses in Progress",
        icon: ChartLineUp,
        tone: "cyan",
      },
      {
        value: String(progressValues.filter((progress) => progress >= 100).length),
        label: "Courses Completed",
        icon: CheckCircle,
        tone: "green",
      },
      {
        value: `${courses.length > 0 ? Math.round(totalProgress / courses.length) : 0}%`,
        label: "Average Course Progress",
        icon: ChartBar,
        tone: "gold",
      },
    ] as const;
  }, [enrolledData?.courses]);

  const {
    data: discussionsResponse,
    isLoading: discussionsLoading,
    isError: discussionsError,
    isFetching: discussionsFetching,
    refetch: refetchDiscussions,
  } = useDashboardRecentDiscussions({ mine: true });
  const hasDiscussionData = discussionsResponse !== undefined;
  const discussionCards = useMemo(
    () =>
      discussionsResponse?.items.map((item) => adaptDiscussionWorkspaceItem(item)) ??
      [],
    [discussionsResponse?.items],
  );

  const {
    data: recentUpdatesResponse,
    isLoading: recentUpdatesLoading,
    isError: recentUpdatesError,
    isFetching: recentUpdatesFetching,
    refetch: refetchRecentUpdates,
  } = useRecentLearningUpdates();
  const hasRecentUpdatesData = recentUpdatesResponse !== undefined;
  const recentUpdateCourses = recentUpdatesResponse?.courses ?? [];

  const continueLearningCourses = useMemo(() => {
    return enrolledCourses
      .filter((course) => course.progress > 0 && course.progress < 100)
      .sort(compareContinueLearningCourses);
  }, [enrolledCourses]);

  const heroCourse = useMemo(() => {
    return continueLearningCourses[0] || null;
  }, [continueLearningCourses]);

  const miniCourses = useMemo(() => {
    return continueLearningCourses.slice(1, 3);
  }, [continueLearningCourses]);
  const initialEnrollmentLoading =
    enrolledCoursesLoading && !hasEnrolledCourseData;
  const initialEnrollmentError =
    enrolledCoursesError && !hasEnrolledCourseData;

  return (
    <div className="student-home">
      <header className="home-greeting-row">
        <div>
          <h1>
            Good evening, {firstName}{" "}
            <span className="home-wave" aria-hidden="true">
              👋
            </span>
          </h1>
          <p>Ready to continue your learning journey?</p>
        </div>
        <div
          className="home-goal-summary"
          aria-label={`7 day streak and 2.1 of 3 learning hours completed today (${goalCompletion}% complete)`}
        >
          <div>
            <Fire size={33} weight="fill" />
            <span>
              <strong>7</strong>
              <small>Day Streak</small>
            </span>
          </div>
          <div>
            <span>
              <small>Today&apos;s Goal</small>
              <strong>2.1 / 3 hrs</strong>
            </span>
            <i
              className="home-goal-ring"
              style={
                { "--goal-progress": `${goalCompletion}%` } as CSSProperties
              }
              aria-hidden="true"
            >
              <span>{goalCompletion}%</span>
            </i>
          </div>
        </div>
      </header>

      {initialEnrollmentLoading ? (
        <section className="home-resume-card home-resume-card--state">
          <div className="home-resume-state" role="status" aria-busy="true">
            <strong>Loading your courses…</strong>
            <small>Preparing your Continue Learning view.</small>
          </div>
        </section>
      ) : initialEnrollmentError ? (
        <section className="home-resume-card home-resume-card--state">
          <div className="home-resume-state" role="alert">
            <strong>Couldn&apos;t load your courses</strong>
            <small>Something went wrong while loading your learning courses.</small>
            <button
              type="button"
              onClick={() => void refetchEnrolledCourses()}
              disabled={enrolledCoursesFetching}
            >
              {enrolledCoursesFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        </section>
      ) : heroCourse ? (
        <section
          className="home-resume-card"
          aria-labelledby="continue-learning-title"
        >
          <div className="home-resume-layout">
            <div className="home-resume-visual">
              <img
                src={heroCourse.thumbnail}
                alt=""
                loading="eager"
                decoding="async"
              />
            </div>
            <div className="home-resume-copy">
              <span className="learning-status in-progress">In Progress</span>
              <h2 id="continue-learning-title">{heroCourse.title}</h2>
              <strong>
                {heroCourse.sections} Sections <i /> {heroCourse.lectures} Lectures
              </strong>
              <p>
                {heroCourse.enrolledOn
                  ? `Enrolled on ${heroCourse.enrolledOn}`
                  : "Ready to continue"}
              </p>
              <div className="home-resume-progress">
                <ProgressBar value={heroCourse.progress} />
                <span>{heroCourse.progress}%</span>
              </div>
              <button
                type="button"
                className="primary-learning-action"
                onClick={() => onOpenCourse(heroCourse)}
              >
                <Play size={18} weight="fill" /> Continue Learning
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="home-resume-card"
          aria-labelledby="explore-courses-title"
        >
          <div className="home-resume-layout">
            <div className="home-resume-visual">
              <img
                src={typescriptInstructorHero800}
                alt="Course explore"
                width={1600}
                height={900}
                decoding="sync"
                fetchPriority="high"
              />
            </div>
            <div className="home-resume-copy">
              <span className="learning-status in-progress">Start Learning</span>
              <h2 id="explore-courses-title">Discover Top Courses</h2>
              <p>Explore our library and enroll in courses to begin your journey.</p>
              <button
                type="button"
                className="primary-learning-action mt-4"
                onClick={() => onNavigatePage("courses")}
              >
                <BookOpen size={18} weight="fill" /> Browse Course Catalogue
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="home-dashboard-grid">
        <section className="dashboard-panel home-continue-panel">
          <SectionHeader
            icon={BookOpen}
            title="Continue Learning"
            action="View All"
            onAction={() => onNavigatePage("courses")}
          />
          <div
            className="home-mini-course-grid"
            aria-busy={enrolledCoursesLoading || enrolledCoursesFetching}
          >
            {initialEnrollmentLoading ? (
              <ContinueLearningSkeletons />
            ) : initialEnrollmentError ? (
              <ContinueLearningState
                error
                isRetrying={enrolledCoursesFetching}
                onRetry={() => void refetchEnrolledCourses()}
              />
            ) : miniCourses.length > 0 ? (
              miniCourses.map((course) => (
                <article key={course.id} className="home-mini-course">
                  <img
                    src={course.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <div>
                    <h3>{course.title}</h3>
                    <p>
                      {course.sections} Sections · {course.lectures} Lectures
                    </p>
                  </div>
                  <div className="home-mini-progress">
                    <ProgressBar value={course.progress} />
                    <span>{course.progress}%</span>
                  </div>
                  <button
                    type="button"
                    className="primary-learning-action home-mini-action"
                    onClick={() => onOpenCourse(course)}
                  >
                    <Play size={16} weight="fill" />
                    <span>Continue Learning</span>
                  </button>
                </article>
              ))
            ) : (
              <ContinueLearningState
                hasHeroCourse={Boolean(heroCourse)}
                onBrowse={() => onNavigatePage("courses")}
              />
            )}
          </div>
        </section>

        <section className="dashboard-panel home-discussions-panel">
          <SectionHeader
            icon={ChatCircleDots}
            title="Recent Discussions"
            action="View All"
            onAction={() => onNavigatePage("discussions")}
          />
          <div
            className="home-discussion-workspace-list creator-discussion-list discussion-hub"
            data-dashboard-discussion-preview
            aria-busy={discussionsLoading || discussionsFetching}
          >
            {discussionsLoading && !hasDiscussionData ? (
              <DashboardDiscussionCardSkeletons />
            ) : discussionsError && !hasDiscussionData ? (
              <div className="creator-discussion-state" role="alert">
                <DashboardDiscussionRetryContent
                  title="Couldn't load discussions"
                  message="Something went wrong while loading your discussions."
                  isRetrying={discussionsFetching}
                  onRetry={() => void refetchDiscussions()}
                />
              </div>
            ) : discussionCards.length === 0 ? (
              <div className="creator-discussion-state" role="status">
                <strong>No discussions yet</strong>
                <small>Questions and comments you create while learning will appear here.</small>
              </div>
            ) : (
              discussionCards.map((item) => (
                <DiscussionWorkspaceCard
                  key={`${item.itemType}:${item.id}`}
                  card={item}
                  onNavigatePage={onNavigatePage}
                  variant="compact"
                  expandable={false}
                />
              ))
            )}
          </div>
        </section>

        <section className="dashboard-panel home-progress-panel">
          <SectionHeader
            icon={ChartLineUp}
            title="Your Progress"
          />
          <div
            className="home-metrics-grid"
            aria-busy={enrolledCoursesLoading || enrolledCoursesFetching}
          >
            {enrolledCoursesLoading && !hasEnrolledCourseData ? (
              <ProgressMetricSkeletons />
            ) : enrolledCoursesError && !hasEnrolledCourseData ? (
              <div className="home-progress-state" role="alert">
                <strong>Couldn&apos;t load your progress</strong>
                <small>Something went wrong while loading enrolled courses.</small>
                <button
                  type="button"
                  onClick={() => void refetchEnrolledCourses()}
                  disabled={enrolledCoursesFetching}
                >
                  {enrolledCoursesFetching ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : (
              progressMetrics.map(({ value, label, icon: Icon, tone }) => (
                <article key={label} className={`home-metric tone-${tone}`}>
                  <div className="home-metric__lead">
                    <span>
                      <Icon size={20} weight="duotone" aria-hidden="true" />
                    </span>
                    <strong>{value}</strong>
                  </div>
                  <p>{label}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="dashboard-panel home-updates-panel">
          <SectionHeader
            icon={Target}
            title="Recently Updated"
            action="View All"
            onAction={() => onNavigatePage("courses")}
          />
          <div
            className="home-update-list"
            aria-busy={recentUpdatesLoading || recentUpdatesFetching}
          >
            {recentUpdatesLoading && !hasRecentUpdatesData ? (
              <RecentUpdatesSkeletons />
            ) : recentUpdatesError && !hasRecentUpdatesData ? (
              <RecentUpdatesState
                error
                isRetrying={recentUpdatesFetching}
                onRetry={() => void refetchRecentUpdates()}
              />
            ) : recentUpdateCourses.length === 0 ? (
              <RecentUpdatesState />
            ) : (
              recentUpdateCourses.map((course) => (
                <button
                  type="button"
                  key={course.courseId}
                  onClick={() =>
                    navigate(
                      `/courses/${encodeURIComponent(course.courseSlug)}/overview`,
                    )
                  }
                >
                  <img
                    src={
                      course.courseThumbnailUrl ||
                      getCourseThumbnail(course.courseSlug)
                    }
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    <strong>{course.courseTitle}</strong>
                    <small>
                      {course.recentLessonCount} recent lesson
                      {course.recentLessonCount === 1 ? "" : "s"} · Updated{" "}
                      {formatRelativeTime(course.latestUpdatedAt)}
                    </small>
                    {course.lessons.slice(0, 2).map((lesson) => (
                      <em key={lesson.lessonId}>{lesson.lessonTitle}</em>
                    ))}
                  </span>
                  <i aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
