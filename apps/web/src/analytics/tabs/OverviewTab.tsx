import { useMemo } from "react";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { ArrowUUpLeftIcon as ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { toMajorUnits } from "@veolms/contracts/commerce/money";
import type { AnalyticsOverviewResponse } from "@veolms/contracts";
import type { AnalyticsTabProps } from "@veolms/web-core";
import {
  ChartSection,
  DataTable,
  InsightsPanel,
  KpiCard,
  ProgressCell,
  SeriesChart,
  TitleCell,
  formatChartCurrency,
  formatCurrencyAmount,
  formatPercent,
  formatPrecisePercent,
  formatTrendDate,
  formatWholeNumber,
  kpiGridClass,
  type DataTableColumn,
} from "@veolms/analytics-ui";
import { useAnalyticsOverview } from "../../services/analytics";
import { percentCell, useTabExport } from "../analyticsShared";
import { OVERVIEW_PLACEHOLDER } from "../analyticsPlaceholders";
import { TabState } from "./TabState";

type CourseRow =
  AnalyticsOverviewResponse["overview"]["coursePerformance"][number];

/** Whether the answer carries money; it does not for a caller without the revenue permission. */
function includesRevenue(data: AnalyticsOverviewResponse): boolean {
  return data.includesRevenue !== false;
}

/** Money columns and rows, kept only when the answer carries money. */
const MONEY_COURSE_COLUMNS = new Set(["orders", "netRevenue"]);

function buildInsights(data: AnalyticsOverviewResponse): string[] {
  const { overview, currency } = data;
  const revenue = includesRevenue(data);
  const insights: string[] = [];
  if (revenue && overview.netRevenue.changePercent !== null) {
    insights.push(
      `Net revenue is ${overview.netRevenue.changePercent >= 0 ? "up" : "down"} ${Math.abs(
        overview.netRevenue.changePercent,
      ).toFixed(
        1,
      )}% vs the previous period, at ${formatCurrencyAmount(overview.netRevenue.value, currency)}.`,
    );
  }
  if (overview.newEnrollments.changePercent !== null) {
    insights.push(
      `${formatWholeNumber(overview.newEnrollments.value)} new enrollments, ${overview.newEnrollments.changePercent >= 0 ? "up" : "down"} ${Math.abs(
        overview.newEnrollments.changePercent,
      ).toFixed(1)}% on the period before.`,
    );
  }
  if (revenue && overview.refundRate.value > 0) {
    insights.push(
      `${formatPrecisePercent(overview.refundRate.value)} of paid orders were refunded in this period.`,
    );
  }
  const top = overview.coursePerformance[0];
  if (top) {
    insights.push(
      `${top.title} leads this period with ${formatWholeNumber(top.enrollments)} enrollments.`,
    );
  }
  return insights;
}

export default function OverviewTab({
  filters,
  isAdmin,
  onExportChange,
}: AnalyticsTabProps) {
  const query = useAnalyticsOverview(isAdmin ? "admin" : "instructor", {
    from: filters.from,
    to: filters.to,
    courseId: filters.courseId,
  });
  const data = query.data;

  useTabExport(onExportChange, data, (data) => {
    if (!includesRevenue(data)) {
      return [
        {
          title: "Overview",
          headers: ["Metric", "Value", "Change %"],
          rows: [
            [
              "New enrollments",
              data.overview.newEnrollments.value,
              data.overview.newEnrollments.changePercent,
            ],
            [
              "Total students",
              data.overview.totalStudents.value,
              data.overview.totalStudents.changePercent,
            ],
            [
              "Completion rate %",
              percentCell(data.overview.completionRate.value),
              data.overview.completionRate.changePercent,
            ],
          ],
        },
        {
          title: "Course performance",
          headers: ["Course", "Enrollments", "Completion %", "Avg progress %"],
          rows: data.overview.coursePerformance.map((row) => [
            row.title,
            row.enrollments,
            percentCell(row.completionRate),
            percentCell(row.averageProgressPercent),
          ]),
        },
      ];
    }
    return [
      {
        title: "Overview",
        headers: ["Metric", "Value", "Change %"],
        rows: [
          [
            "Net revenue",
            toMajorUnits(data.overview.netRevenue.value, data.currency),
            data.overview.netRevenue.changePercent,
          ],
          [
            "Orders",
            data.overview.orders.value,
            data.overview.orders.changePercent,
          ],
          [
            "New enrollments",
            data.overview.newEnrollments.value,
            data.overview.newEnrollments.changePercent,
          ],
          [
            "Total students",
            data.overview.totalStudents.value,
            data.overview.totalStudents.changePercent,
          ],
          [
            "Refund rate %",
            percentCell(data.overview.refundRate.value),
            data.overview.refundRate.changePercent,
          ],
          [
            "Completion rate %",
            percentCell(data.overview.completionRate.value),
            data.overview.completionRate.changePercent,
          ],
        ],
      },
      {
        title: "Daily",
        headers: [
          "Date",
          "Gross sales",
          "Net revenue",
          "Orders",
          "Refunded",
          "Refunds",
          "Enrollments",
        ],
        rows: data.overview.dailyOrders.map((day, index) => [
          day.date,
          toMajorUnits(day.grossSales, data.currency),
          toMajorUnits(day.netRevenue, data.currency),
          day.orders,
          toMajorUnits(day.refundedAmount, data.currency),
          day.refunds,
          data.overview.dailyEnrollments[index]?.value ?? 0,
        ]),
      },
      {
        title: "Course performance",
        headers: [
          "Course",
          "Enrollments",
          "Orders",
          "Net revenue",
          "Completion %",
          "Avg progress %",
        ],
        rows: data.overview.coursePerformance.map((row) => [
          row.title,
          row.enrollments,
          row.orders,
          toMajorUnits(row.netRevenue, data.currency),
          percentCell(row.completionRate),
          percentCell(row.averageProgressPercent),
        ]),
      },
    ];
  });

  const performanceData = useMemo(
    () =>
      data
        ? data.overview.dailyOrders.map((day) => ({
            label: formatTrendDate(day.date),
            netRevenue: toMajorUnits(day.netRevenue, data.currency),
            orders: day.orders,
          }))
        : [],
    [data],
  );

  if (!data) {
    return (
      <TabState
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        placeholder={OVERVIEW_PLACEHOLDER}
      />
    );
  }

  const { overview, currency } = data;
  const revenue = includesRevenue(data);
  const money = (value: number) => formatCurrencyAmount(value, currency);
  const chartMoney = (value: number) => formatChartCurrency(value, currency);

  const allCourseColumns: DataTableColumn<CourseRow>[] = [
    {
      key: "course",
      header: "Course",
      render: (row, index) => <TitleCell title={row.title} index={index} />,
    },
    {
      key: "enrollments",
      header: "Enrollments",
      numeric: true,
      render: (row) => formatWholeNumber(row.enrollments),
    },
    {
      key: "orders",
      header: "Orders",
      numeric: true,
      hideOnPhone: true,
      render: (row) => formatWholeNumber(row.orders),
    },
    {
      key: "netRevenue",
      header: "Net Revenue",
      numeric: true,
      render: (row) => money(row.netRevenue),
    },
    {
      key: "completion",
      header: "Completion",
      numeric: true,
      hideOnPhone: true,
      render: (row) => formatPercent(row.completionRate),
    },
    {
      key: "progress",
      header: "Avg Progress",
      numeric: true,
      hideOnPhone: true,
      render: (row) => <ProgressCell percent={row.averageProgressPercent} />,
    },
  ];
  const courseColumns = revenue
    ? allCourseColumns
    : allCourseColumns.filter(
        (column) => !MONEY_COURSE_COLUMNS.has(column.key),
      );

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:gap-6">
      <section className={kpiGridClass}>
        {revenue ? (
          <>
            <KpiCard
              icon={<CurrencyInr size={20} weight="bold" />}
              label="Net Revenue"
              kpi={overview.netRevenue}
              format={money}
              tone="accent"
              trend={overview.dailyOrders.map((day) => day.netRevenue)}
            />
            <KpiCard
              icon={<ShoppingCart size={20} weight="bold" />}
              label="Orders"
              kpi={overview.orders}
              tone="blue"
              trend={overview.dailyOrders.map((day) => day.orders)}
            />
          </>
        ) : null}
        <KpiCard
          icon={<Student size={20} weight="bold" />}
          label="New Enrollments"
          kpi={overview.newEnrollments}
          tone="emerald"
          trend={overview.dailyEnrollments.map((day) => day.value)}
        />
        <KpiCard
          icon={<UsersThree size={20} weight="bold" />}
          label="Total Students"
          kpi={overview.totalStudents}
          tone="violet"
        />
        {revenue ? (
          <KpiCard
            icon={<ArrowUUpLeft size={20} weight="bold" />}
            label="Refund Rate"
            kpi={overview.refundRate}
            format={formatPrecisePercent}
            tone="rose"
            invertTrend
            changeSuffix="% vs previous"
          />
        ) : null}
        <KpiCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Completion Rate"
          kpi={overview.completionRate}
          format={formatPercent}
          tone="teal"
        />
      </section>

      {revenue ? (
        <ChartSection
          title="Performance Over Time"
          description="Net revenue and paid orders per UTC day"
        >
          <SeriesChart
            data={performanceData}
            series={[
              {
                key: "netRevenue",
                name: `Net revenue (${currency})`,
                tone: "accent",
                format: chartMoney,
              },
              {
                key: "orders",
                name: "Orders",
                tone: "blue",
                kind: "bar",
                axis: "right",
                format: formatWholeNumber,
              },
            ]}
          />
        </ChartSection>
      ) : null}

      <ChartSection
        title="Course Performance"
        description="Top courses by enrollments in this period"
      >
        <DataTable
          rows={overview.coursePerformance}
          columns={courseColumns}
          rowKey={(row) => row.courseId}
          emptyTitle="No course activity yet"
          emptyMessage="Course performance will show up here once there's enrollment activity."
        />
      </ChartSection>

      <InsightsPanel insights={buildInsights(data)} />
    </div>
  );
}
