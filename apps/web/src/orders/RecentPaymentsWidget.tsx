import { CaretRight } from "@phosphor-icons/react/CaretRight";
import type { RecentPaymentItem } from "./ordersData";

export interface RecentPaymentsWidgetProps {
  payments: readonly RecentPaymentItem[];
  onViewAll?: () => void;
  onOpenBillingHistory?: () => void;
}

export function RecentPaymentsWidget({
  payments,
  onViewAll,
  onOpenBillingHistory,
}: RecentPaymentsWidgetProps) {
  return (
    <section
      aria-labelledby="recent-payments-heading"
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card-surface)] p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3
          id="recent-payments-heading"
          className="font-bold text-base text-[var(--text)] tracking-tight"
        >
          Recent Payments
        </h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
          >
            View all
          </button>
        )}
      </div>

      {/* Payment Rows */}
      <div className="mt-4 flex flex-col gap-3">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--hover)]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-bold text-xs shadow-sm"
                style={{
                  backgroundColor: payment.badgeColor,
                  color: payment.badgeTextColor || "#ffffff",
                }}
                aria-hidden="true"
              >
                {payment.badgeText}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-xs md:text-sm text-[var(--text)]">
                  {payment.courseTitle}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] mt-0.5">
                  <span>{payment.date}</span>
                  <span className="opacity-60">•</span>
                  <span
                    className={
                      payment.status === "completed"
                        ? "text-emerald-400 font-medium"
                        : payment.status === "pending"
                          ? "text-indigo-400 font-medium"
                          : "text-rose-400 font-medium"
                    }
                  >
                    {payment.statusLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right font-bold text-xs md:text-sm text-[var(--text)] flex-shrink-0">
              {payment.formattedPrice}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Link */}
      <div className="mt-4 pt-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)]">
        <button
          type="button"
          onClick={onOpenBillingHistory}
          className="flex w-full items-center justify-between text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer py-1"
        >
          <span>View full billing history</span>
          <CaretRight size={14} weight="bold" />
        </button>
      </div>
    </section>
  );
}
