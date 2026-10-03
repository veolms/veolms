import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type {
  CourseSummary,
  LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from "react";
import { useNavigate } from "react-router";
import { CourseThumbnailPlaceholder } from "./courses/CourseThumbnailPlaceholder";
import { getCourseThumbnailCdnUrl } from "./courses/courseMedia";
import {
  adaptEnrolledCourseToLearningCourse,
  type LearningCourse,
} from "./StudentPages";
import { getCoursePlayerPath } from "./learning/coursePlayerNavigation";
import { formatRelativeTime } from "./learning/learning-notes.adapter";
import { HomeSectionHeader } from "./home/HomePresentation";
import { useCourses } from "./services/courses";
import { useEnrolledCourses } from "./services/enrollments";
import { useLearningProgressResumeContext } from "./services/learning-progress";
import { useDashboardRecentDiscussions } from "./services/learning-interactions";
import { useRecentLearningUpdates } from "./services/recent-updates";
import { adaptDiscussionWorkspaceItem } from "./workspace/discussions-workspace.adapter";
import { DiscussionWorkspaceCard } from "./workspace/DiscussionsWorkspace";
import {
  DashboardDiscussionCardSkeletons,
  DashboardDiscussionRetryContent,
} from "./workspace/DashboardDiscussionPreview";
import "./styles/features/student-learning.css";
import "./styles/features/home.css";
import "./styles/features/dashboard-discussion-preview.css";

interface StudentHomeProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  studentName?: string;
}

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

function StudentHomeThumbnail({
  src,
  fallbackSrcs = [],
  alt,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
}: {
  src?: string | null;
  fallbackSrcs?: readonly (string | null | undefined)[];
  alt: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
}) {
  const imageSources = [src, ...fallbackSrcs]
    .map((candidate) => candidate?.trim() ?? "")
    .filter((candidate, index, candidates) =>
      candidate ? candidates.indexOf(candidate) === index : false,
    );
  const imageSourcesKey = imageSources.join("\u0000");
  const [imageSourceIndex, setImageSourceIndex] = useState(0);

  useEffect(() => {
    setImageSourceIndex(0);
  }, [imageSourcesKey]);

  const imageSrc = imageSources[imageSourceIndex] ?? "";

  return (
    <div className="student-home-thumbnail">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={alt}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onError={() =>
            setImageSourceIndex((current) =>
              Math.min(current + 1, imageSources.length),
            )
          }
        />
      ) : (
        <CourseThumbnailPlaceholder />
      )}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const normalizedValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0;

  return (
    <span
      className="learning-progress-track"
      role="progressbar"
      aria-label="Course progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedValue}
    >
      <span style={{ width: `${normalizedValue}%` }} />
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
      <small>
        New lesson updates from your enrolled courses will appear here.
      </small>
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
  isRetrying = false,
  onRetry,
}: {
  error?: boolean;
  isRetrying?: boolean;
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
      <strong>You&apos;re all caught up here</strong>
      <small>
        Your other courses will appear here as you start making progress.
      </small>
    </div>
  );
}

function ResumeLessonContext({
  context,
  courseKey,
  onNavigate,
}: {
  context: LearningProgressResumeContextResponse;
  courseKey: string;
  onNavigate: (path: string) => void;
}) {
  const { resumeLesson, previousLesson, nextLesson } = context;
  if (!resumeLesson) return null;

  const lessonPath = (lessonNumber: number) =>
    getCoursePlayerPath(courseKey, "home", lessonNumber, "/home");

  return (
    <div className="home-resume-lesson-context">
      <div className="home-resume-lesson-focus">
        <span>Continue With</span>
        <strong>{resumeLesson.title}</strong>
        <small>
          {resumeLesson.sectionTitle} · {resumeLesson.progressPercent}% complete
        </small>
      </div>
      {(previousLesson || nextLesson) && (
        <div className="home-resume-lesson-links">
          {previousLesson && (
            <button
              type="button"
              onClick={() =>
                onNavigate(lessonPath(previousLesson.lessonNumber))
              }
              aria-label={`Previous lesson: ${previousLesson.title}`}
            >
              <span>Previous</span>
              <strong>{previousLesson.title}</strong>
            </button>
          )}
          {nextLesson && (
            <button
              type="button"
              onClick={() => onNavigate(lessonPath(nextLesson.lessonNumber))}
              aria-label={`Up next lesson: ${nextLesson.title}`}
            >
              <span>Up Next</span>
              <strong>{nextLesson.title}</strong>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResumeLessonContextSkeleton() {
  return (
    <div
      className="home-resume-lesson-context home-resume-lesson-context--skeleton"
      role="status"
      aria-busy="true"
    >
      <span>Continue With</span>
      <i />
      <i />
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
    return (enrolledData?.courses || []).map((course) => ({
      ...adaptEnrolledCourseToLearningCourse(course),
      thumbnailUrl:
        course.courseThumbnailUrl ||
        getCourseThumbnailCdnUrl(course.courseThumbnailMediaId),
      thumbnailMediaId: course.courseThumbnailMediaId,
    }));
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
        label: "In Progress",
        icon: ChartLineUp,
        tone: "cyan",
      },
      {
        value: String(
          progressValues.filter((progress) => progress >= 100).length,
        ),
        label: "Completed",
        icon: CheckCircle,
        tone: "green",
      },
      {
        value: `${courses.length > 0 ? Math.round(totalProgress / courses.length) : 0}%`,
        label: "Avg. Progress",
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
      discussionsResponse?.items.map((item) =>
        adaptDiscussionWorkspaceItem(item),
      ) ?? [],
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
  const initialEnrollmentError = enrolledCoursesError && !hasEnrolledCourseData;
  const hasMeaningfulLearningProgress = enrolledCourses.some(
    (course) => course.progress > 0,
  );
  const { data: publishedCoursesData, isLoading: publishedCoursesLoading } =
    useCourses({
      enabled:
        hasEnrolledCourseData &&
        !initialEnrollmentError &&
        !hasMeaningfulLearningProgress,
    });
  const discoveryCourse = useMemo<CourseSummary | null>(
    () => publishedCoursesData?.courses.at(-1) ?? null,
    [publishedCoursesData?.courses],
  );
  const primaryCourseKey = heroCourse?.slug ?? heroCourse?.id;
  const { data: resumeContextData, isLoading: resumeContextLoading } =
    useLearningProgressResumeContext(primaryCourseKey, {
      enabled: hasEnrolledCourseData && Boolean(heroCourse),
    });
  const resumeContext = useMemo(() => {
    if (!heroCourse || !primaryCourseKey || !resumeContextData) return null;
    return resumeContextData.courseId === heroCourse.id ||
      resumeContextData.courseSlug === primaryCourseKey
      ? resumeContextData
      : null;
  }, [heroCourse, primaryCourseKey, resumeContextData]);

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
            <small>
              Something went wrong while loading your learning courses.
            </small>
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
              <StudentHomeThumbnail
                src={heroCourse.thumbnailUrl}
                fallbackSrcs={[
                  getCourseThumbnailCdnUrl(heroCourse.thumbnailMediaId),
                ]}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </div>
            <div className="home-resume-copy">
              <span className="learning-status in-progress">
                Continue Learning
              </span>
              <h2 id="continue-learning-title">{heroCourse.title}</h2>
              <strong>
                {heroCourse.sections} Sections <i /> {heroCourse.lectures}{" "}
                Lectures
              </strong>
              <p>
                {heroCourse.enrolledOn
                  ? `Enrolled on ${heroCourse.enrolledOn}`
                  : "Ready to continue"}
              </p>
              {heroCourse && primaryCourseKey && resumeContext ? (
                <ResumeLessonContext
                  context={resumeContext}
                  courseKey={resumeContext.courseSlug}
                  onNavigate={navigate}
                />
              ) : heroCourse && resumeContextLoading ? (
                <ResumeLessonContextSkeleton />
              ) : null}
              <div className="home-resume-progress">
                <ProgressBar value={heroCourse.progress} />
                <span aria-hidden="true">{heroCourse.progress}%</span>
              </div>
              <button
                type="button"
                className="primary-learning-action"
                onClick={() => onOpenCourse(heroCourse)}
              >
                <Play size={18} weight="fill" />
                Continue Learning
              </button>
            </div>
          </div>
        </section>
      ) : publishedCoursesLoading ? (
        <section className="home-resume-card home-resume-card--state">
          <div className="home-resume-state" role="status" aria-busy="true">
            <strong>Loading courses to explore…</strong>
            <small>Preparing a course for you to discover.</small>
          </div>
        </section>
      ) : discoveryCourse ? (
        <section
          className="home-resume-card home-resume-card--ready"
          aria-labelledby="explore-course-title"
        >
          <div className="home-resume-layout">
            <div className="home-resume-visual">
              <StudentHomeThumbnail
                src={discoveryCourse.thumbnailUrl}
                alt=""
                loading="eager"
                decoding="async"
              />
            </div>
            <div className="home-resume-copy">
              <span className="learning-status not-started">
                Explore courses
              </span>
              <h2 id="explore-course-title">{discoveryCourse.title}</h2>
              <strong>
                {discoveryCourse.totalSections} Sections <i />{" "}
                {discoveryCourse.totalLessons} Lessons
              </strong>
              <p>
                {discoveryCourse.shortDescription ||
                  "Explore this course and start learning whenever you are ready."}
              </p>
              <button
                type="button"
                className="primary-learning-action"
                onClick={() =>
                  onNavigatePage(
                    "/explore-courses/" +
                      encodeURIComponent(discoveryCourse.slug),
                  )
                }
              >
                <BookOpen size={18} weight="fill" /> View Course
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
              <CourseThumbnailPlaceholder />
            </div>
            <div className="home-resume-copy">
              <span className="learning-status not-started">
                Explore courses
              </span>
              <h2 id="explore-courses-title">What will you learn next?</h2>
              <p>
                Explore courses and find something you&apos;d like to learn
                next.
              </p>
              <button
                type="button"
                className="primary-learning-action mt-4"
                onClick={() => onNavigatePage("courses")}
              >
                <BookOpen size={18} weight="fill" /> Explore courses
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="home-dashboard-grid">
        <section className="dashboard-panel home-continue-panel">
          <HomeSectionHeader
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
                  <StudentHomeThumbnail
                    src={course.thumbnailUrl}
                    fallbackSrcs={[
                      getCourseThumbnailCdnUrl(course.thumbnailMediaId),
                    ]}
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
                    <span aria-hidden="true">{course.progress}%</span>
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
              <ContinueLearningState />
            )}
          </div>
        </section>

        <section className="dashboard-panel home-discussions-panel">
          <HomeSectionHeader
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
                <small>
                  Questions and comments you create while learning will appear
                  here.
                </small>
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
          <HomeSectionHeader icon={ChartLineUp} title="Your Progress" />
          <div
            className="home-metrics-grid"
            aria-busy={enrolledCoursesLoading || enrolledCoursesFetching}
          >
            {enrolledCoursesLoading && !hasEnrolledCourseData ? (
              <ProgressMetricSkeletons />
            ) : enrolledCoursesError && !hasEnrolledCourseData ? (
              <div className="home-progress-state" role="alert">
                <strong>Couldn&apos;t load your progress</strong>
                <small>
                  Something went wrong while loading enrolled courses.
                </small>
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
          <HomeSectionHeader
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
              recentUpdateCourses.map((course) => {
                return (
                  <div className="home-update-course" key={course.courseId}>
                    <div className="home-update-course-header">
                      <StudentHomeThumbnail
                        src={course.courseThumbnailUrl}
                        fallbackSrcs={[
                          getCourseThumbnailCdnUrl(
                            course.courseThumbnailMediaId,
                          ),
                        ]}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span>
                        <strong>{course.courseTitle}</strong>
                        <small>
                          Updated {formatRelativeTime(course.latestUpdatedAt)}
                        </small>
                      </span>
                    </div>
                    {course.lessons.length > 0 && (
                      <div className="home-update-lessons">
                        {course.lessons.map((lesson) => (
                          <button
                            type="button"
                            className="home-update-lesson"
                            key={lesson.lessonId}
                            onClick={() =>
                              navigate(
                                getCoursePlayerPath(
                                  course.courseSlug,
                                  "home",
                                  lesson.lessonNumber,
                                  "/home",
                                ),
                              )
                            }
                          >
                            <span>{lesson.lessonTitle}</span>
                            <ArrowRight size={15} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
