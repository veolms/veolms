import { useEffect, useState } from "react";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { useRecentEnrollments } from "../../services/enrollments";
import { useCapabilities } from "../../services/authorization/authorization.queries";
import { formatRelativeTime } from "../../learning/learning-notes.adapter";
import { DashboardPanel } from "./DashboardPanel";
import { DashboardInfoPopover } from "./DashboardInfoPopover";
import { CREATOR_DASHBOARD_ENROLLMENT_LIMIT } from "./dashboardQueryKeys";
import type { NavigateProps } from "./dashboardTypes";
import { formatDashboardPercent } from "./dashboardFormat";
import {
  DashboardRetryContent,
  CreatorCourseProgress,
} from "./dashboardTableParts";

function CreatorStudentAvatar({ src }: { src?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className="creator-student-avatar" aria-hidden="true">
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserCircle className="creator-student-avatar-icon" weight="duotone" />
      )}
    </span>
  );
}

function CreatorEnrollmentProgress({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span
        className="creator-enrollment-progress-unavailable"
        data-mobile-label="Progress"
      >
        Not started
      </span>
    );
  }

  return (
    <span className="creator-progress-cell" data-mobile-label="Progress">
      <span className="creator-enrollment-progress-value">
        {formatDashboardPercent(value)}
      </span>
      <CreatorCourseProgress value={value} animated />
    </span>
  );
}

function EnrollmentTableSkeletonRows() {
  return (
    <div
      className="creator-enrollment-skeleton-rows"
      role="status"
      aria-label="Loading recent enrollments"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="creator-table-row creator-enrollment-skeleton-row"
          key={`enrollment-skeleton-${index}`}
          aria-hidden="true"
        >
          <span className="creator-student-cell">
            <span className="creator-enrollment-skeleton-avatar" />
            <span className="creator-enrollment-skeleton-name" />
          </span>
          <span>
            <span className="creator-enrollment-skeleton-course" />
          </span>
          <span className="creator-enrollment-mobile-meta">
            <span className="creator-enrollment-progress-slot">
              <span
                className="creator-progress-cell"
                data-mobile-label="Progress"
              >
                <span className="creator-enrollment-skeleton-percent" />
                <i className="creator-enrollment-skeleton-track">
                  <b />
                </i>
              </span>
            </span>
            <span
              className="creator-enrollment-skeleton-time"
              data-mobile-label="Enrolled"
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export function EnrollmentsPanel({
  onNavigatePage,
  isManualRefresh,
}: NavigateProps & { isManualRefresh: boolean }) {
  // Who enrolled is enrollment.read; a dashboard without it (an analytics
  // viewer's) leaves the panel out.
  const capabilities = useCapabilities();
  const readsEnrollments = capabilities.can("enrollment.read");
  const {
    data: enrollmentsResponse,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useRecentEnrollments({
    limit: CREATOR_DASHBOARD_ENROLLMENT_LIMIT,
    enabled: readsEnrollments,
  });
  const hasEnrollmentData = enrollmentsResponse !== undefined;
  const showInitialLoading =
    isManualRefresh || (isLoading && !hasEnrollmentData);
  const showInitialError = isError && !hasEnrollmentData;
  const enrollments = enrollmentsResponse?.items ?? [];

  if (capabilities.isFetched && !readsEnrollments) return null;

  return (
    <DashboardPanel
      className="creator-enrollments-panel"
      icon={UserPlus}
      title="Recent Enrollments"
      action="Manage students"
      onAction={() => onNavigatePage?.("Students")}
    >
      <div
        className="creator-table creator-enrollment-table"
        aria-busy={showInitialLoading || isFetching}
      >
        <div className="creator-table-head">
          <span>Student</span>
          <span>Course</span>
          <div className="creator-table-head-label">
            <span>Progress</span>
            <DashboardInfoPopover
              className="creator-table-info-wrap"
              portal
              infoLabel="About enrollment progress"
              infoTitle="Enrollment Progress"
              infoDescription={
                <p>
                  Average of the stored progress percentages for this learner
                  and course. Not started means no matching progress records are
                  available.
                </p>
              }
            />
          </div>
          <span>Enrolled</span>
        </div>
        {showInitialLoading ? (
          <EnrollmentTableSkeletonRows />
        ) : showInitialError ? (
          <div className="creator-table-row creator-table-state" role="alert">
            <DashboardRetryContent
              title="Couldn't load enrollments"
              message="Something went wrong while loading recent enrollments."
              isRetrying={isFetching}
              onRetry={() => void refetch()}
            />
          </div>
        ) : enrollments.length === 0 ? (
          <div className="creator-table-row creator-table-state" role="status">
            <span className="creator-dashboard-state-content">
              <strong>No recent enrollments</strong>
              <small>New student enrollments will appear here.</small>
            </span>
          </div>
        ) : (
          enrollments.map((item) => {
            const studentUsername = item.student.username?.trim();
            const rowContent = (
              <>
                <span className="creator-student-cell">
                  <CreatorStudentAvatar src={item.student.avatarUrl} />
                  <strong>{item.student.displayName}</strong>
                </span>
                <span>{item.course.title}</span>
                <span className="creator-enrollment-mobile-meta">
                  <span className="creator-enrollment-progress-slot">
                    <CreatorEnrollmentProgress
                      value={item.averageProgressPercent}
                    />
                  </span>
                  <time
                    dateTime={new Date(item.enrolledAt).toISOString()}
                    data-mobile-label="Enrolled"
                  >
                    {formatRelativeTime(item.enrolledAt)}
                  </time>
                </span>
              </>
            );

            if (!studentUsername) {
              return (
                <div className="creator-table-row" key={item.enrollmentId}>
                  {rowContent}
                </div>
              );
            }

            return (
              <button
                type="button"
                className="creator-table-row creator-enrollment-row"
                key={item.enrollmentId}
                onClick={() =>
                  onNavigatePage?.(
                    `/students/${encodeURIComponent(studentUsername)}`,
                  )
                }
                aria-label={`View learner ${item.student.displayName}`}
              >
                {rowContent}
              </button>
            );
          })
        )}
      </div>
    </DashboardPanel>
  );
}
