import { useEffect, useState } from "react";
import type {
  DashboardSummaryResponse,
  DashboardYourCourse,
} from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { CourseThumbnailPlaceholder } from "../../courses/CourseThumbnailPlaceholder";
import { DashboardPanel } from "./DashboardPanel";
import { DashboardInfoPopover } from "./DashboardInfoPopover";
import type { NavigateProps } from "./dashboardTypes";
import { useCapabilities } from "../../services/authorization/authorization.queries";
import {
  formatDashboardNumber,
  formatDashboardPercent,
} from "./dashboardFormat";
import {
  DashboardRetryContent,
  CreatorCourseProgress,
} from "./dashboardTableParts";

function CreatorCourseThumbnail({ course }: { course: DashboardYourCourse }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [course.thumbnailUrl]);

  return (
    <span className="creator-course-thumbnail">
      {course.thumbnailUrl && !imageFailed ? (
        <img
          src={course.thumbnailUrl}
          srcSet={course.thumbnailSrcSet
            ?.map((variant) => `${variant.url} ${variant.width}w`)
            .join(", ")}
          sizes="32px"
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <CourseThumbnailPlaceholder className="creator-course-thumbnail-placeholder" />
      )}
    </span>
  );
}

function formatCourseStatus(status: DashboardYourCourse["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getCourseRowDestination(course: DashboardYourCourse) {
  const editStep = course.status === "draft" ? "basics" : "curriculum";
  return `/courses/${encodeURIComponent(course.id)}/edit/${editStep}`;
}

function CourseTableSkeletonRows() {
  return Array.from({ length: 5 }, (_, index) => (
    <div
      className="creator-table-row creator-course-skeleton-row"
      key={`course-skeleton-${index}`}
      aria-hidden="true"
    >
      <span className="creator-course-cell">
        <span className="creator-course-skeleton-thumbnail" />
        <span className="creator-course-skeleton-title" />
      </span>
      <span>
        <span className="creator-course-skeleton-status" />
      </span>
      <span>
        <span className="creator-course-skeleton-students" />
      </span>
      <span className="creator-progress-cell">
        <span className="creator-course-skeleton-percent" />
        <i className="creator-course-skeleton-track">
          <b />
        </i>
      </span>
    </div>
  ));
}

export function CoursesPanel({
  onNavigatePage,
  courses,
  isLoading,
  isError,
  isFetching,
  isManualRefresh,
  onRetry,
}: NavigateProps & {
  courses?: DashboardSummaryResponse["yourCourses"];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isManualRefresh: boolean;
  onRetry: () => void;
}) {
  const canCreateCourse = useCapabilities().can("course.create");
  const courseRows = courses ?? [];
  const hasCourseData = courses !== undefined;
  const showInitialLoading = isManualRefresh || (isLoading && !hasCourseData);
  const showInitialError = isError && !hasCourseData;

  return (
    <DashboardPanel
      className="creator-courses-panel"
      icon={BookOpen}
      title="Your Courses"
      action="Manage courses"
      onAction={() => onNavigatePage?.("courses")}
    >
      <div className="creator-table creator-courses-table">
        <div className="creator-table-head">
          <span>Course</span>
          <span>Status</span>
          <span>Students</span>
          <div className="creator-table-head-label">
            <span>Avg Progress</span>
            <DashboardInfoPopover
              className="creator-table-info-wrap"
              portal
              infoLabel="About average course progress"
              infoTitle="Average Course Progress"
              infoDescription={
                <p>
                  Average of each learner&apos;s stored course-progress records
                  for this course. A missing value means no progress record is
                  available.
                </p>
              }
            />
          </div>
        </div>
        {showInitialLoading ? (
          <div
            className="creator-course-skeleton"
            role="status"
            aria-label="Loading courses"
          >
            <CourseTableSkeletonRows />
          </div>
        ) : showInitialError ? (
          <div className="creator-table-row creator-table-state" role="alert">
            <DashboardRetryContent
              title="Couldn't load courses"
              message="Something went wrong while loading your courses."
              isRetrying={isFetching}
              onRetry={onRetry}
            />
          </div>
        ) : courseRows.length === 0 ? (
          <div className="creator-table-row creator-table-state creator-courses-empty-state">
            <span>
              <strong>No courses yet</strong>
              <small>
                Create your first course to start tracking students and
                progress.
              </small>
              {canCreateCourse && (
                <button
                  type="button"
                  className="creator-panel-link"
                  onClick={() => onNavigatePage?.("Create Course")}
                >
                  Create course <ArrowRight size={16} />
                </button>
              )}
            </span>
          </div>
        ) : (
          courseRows.map((course) => (
            <button
              type="button"
              className="creator-table-row creator-course-row"
              key={course.id}
              onClick={() => onNavigatePage?.(getCourseRowDestination(course))}
              title={
                course.status === "draft"
                  ? `Continue editing ${course.title}`
                  : `Manage ${course.title}`
              }
            >
              <span className="creator-course-cell">
                <CreatorCourseThumbnail course={course} />
                <strong>{course.title}</strong>
              </span>
              <span>
                <em
                  className={`course-tag creator-course-status course-tag--${course.status}`}
                >
                  {formatCourseStatus(course.status)}
                </em>
              </span>
              <span className="creator-course-students">
                <Users
                  className="creator-course-students-icon"
                  size={14}
                  weight="regular"
                  aria-hidden="true"
                />
                <span className="creator-course-students-number">
                  {formatDashboardNumber(course.students)}
                </span>
                <span className="creator-course-students-label">
                  {course.students === 1 ? "student" : "students"}
                </span>
              </span>
              <span
                className="creator-progress-cell"
                data-progress-unavailable={
                  course.averageProgressPercent === null ? "" : undefined
                }
              >
                <span>
                  {course.averageProgressPercent === null
                    ? "—"
                    : formatDashboardPercent(course.averageProgressPercent)}
                </span>
                {course.averageProgressPercent !== null && (
                  <CreatorCourseProgress
                    value={course.averageProgressPercent}
                    animated={course.status === "published"}
                  />
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </DashboardPanel>
  );
}
