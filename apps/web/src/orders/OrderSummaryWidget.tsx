import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Clock } from "@phosphor-icons/react/Clock";
import { PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { XCircle } from "@phosphor-icons/react/XCircle";
import type { OrderSummaryMetrics, OrderTabId } from "./ordersData";

export interface OrderSummaryWidgetProps {
  summary: OrderSummaryMetrics;
  onSelectStatusFilter?: (status: OrderTabId) => void;
}

export function OrderSummaryWidget({
  summary,
  onSelectStatusFilter,
}: OrderSummaryWidgetProps) {
  const metricItems = [
    {
      id: "all" as OrderTabId,
      label: "Total orders",
      value: summary.totalOrders,
      Icon: PlusCircle,
      iconColor: "text-[var(--text-secondary)]",
    },
    {
      id: "completed" as OrderTabId,
      label: "Completed",
      value: summary.completed,
      Icon: CheckCircle,
      iconColor: "text-emerald-400",
    },
    {
      id: "pending" as OrderTabId,
      label: "Pending",
      value: summary.pending,
      Icon: Clock,
      iconColor: "text-indigo-400",
    },
    {
      id: "failed" as OrderTabId,
      label: "Failed",
      value: summary.failed,
      Icon: XCircle,
      iconColor: "text-rose-400",
    },
    {
      id: "refunded" as OrderTabId,
      label: "Refunded",
      value: summary.refunded,
      Icon: ArrowCounterClockwise,
      iconColor: "text-sky-400",
    },
  ];

  return (
    <section
      aria-labelledby="order-summary-heading"
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card-surface)] p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3
          id="order-summary-heading"
          className="font-bold text-base text-[var(--text)] tracking-tight"
        >
          Order Summary
        </h3>
        <span className="text-[var(--accent)]" aria-hidden="true">
          <ChartBar size={20} weight="duotone" />
        </span>
      </div>

      {/* Metric Breakdown Rows */}
      <div className="mt-4 flex flex-col gap-2.5">
        {metricItems.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectStatusFilter?.(item.id)}
              className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs md:text-sm text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Icon size={16} weight="fill" className={item.iconColor} />
                <span>{item.label}</span>
              </div>
              <span className="font-bold text-[var(--text)]">{item.value}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-[color-mix(in_srgb,var(--text)_9%,transparent)]" />

      {/* Total Spent Section with Sparkline */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted)]">Total spent</div>
          <div className="text-2xl font-extrabold tracking-tight text-[var(--text)] mt-0.5">
            {summary.totalSpent}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Across all orders
          </div>
        </div>

        {/* Sparkline Visual SVG */}
        <div className="h-10 w-24 flex-shrink-0" aria-hidden="true">
          <svg viewBox="0 0 100 40" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="orderSpentGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 0 35 Q 25 32, 40 22 T 75 14 T 100 4"
              fill="none"
              stroke="url(#orderSpentGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}
