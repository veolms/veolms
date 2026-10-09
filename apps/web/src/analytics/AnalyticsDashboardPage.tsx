import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { LoadingCards } from "../components/analytics/StatTiles";
import { Button } from "../components/Button";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { useMyCourses } from "../services/courses";
import {
  useAdminAnalyticsOverview,
  useInstructorAnalyticsOverview,
} from "../services/analytics";
import { selectTriggerClass } from "./analyticsShared";
import { OverviewTab } from "./tabs/OverviewTab";

interface Props {
  role: "student" | "creator";
  isAdmin: boolean;
  onNavigatePage?: (destination: string) => void;
}

type RangeKey = "7d" | "30d" | "3m" | "1y";

const RANGE_OPTIONS: ReadonlyArray<{
  key: RangeKey;
  label: string;
  days: number;
}> = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
];

function useDateRangeParams(rangeKey: RangeKey) {
  return useMemo(() => {
    const option = RANGE_OPTIONS.find(
      (candidate) => candidate.key === rangeKey,
    )!;
    // Through the end of today (UTC), so the range is the same for every
    // request made today. With "now" to the millisecond no two requests
    // matched: the server's response cache never hit, and this page
    // refetched everything each time it was opened.
    const to = new Date();
    to.setUTCHours(24, 0, 0, 0);
    const from = new Date(to.getTime() - option.days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeKey]);
}

function DateRangeTabs({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Date range"
      className="flex gap-1 sm:gap-1.5 rounded-[12px] sm:rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1 sm:p-1.5"
    >
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          tabIndex={value === option.key ? 0 : -1}
          onClick={() => onChange(option.key)}
          onKeyDown={handleRovingTabKeyDown}
          className={`rounded-[8px] sm:rounded-[10px] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            value === option.key
              ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--card-compact-shadow)]"
              : "text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PageHeader({
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="pt-2 sm:pt-0 flex flex-col gap-3.5 sm:gap-5 border-b border-(--border) pb-4.5 sm:pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.88rem] leading-6 text-(--muted)">
          {description}
        </p>
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-2 pb-0.5 sm:py-0">
          {action}
        </div>
      ) : null}
    </header>
  );
}

function AnalyticsContent({ isAdmin }: { isAdmin: boolean }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [courseId, setCourseId] = useState<string>("all");
  const dateRangeParams = useDateRangeParams(range);
  const myCourses = useMyCourses();

  // A course card's "Analytics" link opens this page with ?course=<id>, which
  // used to be ignored. It is read once and becomes the selected course only
  // if it is one of the courses in the list below.
  const [searchParams] = useSearchParams();
  const [requestedCourseId, setRequestedCourseId] = useState(
    () => searchParams.get("course") || null,
  );
  const myCourseRecords = myCourses.data?.courses;
  useEffect(() => {
    if (!requestedCourseId || !myCourseRecords) return;
    setRequestedCourseId(null);
    if (myCourseRecords.some((course) => course.id === requestedCourseId)) {
      setCourseId(requestedCourseId);
    }
  }, [requestedCourseId, myCourseRecords]);

  const changeCourse = (nextCourseId: string) => {
    setRequestedCourseId(null);
    setCourseId(nextCourseId);
  };

  const params = {
    ...dateRangeParams,
    courseId: courseId === "all" ? undefined : courseId,
  };
  const adminQuery = useAdminAnalyticsOverview(params, { enabled: isAdmin });
  const instructorQuery = useInstructorAnalyticsOverview(params, {
    enabled: !isAdmin,
  });
  const { data, isLoading, isError, refetch } = isAdmin
    ? adminQuery
    : instructorQuery;

  const courseOptions: ThemedSelectOption<string>[] = [
    [
      "all",
      isAdmin ? "All Courses" : "All my courses",
    ] as ThemedSelectOption<string>,
    ...(myCourses.data?.courses ?? []).map(
      (course) => [course.id, course.title] as ThemedSelectOption<string>,
    ),
  ];

  return (
    <main className="mx-auto grid w-full max-w-[1800px] gap-6">
      <PageHeader
        title="Analytics"
        description={
          isAdmin
            ? "Track your academy's performance with actionable insights."
            : "See how your courses are performing — revenue, enrollments, completion, and engagement."
        }
        action={
          <>
            <ThemedSelect
              value={courseId}
              onValueChange={changeCourse}
              options={courseOptions}
              ariaLabel="Course"
              searchable
              triggerClassName={selectTriggerClass}
            />
            <DateRangeTabs value={range} onChange={setRange} />
          </>
        }
      />

      {isError && !data ? (
        // Without this a failed load left the loading cards up for good.
        <div
          role="alert"
          className="rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-6 text-sm text-(--muted)"
        >
          <p className="font-semibold text-(--text)">
            Analytics could not be loaded.
          </p>
          <p className="mt-1">
            Check your connection and try again. Nothing has been changed.
          </p>
          <Button
            motion="static"
            className="mt-4 h-9 text-xs"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <LoadingCards />
        </div>
      ) : (
        <OverviewTab data={data} />
      )}
    </main>
  );
}

export function AnalyticsDashboardPage({ role, isAdmin }: Props) {
  if (role !== "creator") {
    return null;
  }
  return <AnalyticsContent isAdmin={isAdmin} />;
}
