import type { DashboardSummaryResponse } from "@veolms/contracts";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { PlusCircleIcon as PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { PulseIcon as Pulse } from "@phosphor-icons/react/Pulse";
import type { Icon } from "@phosphor-icons/react";
import { DashboardPanel } from "./DashboardPanel";
import { DataCanvas } from "./DataCanvas";
import { EnrollmentActivityComparison } from "./dashboardMetrics";
import {
  formatDashboardNumber,
  formatDashboardPercent,
} from "./dashboardFormat";

type ActivityRow = readonly [
  label: string,
  value: string,
  icon: Icon,
  tone: string,
];

export function LearningActivityPanel({
  themeKey,
  learningActivity,
  isLoading,
  isError,
  isManualRefresh,
}: {
  themeKey: string;
  learningActivity?: DashboardSummaryResponse["learningActivity"];
  isLoading: boolean;
  isError: boolean;
  isManualRefresh: boolean;
}) {
  const panelIsLoading = isLoading || isManualRefresh;
  const summaryUnavailable = panelIsLoading || isError;
  const rows: readonly ActivityRow[] = [
    [
      "Avg. Course Progress",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.averageCourseProgress.value ?? 0,
          ),
      ChartLineUp,
      "blue",
    ],
    [
      "Course Completion Rate",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.courseCompletionRate.value ?? 0,
          ),
      CheckCircle,
      "green",
    ],
    [
      "New Enrollments",
      summaryUnavailable
        ? "—"
        : formatDashboardNumber(learningActivity?.newEnrollments.value ?? 0),
      PlusCircle,
      "violet",
    ],
  ];
  const activityBuckets = summaryUnavailable
    ? []
    : (learningActivity?.enrollmentActivity.buckets ?? []);
  const activityStatus = panelIsLoading
    ? "loading"
    : isError
      ? "error"
      : activityBuckets.length === 0
        ? "empty"
        : undefined;
  const activityComparison = learningActivity?.enrollmentActivity;

  return (
    <DashboardPanel
      className="creator-activity-panel"
      icon={Pulse}
      title="Learning Activity"
      infoLabel="About Learning Activity"
      infoTitle="Learning Activity"
      infoDescription={
        <>
          <p>
            Summarizes how learners are progressing and engaging with courses.
          </p>
          <ul>
            <li>
              <strong>Avg. Course Progress</strong> — average stored progress
              across learner-course pairs with progress records.
            </li>
            <li>
              <strong>Course Completion Rate</strong> — percentage of those
              learner-course pairs whose average progress is at least 100%.
            </li>
            <li>
              <strong>New Enrollments</strong> — count of enrollment records
              created during the current 7-day activity window.
            </li>
            <li>
              <strong>Enrollment Activity</strong> — counts enrollment-record
              creation events across the last 7 days in 8-hour buckets.
            </li>
            <li>
              <strong>Previous 7 days comparison</strong> — compares the current
              activity window with the immediately preceding 7-day window when
              comparison data exists.
            </li>
          </ul>
          <p className="creator-panel-info-note">
            Buckets are created from UTC timestamps and displayed in your
            device-local time.
          </p>
        </>
      }
    >
      <div className="creator-activity-list">
        {rows.map(([label, value, Icon, tone]) => (
          <div className="creator-activity-row" key={label}>
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={18} weight="duotone" />
            </span>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="creator-chart-toolbar creator-activity-toolbar">
        <span>
          <i /> Enrollment Activity
        </span>
        <EnrollmentActivityComparison
          changePercent={activityComparison?.changePercent ?? null}
          unavailable={summaryUnavailable}
        />
      </div>
      <div className="creator-chart creator-chart--activity">
        <DataCanvas
          kind="activity"
          themeKey={themeKey}
          label="New enrollments over the last 7 days in local time, using 8-hour buckets"
          activityBuckets={activityBuckets}
          activityStatus={activityStatus}
        />
      </div>
      <p className="creator-activity-meta">
        Last 7 days · 8h buckets · Local time
      </p>
    </DashboardPanel>
  );
}
