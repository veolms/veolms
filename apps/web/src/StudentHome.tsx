import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type {
  CourseSummary,
  EnrolledCoursesResponse,
  LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import { useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { CourseThumbnailPlaceholder } from "./courses/CourseThumbnailPlaceholder";
import { getCourseThumbnailCdnUrl } from "./courses/courseMedia";
import {
  adaptEnrolledCourseToLearningCourse,
  type LearningCourse,
} from "./StudentPages";
import { formatDuration } from "./courses/courseAdapter";
import { getCoursePlayerPath } from "./learning/coursePlayerNavigation";
import { courseCatalogueHorizontalRowClasses } from "./courses/CourseCatalogueSkeleton";
import { HomeCourseRow } from "./home/HomeCourseRow";
import { HomeEnrolledCourseCard } from "./home/HomeEnrolledCourseCard";
import { HomeSectionHeader } from "./home/HomePresentation";
import { useHomeTimeGreeting } from "./home/homeGreeting";
import {
  getEnrolledCourseKeys,
  getRecommendedCourses,
  MoreCoursesPanel,
} from "./home/MoreCoursesPanel";
import { PopularDiscussionsPanel } from "./home/PopularDiscussionsPanel";
import { RecentUpdatesPanel } from "./home/RecentUpdatesPanel";
import { StudentHomeThumbnail } from "./home/StudentHomeThumbnail";
import { useCourses } from "./services/courses";
import { useLearningProgressResumeContext } from "./services/learning-progress";
import { usePopularDiscussions } from "./services/learning-interactions";
import { useRecentLearningUpdates } from "./services/recent-updates";
import "./styles/features/student-learning.css";
import "./styles/features/home.css";
import "./styles/features/dashboard-discussion-preview.css";

interface StudentHomeProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  studentName?: string;
  enrollment: StudentHomeEnrollmentState;
}

export interface StudentHomeEnrollmentState {
  data: EnrolledCoursesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

function getCourseTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

const DEFAULT_PROGRESS_MESSAGE = "Ready to continue your learning journey?";

function getProgressedHomeMessage(
  context: LearningProgressResumeContextResponse | null | undefined,
) {
  if (
    !context ||
    !Number.isInteger(context.totalLessons) ||
    !Number.isInteger(context.completedLessons) ||
    context.totalLessons <= 0 ||
    context.completedLessons < 0 ||
    context.completedLessons > context.totalLessons ||
    !Array.isArray(context.upcomingLessons)
  ) {
    return DEFAULT_PROGRESS_MESSAGE;
  }

  if (context.completedLessons === context.totalLessons) {
    return "Great work — you've completed this course.";
  }

  if (!context.resumeLesson) return DEFAULT_PROGRESS_MESSAGE;

  if (context.upcomingLessons.length === 0) {
    return "One last lesson to go. Finish strong!";
  }

  if (
    context.upcomingLessons.length === 1 ||
    context.upcomingLessons.length === 2
  ) {
    return "You're almost there — keep going!";
  }

  return DEFAULT_PROGRESS_MESSAGE;
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

function compareZeroProgressCourses(
  left: LearningCourse,
  right: LearningCourse,
) {
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
  isRetrying = false,
  onRetry,
}: {
  isRetrying?: boolean;
  onRetry?: () => void;
}) {
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

function ResumeLessonContext({
  context,
  courseKey,
  onNavigate,
}: {
  context: LearningProgressResumeContextResponse;
  courseKey: string;
  onNavigate: (path: string) => void;
}) {
  const { resumeLesson, previousLesson } = context;
  if (!resumeLesson) return null;

  const lessonPath = (lessonNumber: number) =>
    getCoursePlayerPath(courseKey, "home", lessonNumber, "/home");

  return (
    <div className="home-resume-lesson-context">
      <a
        href={lessonPath(resumeLesson.lessonNumber)}
        className="home-resume-lesson-focus"
        aria-label={`Continue with lesson: ${resumeLesson.title}`}
      >
        <span>Continue With</span>
        <strong>{resumeLesson.title}</strong>
        <small>
          {resumeLesson.sectionTitle} · {resumeLesson.progressPercent}% complete
        </small>
      </a>
      {previousLesson && (
        <div className="home-resume-lesson-links">
          <button
            type="button"
            onClick={() => onNavigate(lessonPath(previousLesson.lessonNumber))}
            aria-label={`Previous lesson: ${previousLesson.title}`}
          >
            <span>Previous</span>
            <strong>{previousLesson.title}</strong>
          </button>
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

function ProgressedUpNextPanel({
  context,
  isLoading,
}: {
  context: LearningProgressResumeContextResponse | null | undefined;
  isLoading: boolean;
}) {
  const upcomingLessons = context?.upcomingLessons ?? [];
  const hasCompletedCourse =
    context !== undefined &&
    context !== null &&
    context.totalLessons > 0 &&
    context.completedLessons === context.totalLessons;
  const hasFinalIncompleteLesson =
    Boolean(context?.resumeLesson) &&
    upcomingLessons.length === 0 &&
    !hasCompletedCourse;

  if (
    !isLoading &&
    (!context ||
      context.totalLessons === 0 ||
      (!context.resumeLesson && !hasCompletedCourse))
  ) {
    return null;
  }

  return (
    <section
      className="dashboard-panel home-resume-up-next-panel min-w-0"
      aria-labelledby="progressed-up-next-title"
    >
      <HomeSectionHeader
        icon={BookOpen}
        title="Up Next"
        id="progressed-up-next-title"
      />
      {isLoading ? (
        <div className="mt-2 grid gap-1.5" role="status" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-12 animate-pulse rounded-lg bg-(--surface-strong)"
            />
          ))}
        </div>
      ) : hasCompletedCourse ? (
        <div className="mt-2 rounded-lg border border-(--border) px-2.5 py-2">
          <strong className="block text-xs font-semibold text-(--text)">
            Course completed
          </strong>
          <small className="mt-0.5 block text-[0.65rem] text-(--muted)">
            You&apos;ve completed every lesson in this course.
          </small>
        </div>
      ) : hasFinalIncompleteLesson ? (
        <div className="mt-2 rounded-lg border border-(--border) px-2.5 py-2">
          <strong className="block text-xs font-semibold text-(--text)">
            Final lesson
          </strong>
          <small className="mt-0.5 block text-[0.65rem] text-(--muted)">
            You&apos;re on the last lesson of this course.
          </small>
        </div>
      ) : context && upcomingLessons.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {upcomingLessons.slice(0, 3).map((lesson) => (
            <a
              key={lesson.lessonId}
              href={getCoursePlayerPath(
                context.courseSlug,
                "home",
                lesson.lessonNumber,
                "/home",
              )}
              className="group flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-lg border border-(--border) bg-(--surface-strong) px-2.5 py-2 transition-colors hover:border-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              aria-label={`Up next lesson: ${lesson.title}`}
            >
              <span className="min-w-0">
                <strong className="block truncate text-xs font-semibold text-(--text)">
                  {lesson.title}
                </strong>
                <small className="mt-0.5 block truncate text-[0.65rem] text-(--muted)">
                  {lesson.sectionTitle}
                </small>
              </span>
              <ArrowRight
                size={15}
                className="shrink-0 text-(--accent-ink,var(--accent)) transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      ) : null}
    </section>
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
  setNotice,
  studentName,
  enrollment,
}: StudentHomeProps) {
  const navigate = useNavigate();
  const goalCompletion = 72;
  const firstName =
    (studentName?.trim() || "Ashi Singh").split(/\s+/)[0] || "Ashi";
  const timeGreeting = useHomeTimeGreeting();

  const {
    data: enrolledData,
    isLoading: enrolledCoursesLoading,
    isError: enrolledCoursesError,
    isFetching: enrolledCoursesFetching,
    refetch: refetchEnrolledCourses,
  } = enrollment;
  const hasEnrolledCourseData = enrolledData !== undefined;
  const enrolledCourses = useMemo(() => {
    return (enrolledData?.courses || []).map((course) => ({
      ...adaptEnrolledCourseToLearningCourse(course),
      duration: formatDuration(course.totalDurationSeconds),
      thumbnailUrl:
        course.courseThumbnailUrl ||
        getCourseThumbnailCdnUrl(course.courseThumbnailMediaId),
      thumbnailMediaId: course.courseThumbnailMediaId,
    }));
  }, [enrolledData?.courses]);
  const accessibleCourseIds = useMemo(
    () =>
      new Set((enrolledData?.courses ?? []).map((course) => course.courseId)),
    [enrolledData?.courses],
  );

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

  const discussionsQuery = usePopularDiscussions();

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

  const completedCourses = useMemo(() => {
    return enrolledCourses
      .filter((course) => course.progress >= 100)
      .sort(compareContinueLearningCourses);
  }, [enrolledCourses]);

  const heroCourse = useMemo(() => {
    return continueLearningCourses[0] || completedCourses[0] || null;
  }, [completedCourses, continueLearningCourses]);
  const isCompletedHero = heroCourse ? heroCourse.progress >= 100 : false;

  const remainingEnrolledCourses = useMemo(() => {
    const heroCourseId = heroCourse?.id;
    const remainingProgressedCourses = continueLearningCourses.filter(
      (course) => course.id !== heroCourseId,
    );
    const zeroProgressCourses = enrolledCourses
      .filter((course) => course.id !== heroCourseId && course.progress === 0)
      .sort(compareZeroProgressCourses);

    return [...remainingProgressedCourses, ...zeroProgressCourses];
  }, [continueLearningCourses, enrolledCourses, heroCourse?.id]);

  const initialEnrollmentLoading =
    enrolledCoursesLoading && !hasEnrolledCourseData;
  const initialEnrollmentError = enrolledCoursesError && !hasEnrolledCourseData;
  const shouldLoadRecommendations =
    hasEnrolledCourseData && remainingEnrolledCourses.length < 2;
  const { data: publishedCoursesData, isLoading: publishedCoursesLoading } =
    useCourses({
      enabled: shouldLoadRecommendations,
    });
  const discoveryCourse = useMemo<CourseSummary | null>(
    () =>
      shouldLoadRecommendations
        ? null
        : (publishedCoursesData?.courses.at(-1) ?? null),
    [publishedCoursesData?.courses, shouldLoadRecommendations],
  );
  const enrolledCourseKeys = useMemo(
    () => getEnrolledCourseKeys(enrolledData?.courses ?? []),
    [enrolledData?.courses],
  );
  const moreCourses = useMemo(
    () =>
      getRecommendedCourses(
        publishedCoursesData?.courses ?? [],
        enrolledCourseKeys,
      ),
    [enrolledCourseKeys, publishedCoursesData?.courses],
  );
  const shouldRenderMoreCourses =
    shouldLoadRecommendations &&
    (publishedCoursesLoading || moreCourses.length > 0);
  const hasLearningSection =
    remainingEnrolledCourses.length >= 2 || shouldRenderMoreCourses;
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
  const secondaryGreeting = getProgressedHomeMessage(
    resumeContextLoading ? undefined : resumeContext,
  );

  return (
    <div className="student-home">
      <header className="home-greeting-row">
        <div>
          <h1>
            {timeGreeting}, {firstName}{" "}
            <span className="home-wave" aria-hidden="true">
              👋
            </span>
          </h1>
          <p>{secondaryGreeting}</p>
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
          <button
            type="button"
            className="home-goal-summary__info"
            aria-label="Streaks and goals coming soon"
            data-tooltip="Coming soon"
          >
            <Info size={14} weight="bold" aria-hidden="true" />
          </button>
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
          className="home-resume-card home-resume-card--progressed"
          aria-labelledby="home-hero-course-title"
        >
          <div className="home-resume-layout home-resume-layout--progressed">
            <div className="home-resume-visual home-resume-visual--16-9">
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
              <h2 id="home-hero-course-title">{heroCourse.title}</h2>
              <strong>
                {heroCourse.sections} Sections <i /> {heroCourse.lectures}{" "}
                Lectures <i /> {heroCourse.duration}
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
                {isCompletedHero ? (
                  <BookOpen size={18} weight="regular" />
                ) : (
                  <Play size={18} weight="fill" />
                )}
                {isCompletedHero ? "Review Course" : "Continue Learning"}
              </button>
            </div>
            <ProgressedUpNextPanel
              context={resumeContext}
              isLoading={resumeContextLoading}
            />
          </div>
        </section>
      ) : !shouldLoadRecommendations && publishedCoursesLoading ? (
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

      <div
        className={[
          "home-dashboard-grid student-home-progressed__dashboard-grid",
          !hasLearningSection &&
            "student-home-progressed__dashboard-grid--without-learning",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {initialEnrollmentLoading || initialEnrollmentError ? (
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
              ) : (
                <ContinueLearningState
                  isRetrying={enrolledCoursesFetching}
                  onRetry={() => void refetchEnrolledCourses()}
                />
              )}
            </div>
          </section>
        ) : remainingEnrolledCourses.length >= 2 ? (
          <section className="dashboard-panel home-continue-panel min-w-0">
            <HomeSectionHeader
              icon={BookOpen}
              title="Continue Learning"
              action="View All"
              onAction={() => onNavigatePage("courses")}
            />
            <div className="mt-2 min-w-0">
              <HomeCourseRow
                id="student-home-continue-learning"
                label="Continue Learning"
                isBusy={enrolledCoursesLoading || enrolledCoursesFetching}
                viewportClassName={courseCatalogueHorizontalRowClasses}
              >
                {remainingEnrolledCourses.map((course, index) => (
                  <HomeEnrolledCourseCard
                    key={course.id}
                    course={course}
                    imagePriority={index < 2}
                    onOpenCourse={onOpenCourse}
                  />
                ))}
              </HomeCourseRow>
            </div>
          </section>
        ) : shouldRenderMoreCourses ? (
          <MoreCoursesPanel
            id="student-home-progressed-more-courses"
            className="student-home-progressed__more-courses-panel"
            courses={moreCourses}
            isLoading={publishedCoursesLoading}
            onNavigatePage={onNavigatePage}
          />
        ) : null}

        <PopularDiscussionsPanel
          className="student-home-progressed__popular-discussions-panel"
          isLoading={discussionsQuery.isLoading}
          isError={discussionsQuery.isError}
          isFetching={discussionsQuery.isFetching}
          discussions={discussionsQuery.data?.discussions ?? []}
          onRetry={() => void discussionsQuery.refetch()}
          action="View Discussions"
          onAction={() => onNavigatePage("/discussions")}
          accessibleCourseIds={accessibleCourseIds}
          onDiscussionNavigatePage={onNavigatePage}
          onDiscussionAccessDenied={() =>
            setNotice?.("You don't have access to this course.")
          }
        />

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

        <RecentUpdatesPanel
          courses={recentUpdateCourses}
          title="Recently Updated"
          hasData={hasRecentUpdatesData}
          isLoading={recentUpdatesLoading}
          isError={recentUpdatesError}
          isFetching={recentUpdatesFetching}
          onRetry={() => void refetchRecentUpdates()}
          onNavigatePage={onNavigatePage}
        />
      </div>
    </div>
  );
}
