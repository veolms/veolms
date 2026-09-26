import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import type { AnalyticsOverviewResponse } from "@veolms/contracts";
import { TrendChart } from "../../components/analytics/Charts";
import {
  ChartSection,
  CoursePerformanceTable,
  FunnelList,
  InsightsPanel,
  KpiCard,
  formatCurrencyAmount,
  formatHours,
  formatPercent,
  formatWholeNumber,
  kpiGridClass,
  toChartData,
} from "../analyticsShared";

export function OverviewTab({ data }: { data: AnalyticsOverviewResponse }) {
  const { overview, currency } = data;

  const insights: string[] = [];
  if (overview.netRevenue.changePercent !== null) {
    insights.push(
      `Net revenue is ${overview.netRevenue.changePercent >= 0 ? "up" : "down"} ${Math.abs(
        overview.netRevenue.changePercent,
      ).toFixed(1)}% vs the previous period, at ${formatCurrencyAmount(overview.netRevenue.value, currency)}.`,
    );
  }
  if (overview.orderFunnel.created > 0) {
    const payRate = (overview.orderFunnel.paid / overview.orderFunnel.created) * 100;
    insights.push(`${formatPercent(payRate)} of created orders convert to a paid order.`);
  }
  if (overview.learningFunnel.enrolled > 0) {
    const startRate = (overview.learningFunnel.started / overview.learningFunnel.enrolled) * 100;
    insights.push(`${formatPercent(startRate)} of enrolled learners have started at least one lesson.`);
  }
  if (overview.coursePerformance[0]) {
    insights.push(
      `${overview.coursePerformance[0].title} leads this period with ${formatWholeNumber(
        overview.coursePerformance[0].enrollments,
      )} enrollments.`,
    );
  }

  return (
    <div className="grid gap-3.5 sm:gap-6">
      <section className={kpiGridClass}>
        <KpiCard
          icon={<CurrencyInr size={20} weight="bold" />}
          label="Net Revenue"
          kpi={overview.netRevenue}
          format={(value) => formatCurrencyAmount(value, currency)}
          tone="accent"
        />
        <KpiCard
          icon={<ShoppingCart size={20} weight="bold" />}
          label="Orders"
          kpi={overview.orders}
          tone="blue"
        />
        <KpiCard
          icon={<Student size={20} weight="bold" />}
          label="New Enrollments"
          kpi={overview.newEnrollments}
          tone="emerald"
        />
        <KpiCard
          icon={<Users size={20} weight="bold" />}
          label="Active Learners"
          kpi={overview.activeLearners}
          tone="violet"
        />
        <KpiCard
          icon={<Clock size={20} weight="bold" />}
          label="Est. Watch Time"
          kpi={overview.estimatedWatchHours}
          format={formatHours}
          tone="amber"
        />
        <KpiCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Completion Rate"
          kpi={overview.completionRate}
          format={formatPercent}
          tone="teal"
        />
      </section>

      <ChartSection title="Revenue Trend" description="Net revenue per day">
        <TrendChart
          data={toChartData(overview.revenueTrend)}
          valueFormatter={(value) => formatCurrencyAmount(value, currency)}
        />
      </ChartSection>

      <div className="grid gap-3.5 sm:gap-6 lg:grid-cols-2">
        <ChartSection
          title="Order Funnel"
          description="Orders created, paid, and refunded in this period"
        >
          <FunnelList
            rows={[
              { label: "Created", value: overview.orderFunnel.created, tone: "blue" },
              { label: "Paid", value: overview.orderFunnel.paid, tone: "emerald" },
              { label: "Refunded", value: overview.orderFunnel.refunded, tone: "rose" },
            ]}
          />
        </ChartSection>
        <ChartSection
          title="Learning Funnel"
          description="Enrolled learners who started and completed a lesson"
        >
          <FunnelList
            rows={[
              { label: "Enrolled", value: overview.learningFunnel.enrolled, tone: "violet" },
              { label: "Started", value: overview.learningFunnel.started, tone: "amber" },
              { label: "Completed", value: overview.learningFunnel.completed, tone: "teal" },
            ]}
          />
        </ChartSection>
      </div>

      <ChartSection title="Course Performance" description="Top courses by enrollment">
        <CoursePerformanceTable rows={overview.coursePerformance} currency={currency} />
      </ChartSection>

      <InsightsPanel insights={insights} />
    </div>
  );
}
