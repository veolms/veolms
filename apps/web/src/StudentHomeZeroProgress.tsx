import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type {
  CourseLesson,
  CourseOverviewResponse,
  CourseSummary,
  EnrolledCourse,
  RecentUpdateCourse,
} from "@veolms/contracts";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { formatDuration } from "./courses/courseAdapter";
import { getCourseThumbnailCdnUrl } from "./courses/courseMedia";
import { formatMediaTime } from "./learning/courseContent";
import { getCoursePlayerPath } from "./learning/coursePlayerNavigation";
import { useCourseOverview } from "./services/courses";
import { usePopularDiscussions } from "./services/learning-interactions";
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
import { formatRelativeTime } from "./learning/learning-notes.adapter";
import "./styles/features/student-learning.css";
import "./styles/features/home.css";
import "./styles/features/dashboard-discussion-preview.css";
import "./styles/features/guest-home.css";

function getTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareMostRecentlyEnrolled(
  left: EnrolledCourse,
  right: EnrolledCourse,
) {
  const leftTimestamp = getTimestamp(left.enrolledAt);
  const rightTimestamp = getTimestamp(right.enrolledAt);
  if (leftTimestamp !== null || rightTimestamp !== null) {
    if (leftTimestamp === null) return 1;
    if (rightTimestamp === null) return -1;
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
  }
  return left.courseId.localeCompare(right.courseId);
}

interface NumberedLesson extends CourseLesson {
  lessonNumber: number;
}

function getPublishedLessons(
  overview: CourseOverviewResponse | undefined,
): NumberedLesson[] {
  if (!overview) return [];

  let lessonNumber = 0;
  return overview.sections
    .slice()
    .sort(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id),
    )
    .flatMap((section) =>
      (section.lessons ?? [])
        .slice()
        .sort(
          (left, right) =>
            left.position - right.position || left.id.localeCompare(right.id),
        )
        .map((lesson) => {
          lessonNumber += 1;
          return { ...lesson, lessonNumber };
        }),
    )
    .filter((lesson) => lesson.isPublished);
}

function ZeroProgressHeader({ studentName }: { studentName?: string }) {
  const firstName = (studentName?.trim() || "there").split(/\s+/)[0] || "there";
  const timeGreeting = useHomeTimeGreeting();

  return (
    <header className="home-greeting-row">
      <div>
        <h1>
          {timeGreeting}, {firstName}{" "}
          <span className="home-wave" aria-hidden="true">
            👋
          </span>
        </h1>
        <p>Ready to begin your learning journey?</p>
      </div>
    </header>
  );
}

function UpNextPanel({
  courseKey,
  lessons,
  isLoading,
  isError,
  onRetry,
}: {
  courseKey: string;
  lessons: readonly NumberedLesson[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className="dashboard-panel student-home-zero-progress__up-next-panel min-w-0"
      aria-labelledby="up-next-title"
    >
      <HomeSectionHeader icon={BookOpen} title="Up Next" id="up-next-title" />
      {isLoading ? (
        <div className="mt-3 grid gap-2" role="status" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div
              className="h-12 animate-pulse rounded-lg bg-(--surface-strong)"
              key={item}
            />
          ))}
        </div>
      ) : isError ? (
        <div
          className="mt-3 rounded-lg border border-(--border) px-3 py-4 text-sm text-(--muted)"
          role="alert"
        >
          <p>Couldn&apos;t load this course curriculum.</p>
          <button
            type="button"
            className="mt-3 font-semibold text-(--accent-ink,var(--accent))"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : lessons.length === 0 ? (
        <p className="mt-3 rounded-lg border border-(--border) px-3 py-4 text-sm text-(--muted)">
          No published lessons are available yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {lessons.slice(0, 3).map((lesson) => (
            <a
              key={lesson.id}
              href={getCoursePlayerPath(
                courseKey,
                "home",
                lesson.lessonNumber,
                "/home",
              )}
              className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-(--border) bg-(--surface-strong) px-3 py-2.5 transition-colors hover:border-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <span className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-(--text)">
                  {lesson.title}
                </strong>
                {lesson.durationSeconds !== undefined ? (
                  <small className="mt-1 block text-xs text-(--muted)">
                    {formatMediaTime(lesson.durationSeconds)}
                  </small>
                ) : null}
              </span>
              <ArrowRight
                size={16}
                className="shrink-0 text-(--accent-ink,var(--accent)) transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export function StudentHomeZeroProgress({
  studentName,
  enrolledCourses,
  publishedCourses,
  publishedCoursesLoading,
  recentUpdateCourses,
  hasRecentUpdatesData,
  recentUpdatesLoading,
  recentUpdatesError,
  recentUpdatesFetching,
  refetchRecentUpdates,
  onNavigatePage,
  setNotice,
}: {
  studentName?: string;
  enrolledCourses: readonly EnrolledCourse[];
  publishedCourses: readonly CourseSummary[];
  publishedCoursesLoading: boolean;
  recentUpdateCourses: readonly RecentUpdateCourse[];
  hasRecentUpdatesData: boolean;
  recentUpdatesLoading: boolean;
  recentUpdatesError: boolean;
  recentUpdatesFetching: boolean;
  refetchRecentUpdates: () => Promise<unknown>;
  onNavigatePage: (destination: string) => void;
  setNotice?: (message: string) => void;
}) {
  const navigate = useNavigate();
  const primaryEnrollment = useMemo(
    () => enrolledCourses.slice().sort(compareMostRecentlyEnrolled)[0] ?? null,
    [enrolledCourses],
  );
  const courseKey =
    primaryEnrollment?.courseSlug || primaryEnrollment?.courseId || "";
  const overviewQuery = useCourseOverview(courseKey, {
    enabled: Boolean(courseKey),
  });
  const discussionsQuery = usePopularDiscussions();
  const lessons = useMemo(
    () => getPublishedLessons(overviewQuery.data),
    [overviewQuery.data],
  );
  const enrolledCourseKeys = useMemo(
    () => getEnrolledCourseKeys(enrolledCourses),
    [enrolledCourses],
  );
  const moreCourses = useMemo(
    () => getRecommendedCourses(publishedCourses, enrolledCourseKeys),
    [enrolledCourseKeys, publishedCourses],
  );
  const discussionList = discussionsQuery.data?.discussions ?? [];
  const overviewCourse = overviewQuery.data?.course;
  const viewCourseKey = overviewCourse?.slug || courseKey;
  const curriculumPath = `/courses/${encodeURIComponent(viewCourseKey)}/overview`;
  const firstLesson = lessons[0];
  const startPath = firstLesson
    ? getCoursePlayerPath(courseKey, "home", firstLesson.lessonNumber, "/home")
    : null;

  if (!primaryEnrollment) return null;

  return (
    <div className="student-home">
      <ZeroProgressHeader studentName={studentName} />

      <section
        className="home-resume-card student-home-zero-progress__hero"
        aria-labelledby="start-course-title"
      >
        <div className="grid min-w-0 items-center gap-4 lg:grid-cols-[clamp(220px,29%,320px)_minmax(0,1fr)_minmax(15rem,0.52fr)]">
          <div className="home-resume-visual student-home-zero-progress__hero-visual">
            <StudentHomeThumbnail
              src={primaryEnrollment.courseThumbnailUrl}
              fallbackSrcs={[
                getCourseThumbnailCdnUrl(
                  primaryEnrollment.courseThumbnailMediaId,
                ),
              ]}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="home-resume-copy student-home-zero-progress__hero-copy min-w-0 self-center">
            <span className="learning-status not-started student-home-zero-progress__hero-status">
              Start learning
            </span>
            <h2 id="start-course-title">{primaryEnrollment.courseTitle}</h2>
            <strong>
              {primaryEnrollment.totalSections} Sections <i />{" "}
              {primaryEnrollment.totalLessons} Lessons <i />{" "}
              {formatDuration(primaryEnrollment.totalDurationSeconds)}
            </strong>
            <small className="mt-2 text-xs text-(--muted)">
              Enrolled {formatRelativeTime(primaryEnrollment.enrolledAt)}
            </small>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="primary-learning-action !mt-0"
                disabled={!startPath || overviewQuery.isLoading}
                onClick={() => {
                  if (startPath) navigate(startPath);
                }}
              >
                <Play size={18} weight="fill" />
                Start Course
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-(--control-radius-action) border border-(--border) px-4 text-sm font-semibold text-(--text) hover:border-(--border-strong) hover:text-(--accent-ink,var(--accent)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                onClick={() => onNavigatePage(curriculumPath)}
              >
                <BookOpen size={18} aria-hidden="true" />
                View Curriculum
              </button>
            </div>
          </div>

          <UpNextPanel
            courseKey={courseKey}
            lessons={lessons}
            isLoading={overviewQuery.isLoading}
            isError={overviewQuery.isError}
            onRetry={() => void overviewQuery.refetch()}
          />
        </div>
      </section>

      <div className="home-dashboard-grid student-home-zero-progress__dashboard-grid">
        <div className="student-home-zero-progress__course-column grid min-w-0 gap-4">
          <MoreCoursesPanel
            courses={moreCourses}
            isLoading={publishedCoursesLoading}
            onNavigatePage={onNavigatePage}
          />
          <RecentUpdatesPanel
            courses={recentUpdateCourses.filter((course) =>
              enrolledCourseKeys.has(course.courseId),
            )}
            hasData={hasRecentUpdatesData}
            isLoading={recentUpdatesLoading}
            isError={recentUpdatesError}
            isFetching={recentUpdatesFetching}
            onRetry={() => void refetchRecentUpdates()}
            hideWhenEmpty
          />
        </div>
        <aside className="student-home-zero-progress__discussion-column min-w-0">
          <PopularDiscussionsPanel
            className="student-home-zero-progress__popular-discussions-panel"
            isLoading={discussionsQuery.isLoading}
            isError={discussionsQuery.isError}
            isFetching={discussionsQuery.isFetching}
            discussions={discussionList}
            onRetry={() => void discussionsQuery.refetch()}
            action="View Discussions"
            onAction={() => onNavigatePage("/discussions")}
            accessibleCourseIds={enrolledCourseKeys}
            onDiscussionNavigatePage={onNavigatePage}
            onDiscussionAccessDenied={() =>
              setNotice?.("You don't have access to this course.")
            }
          />
        </aside>
      </div>
    </div>
  );
}
