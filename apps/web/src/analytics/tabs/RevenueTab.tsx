import { useMemo } from "react";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { ShoppingCartIcon as ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { ArrowUUpLeftIcon as ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { toMajorUnits } from "@veolms/contracts/commerce/money";
import type { AnalyticsRevenueResponse } from "@veolms/contracts";
import type { AnalyticsTabProps } from "@veolms/web-core";
import {
  BarList,
  ChartSection,
  DataTable,
  DonutChart,
  FunnelList,
  InsightsPanel,
  KpiCard,
  SeriesChart,
  TitleCell,
  formatChartCurrency,
  formatCurrencyAmount,
  formatPrecisePercent,
  formatTrendDate,
  formatWholeNumber,
  kpiGridClass,
  titleInitials,
  type DataTableColumn,
} from "@veolms/analytics-ui";
import { useAnalyticsRevenue } from "../../services/analytics";
import { percentCell, useTabExport } from "../analyticsShared";
import { REVENUE_PLACEHOLDER } from "../analyticsPlaceholders";
import { TabState } from "./TabState";

type Revenue = AnalyticsRevenueResponse["revenue"];
type CouponRow = Revenue["coupons"][number];
type TopCourseRow = Revenue["topCourses"][number];

const SOURCE_LABELS: Record<Revenue["sources"][number]["source"], string> = {
  full_price: "Full price",
  coupon: "With a coupon",
  free: "Free",
};

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Cards",
  netbanking: "Net Banking",
  wallet: "Wallets",
  emi: "EMI",
  paylater: "Pay Later",
  bank_transfer: "Bank Transfer",
  free: "Free",
  unknown: "Not recorded",
};

function methodLabel(method: string): string {
  return (
    METHOD_LABELS[method] ??
    method.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function buildInsights(data: AnalyticsRevenueResponse): string[] {
  const { revenue, currency } = data;
  const insights: string[] = [];
  const topProduct = revenue.byProduct[0];
  const productTotal = revenue.byProduct.reduce(
    (sum, row) => sum + row.netRevenue,
    0,
  );
  if (topProduct && productTotal > 0) {
    insights.push(
      `${topProduct.title} brought in ${formatPrecisePercent((topProduct.netRevenue / productTotal) * 100)} of product revenue (${formatCurrencyAmount(topProduct.netRevenue, currency)}).`,
    );
  }
  const coupon = revenue.sources.find((row) => row.source === "coupon");
  const paidOrders = revenue.sources
    .filter((row) => row.source !== "free")
    .reduce((sum, row) => sum + row.orders, 0);
  if (coupon && paidOrders > 0 && coupon.orders > 0) {
    insights.push(
      `${formatPrecisePercent((coupon.orders / paidOrders) * 100)} of paid orders used a coupon.`,
    );
  }
  const topMethod = revenue.paymentMethods[0];
  const methodTotal = revenue.paymentMethods.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  if (topMethod && methodTotal > 0 && topMethod.method !== "unknown") {
    insights.push(
      `${methodLabel(topMethod.method)} is the most used payment method, at ${formatPrecisePercent((topMethod.amount / methodTotal) * 100)} of paid order value.`,
    );
  }
  if (revenue.funnel.checkoutStarted > 0) {
    insights.push(
      `${formatPrecisePercent((revenue.funnel.paid / revenue.funnel.checkoutStarted) * 100)} of started checkouts end in a paid order.`,
    );
  }
  if (revenue.funnel.inCarts > 0) {
    insights.push(
      `${formatWholeNumber(revenue.funnel.inCarts)} items added to carts in this period are still waiting to be bought.`,
    );
  }
  if (revenue.refundRate.value > 0) {
    insights.push(
      `${formatPrecisePercent(revenue.refundRate.value)} of paid orders were refunded, ${formatCurrencyAmount(revenue.refundedAmount.value, currency)} in all.`,
    );
  }
  return insights;
}

export default function RevenueTab({
  filters,
  isAdmin,
  onExportChange,
}: AnalyticsTabProps) {
  const query = useAnalyticsRevenue(isAdmin ? "admin" : "instructor", {
    from: filters.from,
    to: filters.to,
    courseId: filters.courseId,
  });
  const data = query.data;

  useTabExport(onExportChange, data, (data) => {
    const major = (value: number) => toMajorUnits(value, data.currency);
    const { revenue } = data;
    return [
      {
        title: "Revenue",
        headers: ["Metric", "Value", "Change %"],
        rows: [
          [
            "Gross sales",
            major(revenue.grossSales.value),
            revenue.grossSales.changePercent,
          ],
          [
            "Net revenue",
            major(revenue.netRevenue.value),
            revenue.netRevenue.changePercent,
          ],
          ["Orders", revenue.orders.value, revenue.orders.changePercent],
          [
            "Unique buyers",
            revenue.uniqueBuyers.value,
            revenue.uniqueBuyers.changePercent,
          ],
          [
            "Average order value",
            major(revenue.averageOrderValue.value),
            revenue.averageOrderValue.changePercent,
          ],
          [
            "Refund rate %",
            percentCell(revenue.refundRate.value),
            revenue.refundRate.changePercent,
          ],
          [
            "Refunded amount",
            major(revenue.refundedAmount.value),
            revenue.refundedAmount.changePercent,
          ],
          [
            "Refunds",
            revenue.refundCount.value,
            revenue.refundCount.changePercent,
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
        ],
        rows: revenue.daily.map((day) => [
          day.date,
          major(day.grossSales),
          major(day.netRevenue),
          day.orders,
          major(day.refundedAmount),
          day.refunds,
        ]),
      },
      {
        title: "Revenue by product",
        headers: ["Product", "Type", "Net revenue", "Orders"],
        rows: revenue.byProduct.map((row) => [
          row.title,
          row.type,
          major(row.netRevenue),
          row.orders,
        ]),
      },
      {
        title: "Revenue sources",
        headers: ["Source", "Orders", "Net revenue"],
        rows: revenue.sources.map((row) => [
          SOURCE_LABELS[row.source],
          row.orders,
          major(row.netRevenue),
        ]),
      },
      {
        title: "Payment methods",
        headers: ["Method", "Orders", "Amount"],
        rows: revenue.paymentMethods.map((row) => [
          methodLabel(row.method),
          row.orders,
          major(row.amount),
        ]),
      },
      {
        title: "Commerce funnel",
        headers: ["Step", "Count"],
        rows: [
          ["Checkout started", revenue.funnel.checkoutStarted],
          ["Paid", revenue.funnel.paid],
          ["Refunded", revenue.funnel.refunded],
          ["Still in carts", revenue.funnel.inCarts],
        ],
      },
      {
        title: "Coupons",
        headers: [
          "Code",
          "Orders",
          "Gross sales",
          "Discount given",
          "Net revenue",
        ],
        rows: revenue.coupons.map((row) => [
          row.code,
          row.orders,
          major(row.grossSales),
          major(row.discountGiven),
          major(row.netRevenue),
        ]),
      },
      {
        title: "Top revenue courses",
        headers: [
          "Course",
          "Gross sales",
          "Net revenue",
          "Orders",
          "Buyers",
          "Refunded",
          "Avg order value",
        ],
        rows: revenue.topCourses.map((row) => [
          row.title,
          major(row.grossSales),
          major(row.netRevenue),
          row.orders,
          row.buyers,
          major(row.refundedAmount),
          major(row.averageOrderValue),
        ]),
      },
    ];
  });

  const dailyData = useMemo(
    () =>
      data
        ? data.revenue.daily.map((day) => ({
            label: formatTrendDate(day.date),
            grossSales: toMajorUnits(day.grossSales, data.currency),
            netRevenue: toMajorUnits(day.netRevenue, data.currency),
            refunded: toMajorUnits(day.refundedAmount, data.currency),
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
        placeholder={REVENUE_PLACEHOLDER}
      />
    );
  }

  const { revenue, currency } = data;
  const money = (value: number) => formatCurrencyAmount(value, currency);
  const chartMoney = (value: number) => formatChartCurrency(value, currency);

  const couponColumns: DataTableColumn<CouponRow>[] = [
    {
      key: "code",
      header: "Coupon Code",
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-(--text)">
          {row.code}
        </span>
      ),
    },
    {
      key: "orders",
      header: "Orders",
      numeric: true,
      render: (row) => formatWholeNumber(row.orders),
    },
    {
      key: "gross",
      header: "Revenue",
      numeric: true,
      render: (row) => money(row.grossSales),
    },
    {
      key: "discount",
      header: "Discount Given",
      numeric: true,
      hideOnPhone: true,
      render: (row) => money(row.discountGiven),
    },
    {
      key: "net",
      header: "Net Revenue",
      numeric: true,
      hideOnPhone: true,
      render: (row) => money(row.netRevenue),
    },
  ];

  const topCourseColumns: DataTableColumn<TopCourseRow>[] = [
    {
      key: "course",
      header: "Course",
      render: (row, index) => <TitleCell title={row.title} index={index} />,
    },
    {
      key: "gross",
      header: "Gross Sales",
      numeric: true,
      hideOnPhone: true,
      render: (row) => money(row.grossSales),
    },
    {
      key: "net",
      header: "Net Revenue",
      numeric: true,
      render: (row) => money(row.netRevenue),
    },
    {
      key: "orders",
      header: "Orders",
      numeric: true,
      render: (row) => formatWholeNumber(row.orders),
    },
    {
      key: "buyers",
      header: "Buyers",
      numeric: true,
      hideOnPhone: true,
      render: (row) => formatWholeNumber(row.buyers),
    },
    {
      key: "refunds",
      header: "Refunds",
      numeric: true,
      hideOnPhone: true,
      render: (row) => money(row.refundedAmount),
    },
    {
      key: "aov",
      header: "Avg Order Value",
      numeric: true,
      hideOnPhone: true,
      render: (row) => money(row.averageOrderValue),
    },
  ];

  const hasRefunds = revenue.daily.some((day) => day.refundedAmount > 0);

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:gap-6">
      <section className={kpiGridClass}>
        <KpiCard
          icon={<CurrencyInr size={20} weight="bold" />}
          label="Gross Sales"
          kpi={revenue.grossSales}
          format={money}
          tone="accent"
          trend={revenue.daily.map((day) => day.grossSales)}
        />
        <KpiCard
          icon={<Wallet size={20} weight="bold" />}
          label="Net Revenue"
          kpi={revenue.netRevenue}
          format={money}
          tone="blue"
          trend={revenue.daily.map((day) => day.netRevenue)}
        />
        <KpiCard
          icon={<ShoppingCart size={20} weight="bold" />}
          label="Orders"
          kpi={revenue.orders}
          tone="teal"
          trend={revenue.daily.map((day) => day.orders)}
        />
        <KpiCard
          icon={<Users size={20} weight="bold" />}
          label="Unique Buyers"
          kpi={revenue.uniqueBuyers}
          tone="emerald"
        />
        <KpiCard
          icon={<Receipt size={20} weight="bold" />}
          label="Avg Order Value"
          kpi={revenue.averageOrderValue}
          format={money}
          tone="amber"
        />
        <KpiCard
          icon={<ArrowUUpLeft size={20} weight="bold" />}
          label="Refund Rate"
          kpi={revenue.refundRate}
          format={formatPrecisePercent}
          tone="rose"
          invertTrend
          trend={revenue.daily.map((day) => day.refunds)}
        />
      </section>

      <ChartSection
        title="Revenue Over Time"
        description="Gross sales and net revenue per UTC day"
      >
        <SeriesChart
          data={dailyData}
          series={[
            {
              key: "grossSales",
              name: `Gross sales (${currency})`,
              tone: "blue",
              format: chartMoney,
            },
            {
              key: "netRevenue",
              name: `Net revenue (${currency})`,
              tone: "accent",
              format: chartMoney,
            },
          ]}
        />
      </ChartSection>

      <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-2">
        <ChartSection
          title="Revenue by Product"
          description="Net revenue of each course, bundle or quiz sold"
        >
          <BarList
            rows={revenue.byProduct.map((row) => ({
              key: `${row.type}:${row.id}`,
              label: row.title,
              value: row.netRevenue,
              leading: titleInitials(row.title),
              detail: `${formatWholeNumber(row.orders)} orders`,
            }))}
            format={money}
            total={revenue.netRevenue.value}
          />
        </ChartSection>
        <ChartSection
          title="Revenue Sources"
          description="How paid orders were priced"
        >
          <DonutChart
            slices={revenue.sources.map((row) => ({
              label: SOURCE_LABELS[row.source],
              value: row.netRevenue,
              tone:
                row.source === "full_price"
                  ? "accent"
                  : row.source === "coupon"
                    ? "amber"
                    : "slate",
              detail: `${formatWholeNumber(row.orders)} orders`,
            }))}
            totalLabel="Net revenue"
            format={money}
            emptyMessage="This will fill in once there are paid orders in the range."
          />
          {revenue.sources.find((row) => row.source === "free")?.orders ? (
            <p className="mt-3 text-xs text-(--muted)">
              {formatWholeNumber(
                revenue.sources.find((row) => row.source === "free")!.orders,
              )}{" "}
              free orders carried no revenue and are not in the ring.
            </p>
          ) : null}
        </ChartSection>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-2">
        <ChartSection
          title="Payment Methods"
          description="Paid orders by the method that settled them"
        >
          <BarList
            rows={revenue.paymentMethods.map((row) => ({
              key: row.method,
              label: methodLabel(row.method),
              value: row.amount,
              detail: `${formatWholeNumber(row.orders)} orders`,
            }))}
            format={money}
            total={null}
            emptyMessage="Payment methods appear once the gateway has captured a payment in the range."
          />
        </ChartSection>
        <ChartSection
          title="Commerce Funnel"
          description="Checkouts started and orders paid in this period"
        >
          <FunnelList
            rows={[
              {
                label: "Checkout Started",
                value: revenue.funnel.checkoutStarted,
                tone: "blue",
                icon: <ShoppingCart size={14} weight="bold" />,
              },
              { label: "Paid", value: revenue.funnel.paid, tone: "emerald" },
              {
                label: "Refunded",
                value: revenue.funnel.refunded,
                tone: "rose",
                icon: <ArrowUUpLeft size={14} weight="bold" />,
              },
            ]}
          />
          {revenue.funnel.inCarts > 0 ? (
            <p className="mt-3 text-xs text-(--muted)">
              {formatWholeNumber(revenue.funnel.inCarts)} items added to carts
              in this period are still waiting to be bought.
            </p>
          ) : null}
        </ChartSection>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-5">
        <ChartSection
          title="Coupon Performance"
          description="Orders and revenue by coupon code"
          className="lg:col-span-3"
        >
          <DataTable
            rows={revenue.coupons}
            columns={couponColumns}
            rowKey={(row) => row.couponId}
            emptyTitle="No coupon orders yet"
            emptyMessage="Coupon performance shows up once an order with a coupon is paid."
            dense
          />
        </ChartSection>
        <ChartSection
          title="Refund Trends"
          description="Refunded amount against the day the order was placed"
          className="lg:col-span-2"
        >
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5">
              <p className="text-[0.68rem] sm:text-xs font-semibold text-(--muted)">
                Amount Refunded
              </p>
              <p className="mt-1 text-base sm:text-lg font-bold tracking-tight text-(--text) tabular-nums">
                {money(revenue.refundedAmount.value)}
              </p>
            </div>
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5">
              <p className="text-[0.68rem] sm:text-xs font-semibold text-(--muted)">
                Refunded Orders
              </p>
              <p className="mt-1 text-base sm:text-lg font-bold tracking-tight text-(--text) tabular-nums">
                {formatWholeNumber(revenue.refundCount.value)}
              </p>
            </div>
          </div>
          <SeriesChart
            data={hasRefunds ? dailyData : []}
            height={200}
            showLegend={false}
            emptyMessage="No refunds in this period."
            series={[
              {
                key: "refunded",
                name: `Refunded (${currency})`,
                tone: "rose",
                kind: "bar",
                format: chartMoney,
              },
            ]}
          />
        </ChartSection>
      </div>

      <ChartSection
        title="Top Revenue Courses"
        description="Courses by gross sales of their order lines"
      >
        <DataTable
          rows={revenue.topCourses}
          columns={topCourseColumns}
          rowKey={(row) => row.courseId}
          emptyTitle="No course sales yet"
          emptyMessage="Course revenue will show up here once a paid order includes a course."
        />
      </ChartSection>

      <InsightsPanel insights={buildInsights(data)} />
    </div>
  );
}
