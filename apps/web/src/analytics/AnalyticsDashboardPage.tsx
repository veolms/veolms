import { useMemo, useState, type ReactNode } from "react";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { LoadingCards } from "../components/analytics/StatTiles";
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

const RANGE_OPTIONS: ReadonlyArray<{ key: RangeKey; label: string; days: number }> = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
];

function useDateRangeParams(rangeKey: RangeKey) {
  return useMemo(() => {
    const option = RANGE_OPTIONS.find((candidate) => candidate.key === rangeKey)!;
    const to = new Date();
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
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="pt-2 sm:pt-0 flex flex-col gap-3.5 sm:gap-5 border-b border-(--border) pb-4.5 sm:pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-(--accent)">
          <span className="size-1.5 rounded-full bg-(--accent)" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1 className="mt-2.5 sm:mt-2 text-[clamp(1.75rem,3vw,2.55rem)] font-semibold tracking-[-0.04em] text-(--text)">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-(--muted)">{description}</p>
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

  const params = {
    ...dateRangeParams,
    courseId: courseId === "all" ? undefined : courseId,
  };
  const adminQuery = useAdminAnalyticsOverview(params, { enabled: isAdmin });
  const instructorQuery = useInstructorAnalyticsOverview(params, { enabled: !isAdmin });
  const { data, isLoading } = isAdmin ? adminQuery : instructorQuery;

  const courseOptions: ThemedSelectOption<string>[] = [
    ["all", isAdmin ? "All Courses" : "All my courses"] as ThemedSelectOption<string>,
    ...(myCourses.data?.courses ?? []).map(
      (course) => [course.id, course.title] as ThemedSelectOption<string>,
    ),
  ];

  return (
    <main className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6 px-0 py-0.5 sm:p-6 xl:p-8">
      <PageHeader
        eyebrow={isAdmin ? "Academy insights" : "Instructor insights"}
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
              onValueChange={setCourseId}
              options={courseOptions}
              ariaLabel="Course"
              searchable
              triggerClassName={selectTriggerClass}
            />
            <DateRangeTabs value={range} onChange={setRange} />
          </>
        }
      />

      {isLoading || !data ? (
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
