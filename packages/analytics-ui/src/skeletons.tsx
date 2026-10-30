import type { ReactNode } from "react";
import { KpiCard } from "./KpiCard";
import { ChartSection, kpiGridClass } from "./surfaces";

export { LoadingTab } from "./surfaces";

/**
 * What a tab looks like before its numbers are in: the same cards, with
 * their real titles, and a shimmer where a value, a chart or a list will
 * go. A tab declares its shape once (see `AnalyticsTabPlaceholderSpec`),
 * and the page draws it both while the tab's code loads and while its
 * data loads, so nothing jumps when the numbers arrive.
 */

export const shimmerClass =
  "animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]";

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`${shimmerClass} ${className}`} aria-hidden="true" />;
}

/** The space of a TrendChart or SeriesChart, with its legend line. */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div aria-hidden="true">
      <div className="mb-2 flex gap-4">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="relative overflow-hidden rounded-lg" style={{ height }}>
        <Shimmer className="absolute inset-0 rounded-lg" />
        <div className="absolute inset-x-3 bottom-3 flex items-end gap-2">
          {[38, 55, 46, 70, 62, 84, 76, 92, 68, 80, 95, 88].map(
            (bar, index) => (
              <div
                key={index}
                className="flex-1 rounded-sm bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                style={{ height: `${bar * 0.6}%` }}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Rows of a BarList, FunnelList or a donut's legend. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <Shimmer className="h-3.5 w-2/5" />
            <Shimmer className="h-3.5 w-14" />
          </div>
          <Shimmer className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** The rows of a DataTable, with its header line. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  const widths = ["w-2/5", "w-16", "w-20", "w-14", "w-16", "w-12"];
  return (
    <div className="grid gap-3" aria-hidden="true">
      <div className="flex items-center gap-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] pb-2">
        {Array.from({ length: columns }, (_, index) => (
          <Shimmer
            key={index}
            className={`h-3 ${index === 0 ? "flex-1" : (widths[index] ?? "w-14")}`}
          />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4">
          <div className="flex flex-1 items-center gap-2.5">
            <Shimmer className="size-7 rounded-lg" />
            <Shimmer className="h-3.5 w-3/5" />
          </div>
          {Array.from({ length: columns - 1 }, (_, index) => (
            <Shimmer
              key={index}
              className={`h-3.5 ${widths[index + 1] ?? "w-14"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

import type {
  AnalyticsPlaceholderSection as PlaceholderSection,
  AnalyticsTabPlaceholderSpec,
} from "@veolms/web-core";

export type { AnalyticsTabPlaceholderSpec };

function sectionBody(section: PlaceholderSection): ReactNode {
  switch (section.kind) {
    case "chart":
      return <ChartSkeleton height={section.size} />;
    case "table":
      return <TableSkeleton rows={section.size} />;
    case "list":
      return <ListSkeleton rows={section.size} />;
  }
}

/**
 * A tab drawn from its spec alone: the KPI tiles with their labels and
 * icons, and every card with its title, each holding the shimmer of what
 * will fill it. Consecutive half-width cards share a row.
 */
export function AnalyticsTabPlaceholder({
  spec,
}: {
  spec: AnalyticsTabPlaceholderSpec;
}) {
  const rows: Array<PlaceholderSection[]> = [];
  for (const section of spec.sections) {
    const last = rows.at(-1);
    if (
      section.span === "half" &&
      last &&
      last.length === 1 &&
      last[0]?.span === "half"
    ) {
      last.push(section);
    } else {
      rows.push([section]);
    }
  }
  return (
    <div className="grid gap-3.5 sm:gap-6" aria-busy="true">
      {spec.kpis.length > 0 ? (
        <section className={kpiGridClass}>
          {spec.kpis.map((tile) => (
            <KpiCard
              key={tile.label}
              label={tile.label}
              tone={tile.tone}
              icon={
                tile.Icon ? <tile.Icon size={20} weight="bold" /> : undefined
              }
              loading
            />
          ))}
        </section>
      ) : null}
      {rows.map((row, index) =>
        row.length === 2 ? (
          <div key={index} className="grid gap-3.5 sm:gap-6 lg:grid-cols-2">
            {row.map((section) => (
              <ChartSection
                key={section.title}
                title={section.title}
                description={section.description}
              >
                {sectionBody(section)}
              </ChartSection>
            ))}
          </div>
        ) : (
          <ChartSection
            key={row[0]!.title}
            title={row[0]!.title}
            description={row[0]!.description}
            className={
              row[0]!.span === "half" ? "lg:w-[calc(50%-0.75rem)]" : ""
            }
          >
            {sectionBody(row[0]!)}
          </ChartSection>
        ),
      )}
    </div>
  );
}
