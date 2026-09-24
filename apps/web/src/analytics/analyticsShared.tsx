import type { ReactNode } from "react";
import type { AnalyticsKpi, CoursePerformanceRow } from "@veolms/contracts";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/FunnelSimple";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { EmptyState, SectionHeading } from "../components/analytics/StatTiles";

export const surfaceClass =
  "rounded-[14px] sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,var(--surface-depth-shadow))";
export const selectTriggerClass =
  "!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)";
export const kpiGridClass =
  "grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-6";

/** Icon-chip color for a KPI/stat card. Kept to the same status-color
 * vocabulary already used elsewhere in the app (emerald/amber/rose success
 * chips, etc.) so multi-metric rows read at a glance without inventing a new
 * palette. */
export type KpiTone = "accent" | "violet" | "blue" | "emerald" | "amber" | "teal" | "rose";

export const KPI_TONE_CLASSES: Record<KpiTone, string> = {
  accent: "bg-(--accent)/12 text-(--accent)",
  violet: "bg-violet-500/12 text-violet-500",
  blue: "bg-blue-500/12 text-blue-500",
  emerald: "bg-emerald-500/12 text-emerald-500",
  amber: "bg-amber-500/12 text-amber-500",
  teal: "bg-teal-500/12 text-teal-500",
  rose: "bg-rose-500/12 text-rose-500",
};

const TONE_CYCLE: readonly KpiTone[] = ["accent", "violet", "emerald", "amber", "blue", "teal", "rose"];

export function toneForIndex(index: number): KpiTone {
  return TONE_CYCLE[index % TONE_CYCLE.length] ?? "accent";
}

export function formatCurrencyAmount(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function formatHours(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} hrs`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatTrendDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(date),
  );
}

export function toChartData(points: Array<{ date: string; value: number }>) {
  return points.map((point) => ({ label: formatTrendDate(point.date), value: point.value }));
}

export function KpiCard({
  icon,
  label,
  kpi,
  format = formatWholeNumber,
  tone = "accent",
}: {
  icon?: ReactNode;
  label: string;
  kpi: AnalyticsKpi;
  format?: (value: number) => string;
  tone?: KpiTone;
}) {
  const hasTrend = kpi.changePercent !== null;
  const isPositive = (kpi.changePercent ?? 0) >= 0;
  return (
    <div
      className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-2.5 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <p className="text-[0.7rem] sm:text-xs font-semibold leading-snug text-(--muted) tracking-wide">
          {label}
        </p>
        {icon ? (
          <span
            className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg ${KPI_TONE_CLASSES[tone]}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 sm:mt-2.5 text-xl sm:text-[1.75rem] font-bold tracking-tight text-(--text)">
        {format(kpi.value)}
      </p>
      {hasTrend ? (
        <p
          className={`mt-0.5 sm:mt-1 text-[0.68rem] sm:text-xs font-semibold ${
            isPositive ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {isPositive ? "↗" : "↘"} {Math.abs(kpi.changePercent!).toFixed(1)}% vs previous
        </p>
      ) : (
        <p className="mt-0.5 sm:mt-1 text-[0.68rem] sm:text-xs text-(--muted)">New this period</p>
      )}
    </div>
  );
}

/** A ranked, list-style funnel: each row's fill bar is sized relative to the
 * first (top-of-funnel) row, with the share-of-top percentage called out —
 * reads clearly even with as few as two or three steps, unlike a pyramid
 * chart at that scale. */
export interface FunnelListRow {
  label: string;
  value: number;
  tone?: KpiTone;
}

export function FunnelList({
  rows,
  format = formatWholeNumber,
  emptyMessage,
}: {
  rows: FunnelListRow[];
  format?: (value: number) => string;
  emptyMessage?: string;
}) {
  const top = rows[0]?.value ?? 0;
  if (rows.length === 0 || top <= 0) {
    return (
      <EmptyState
        icon={<FunnelSimple size={20} weight="bold" />}
        title="Not enough data yet"
        message={emptyMessage ?? "This will fill in once there's activity in the selected range."}
        compact
      />
    );
  }
  return (
    <div className="grid gap-2 sm:gap-2.5">
      {rows.map((row, index) => {
        const fillPercent = top > 0 ? (row.value / top) * 100 : 0;
        const tone = row.tone ?? toneForIndex(index);
        return (
          <div
            key={row.label}
            className="relative overflow-hidden rounded-[10px] sm:rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface))"
          >
            <div
              className={`absolute inset-y-0 left-0 ${KPI_TONE_CLASSES[tone].split(" ")[0]}`}
              style={{ width: `${Math.max(fillPercent, 4)}%` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg text-[0.65rem] sm:text-xs font-bold ${KPI_TONE_CLASSES[tone]}`}
                >
                  {index + 1}
                </span>
                <span className="truncate text-xs sm:text-sm font-semibold text-(--text)">
                  {row.label}
                </span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="text-sm sm:text-base font-bold tracking-tight text-(--text) tabular-nums">
                  {format(row.value)}
                </span>
                <span className="text-[0.68rem] sm:text-xs font-semibold text-(--muted) tabular-nums">
                  {Math.round(fillPercent)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A short list of auto-generated, plain-language callouts derived from the
 * already-fetched tab data — mirrors the "Insights" panels in the reference
 * dashboard without requiring any new backend tracking. */
export function InsightsPanel({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <section className={`${surfaceClass} p-3.5 sm:p-6`}>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
          <Lightbulb size={16} weight="bold" />
        </span>
        <h3 className="text-sm sm:text-base font-bold tracking-tight text-(--text)">Insights</h3>
      </div>
      <ul className="mt-3 sm:mt-4 grid gap-2 sm:gap-2.5">
        {insights.map((insight) => (
          <li
            key={insight}
            className="flex items-start gap-2 text-xs sm:text-sm leading-5 text-(--muted)"
          >
            <span
              className="mt-[7px] size-1.5 shrink-0 rounded-full bg-(--accent)"
              aria-hidden="true"
            />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChartSection({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={surfaceClass}>
      <SectionHeading title={title} description={description} action={action} />
      <div className="p-3 sm:p-7 pt-2 sm:pt-3">{children}</div>
    </section>
  );
}

function courseInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1]!;
  return (first[0]! + second[0]!).toUpperCase();
}

export function CoursePerformanceTable({
  rows,
  currency,
}: {
  rows: CoursePerformanceRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={20} weight="bold" />}
        title="No course activity yet"
        message="Course performance will show up here once there's enrollment activity."
        compact
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)">
            <th className="py-2 pr-3 font-medium">Course</th>
            <th className="py-2 pr-3 font-medium">Students</th>
            <th className="py-2 pr-3 font-medium">Net Revenue</th>
            <th className="py-2 pr-3 font-medium">Completion</th>
            <th className="py-2 pr-3 font-medium">Avg Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.courseId}
              className="border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
            >
              <td className="py-2.5 pr-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg text-[0.6rem] sm:text-[0.65rem] font-bold ${KPI_TONE_CLASSES[toneForIndex(index)]}`}
                  >
                    {courseInitials(row.title)}
                  </span>
                  <span className="truncate font-medium text-(--text)">{row.title}</span>
                </div>
              </td>
              <td className="py-2.5 pr-3 text-(--muted) tabular-nums">{row.enrollments}</td>
              <td className="py-2.5 pr-3 text-(--muted) tabular-nums">
                {formatCurrencyAmount(row.netRevenue, currency)}
              </td>
              <td className="py-2.5 pr-3 text-(--muted) tabular-nums">
                {formatPercent(row.completionRate)}
              </td>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-14 sm:w-20 shrink-0 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div
                      className="h-full rounded-full bg-(--accent)"
                      style={{
                        width: `${Math.min(100, Math.max(0, row.averageProgressPercent))}%`,
                      }}
                    />
                  </div>
                  <span className="text-(--muted) tabular-nums">
                    {formatPercent(row.averageProgressPercent)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
