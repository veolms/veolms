import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type { RecentUpdateCourse } from "@veolms/contracts";
import { useNavigate } from "react-router";
import { getCourseThumbnailCdnUrl } from "../courses/courseMedia";
import { getCoursePlayerPath } from "../learning/coursePlayerNavigation";
import { formatRelativeTime } from "../learning/learning-notes.adapter";
import { HomeSectionHeader } from "./HomePresentation";
import { StudentHomeThumbnail } from "./StudentHomeThumbnail";

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

export function RecentUpdatesPanel({
  courses,
  title = "Recent Updates",
  hasData,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onNavigatePage,
  hideWhenEmpty = false,
}: {
  courses: readonly RecentUpdateCourse[];
  title?: string;
  hasData: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onNavigatePage?: (destination: string) => void;
  hideWhenEmpty?: boolean;
}) {
  const navigate = useNavigate();

  if (
    !isLoading &&
    !isError &&
    hasData &&
    courses.length === 0 &&
    hideWhenEmpty
  ) {
    return null;
  }

  return (
    <section className="dashboard-panel home-updates-panel">
      <HomeSectionHeader
        icon={Target}
        title={title}
        action={onNavigatePage ? "View All" : undefined}
        onAction={onNavigatePage ? () => onNavigatePage("courses") : undefined}
      />
      <div className="home-update-list" aria-busy={isLoading || isFetching}>
        {isLoading && !hasData ? (
          <RecentUpdatesSkeletons />
        ) : isError && !hasData ? (
          <RecentUpdatesState error isRetrying={isFetching} onRetry={onRetry} />
        ) : courses.length === 0 ? (
          <RecentUpdatesState />
        ) : (
          courses.map((course) => (
            <div className="home-update-course" key={course.courseId}>
              <div className="home-update-course-header">
                <StudentHomeThumbnail
                  src={course.courseThumbnailUrl}
                  fallbackSrcs={[
                    getCourseThumbnailCdnUrl(course.courseThumbnailMediaId),
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
          ))
        )}
      </div>
    </section>
  );
}
