import { memo, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardRange, Permission } from "@veolms/contracts";
import { NAVIGATION_PERMISSIONS } from "./shell/navigationPermissions";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PulseIcon as Pulse } from "@phosphor-icons/react/Pulse";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { RevenuePanel } from "./home/creator/RevenuePanel";
import { getCreatorDashboardRefreshQueryKeys } from "./home/creator/dashboardQueryKeys";
import { EnrollmentsPanel } from "./home/creator/EnrollmentsPanel";
import { CoursesPanel } from "./home/creator/CoursesPanel";
import { DiscussionsPanel } from "./home/creator/DiscussionsPanel";
import { LearningActivityPanel } from "./home/creator/LearningActivityPanel";
import type { NavigateProps } from "./home/creator/dashboardTypes";
import { DashboardMetricComparison } from "./home/creator/dashboardMetrics";
import {
  getDashboardGreeting,
  formatDashboardCurrency,
  formatDashboardNumber,
} from "./home/creator/dashboardFormat";
import { useDashboard } from "./services/analytics";
import { useAuthStore } from "./store/auth.store";
import { useCapabilities } from "./services/authorization/authorization.queries";
import { rememberDashboardTitle } from "./store/homeHint";
import "./styles/features/creator-dashboard.css";
import "./styles/features/dashboard-discussion-preview.css";

interface CreatorDashboardProps extends NavigateProps {
  academyTheme?: string;
  resolvedTheme?: "light" | "dark";
}

export const CreatorDashboard = memo(function CreatorDashboard({
  onNavigatePage,
  academyTheme = "default",
  resolvedTheme = "dark",
}: CreatorDashboardProps) {
  const capabilities = useCapabilities();
  const canCreateCourse = capabilities.can("course.create");
  // Home is every team member's; each part shows with the permission behind
  // its numbers (held for every course: the numbers are academy-wide).
  const seesAcademy = (key: Permission) => capabilities.canOnCourse(key, null);
  const showRevenue = seesAcademy("analytics.revenue.read");
  const showAcademyStats =
    showRevenue || seesAcademy("analytics.overview.read");
  // Any analytics tab opens the page (kept free of the contracts barrel,
  // which would bring zod into the dashboard's first load).
  const showAnalyticsLink = (NAVIGATION_PERMISSIONS["/analytics"] ?? []).some(
    (key) => capabilities.can(key as Permission),
  );
  const [range, setRange] = useState<DashboardRange>("30d");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const {
    data: dashboardResponse,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    isFetching: isDashboardFetching,
    refetch: refetchDashboard,
  } = useDashboard(range);
  const dashboardUnavailable =
    isRefreshing ||
    isDashboardLoading ||
    isDashboardError ||
    !dashboardResponse;
  const dashboardCurrency = dashboardResponse?.revenue?.currency ?? "INR";
  const dashboardDisplayName =
    currentUser?.displayName?.trim() ||
    currentUser?.username?.trim() ||
    "Your name";
  const dashboardGreeting = getDashboardGreeting();
  // The heading puts the name on a second line when it does not fit beside
  // the greeting. What stands in for the dashboard before it arrives has to
  // wrap at the same width without knowing the name, so the two lengths are
  // kept for it (see store/homeHint.ts).
  const greetingWordsRef = useRef<HTMLSpanElement>(null);
  const greetingNameRef = useRef<HTMLSpanElement>(null);
  const greetingNameKnown = Boolean(currentUser);
  useLayoutEffect(() => {
    const words = greetingWordsRef.current;
    const name = greetingNameRef.current;
    if (!words || !name || !greetingNameKnown) return;
    const remember = () => {
      const fontSize = Number.parseFloat(getComputedStyle(words).fontSize);
      if (!(fontSize > 0)) return;
      rememberDashboardTitle(
        words.getBoundingClientRect().width / fontSize,
        name.getBoundingClientRect().width / fontSize,
      );
    };
    remember();
    // The heading's face arrives after the first paint and changes both.
    void document.fonts.ready.then(remember);
  }, [dashboardDisplayName, dashboardGreeting, greetingNameKnown]);
  const chartThemeKey = `${academyTheme}:${resolvedTheme}`;
  const handleDashboardRefresh = async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.allSettled(
        getCreatorDashboardRefreshQueryKeys(range).map((queryKey) =>
          queryClient.refetchQueries({
            queryKey,
            exact: true,
            type: "active",
          }),
        ),
      );
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  };
  const revenue = dashboardResponse?.revenue;
  const students = dashboardResponse?.students;
  const activeLearners = dashboardResponse?.activeLearners;
  const watchHours = dashboardResponse?.watchHours;
  const metricCards = [
    {
      label: "Revenue This Month",
      shown: showRevenue,
      value:
        dashboardUnavailable || !revenue
          ? "—"
          : formatDashboardCurrency(revenue.value, dashboardCurrency),
      changePercent: revenue?.changePercent,
      context: "vs last month",
      icon: CurrencyInr,
      tone: "violet",
    },
    {
      label: "Total Students",
      shown: showAcademyStats,
      value:
        dashboardUnavailable || !students
          ? "—"
          : formatDashboardNumber(students.total),
      changeValue:
        dashboardUnavailable || !students
          ? undefined
          : `+${formatDashboardNumber(students.newThisMonth)}`,
      context: "this month",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Active Learners (7d)",
      shown: showAcademyStats,
      value:
        dashboardUnavailable || !activeLearners
          ? "—"
          : formatDashboardNumber(activeLearners.value),
      changePercent: activeLearners?.changePercent,
      context: "vs last 7 days",
      icon: Pulse,
      tone: "green",
    },
    {
      label: "Watch Time This Month",
      shown: showAcademyStats,
      value:
        dashboardUnavailable || !watchHours
          ? "—"
          : `${formatDashboardNumber(watchHours.value)} hrs`,
      changePercent: watchHours?.changePercent,
      context: "vs last month",
      icon: Clock,
      tone: "gold",
    },
  ].filter((card) => card.shown);

  return (
    <div className="creator-dashboard">
      <header className="creator-dashboard-heading">
        <div>
          <h1>
            <span className="creator-dashboard-greeting">
              <span ref={greetingWordsRef}>{dashboardGreeting},</span>{" "}
              <span
                ref={greetingNameRef}
                className="creator-dashboard-greeting-name"
              >
                {dashboardDisplayName}{" "}
                <span
                  className="creator-dashboard-greeting-emoji"
                  aria-hidden="true"
                >
                  👋
                </span>
              </span>
            </span>
          </h1>
          <p>Here&apos;s what&apos;s happening with your academy today.</p>
        </div>
        <div className="creator-dashboard-actions">
          <button
            type="button"
            className="creator-outline-action creator-dashboard-refresh-action"
            onClick={() => void handleDashboardRefresh()}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <ArrowClockwise
              className={`creator-dashboard-refresh-icon${
                isRefreshing ? " is-refreshing" : ""
              }`}
              size={17}
              aria-hidden="true"
            />
            Refresh
          </button>
          {canCreateCourse && (
            <button
              type="button"
              className="creator-primary-action"
              onClick={() => onNavigatePage?.("Create Course")}
            >
              <Plus size={18} />
              <span className="creator-action-label creator-action-label--full">
                Create Course
              </span>
              <span className="creator-action-label creator-action-label--compact">
                Course
              </span>
            </button>
          )}
          {showAnalyticsLink ? (
            <button
              type="button"
              className="creator-outline-action"
              onClick={() => onNavigatePage?.("Analytics")}
            >
              <ChartBar size={17} />
              <span className="creator-action-label creator-action-label--full">
                View Analytics
              </span>
              <span className="creator-action-label creator-action-label--compact">
                Analytics
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {metricCards.length > 0 ? (
        <section className="creator-kpi-grid" aria-label="Academy overview">
          {metricCards.map(
            ({
              label,
              value,
              changePercent,
              changeValue,
              context,
              icon: Icon,
              tone,
            }) => (
              <article className="creator-kpi-card" key={label}>
                <span className={`creator-icon-circle tone-${tone}`}>
                  <Icon size={22} weight="duotone" />
                </span>
                <div>
                  <small>{label}</small>
                  <strong>{value}</strong>
                  <span className="creator-kpi-footer">
                    <DashboardMetricComparison
                      changePercent={changePercent}
                      changeValue={changeValue}
                      context={context}
                      unavailable={dashboardUnavailable}
                    />
                  </span>
                </div>
              </article>
            ),
          )}
        </section>
      ) : null}

      <div className="creator-dashboard-grid">
        {showRevenue ? (
          <RevenuePanel
            range={range}
            setRange={setRange}
            themeKey={chartThemeKey}
            revenueOverview={dashboardResponse?.revenueOverview ?? undefined}
            isLoading={isDashboardLoading}
            isError={isDashboardError}
            isManualRefresh={isRefreshing}
          />
        ) : null}
        {showAcademyStats ? (
          <LearningActivityPanel
            themeKey={chartThemeKey}
            learningActivity={dashboardResponse?.learningActivity ?? undefined}
            isLoading={isDashboardLoading}
            isError={isDashboardError}
            isManualRefresh={isRefreshing}
          />
        ) : null}
        <CoursesPanel
          onNavigatePage={onNavigatePage}
          courses={dashboardResponse?.yourCourses}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
          isFetching={isDashboardFetching}
          isManualRefresh={isRefreshing}
          onRetry={() => void refetchDashboard()}
        />
        <DiscussionsPanel
          onNavigatePage={onNavigatePage}
          isManualRefresh={isRefreshing}
        />
        <EnrollmentsPanel
          onNavigatePage={onNavigatePage}
          isManualRefresh={isRefreshing}
        />
      </div>
    </div>
  );
});
