import { useState } from "react";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { HeadsetIcon as Headset } from "@phosphor-icons/react/Headset";
import type { Order, OrderSortOrder } from "@veolms/contracts";
import {
  CourseActionMenu,
  MenuAction,
  MenuDivider,
} from "../courses/CourseActionMenu";
import { useBackDismiss } from "../navigation/useBackDismiss";
import {
  formatCurrency,
  formatOrderDate,
  getCourseBrandBadge,
  getOrderStatusStyle,
} from "../orders/orderHelpers";

export interface OrderHistoryTableProps {
  orders: readonly Order[];
  sortOrder: OrderSortOrder;
  onToggleSortOrder: () => void;
  onDownloadInvoice: (order: Order) => void;
  onViewCourse: (order: Order) => void;
  onGetSupport: (order: Order) => void;
}

function firstCourse(order: Order) {
  return order.items?.find((item) => item.courseId) ?? order.items?.[0];
}

function formatMethod(order: Order) {
  const summary = order.paymentSummary;
  if (!summary) return order.totalAmount === 0 ? "Free order" : "Not available";
  const method = summary.method.replace(/[_-]+/g, " ").trim();
  const normalizedMethod = method.toLowerCase();
  const methodLabel =
    normalizedMethod === "upi"
      ? "UPI"
      : normalizedMethod === "netbanking"
        ? "Net banking"
        : normalizedMethod === "card"
          ? "Card"
          : normalizedMethod === "wallet"
            ? "Wallet"
            : method || "Payment";
  const detail = summary.detail?.replace(/[_-]+/g, " ").trim();
  return {
    provider: summary.gatewayProvider,
    method: detail ? methodLabel + " (" + detail + ")" : methodLabel,
  };
}

export function OrderHistoryTable({
  orders,
  sortOrder,
  onToggleSortOrder,
  onDownloadInvoice,
  onViewCourse,
  onGetSupport,
}: OrderHistoryTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  useBackDismiss({
    open: openMenuId !== null,
    onDismiss: () => setOpenMenuId(null),
  });

  const renderActions = (order: Order, mobile = false) => (
    <CourseActionMenu
      open={openMenuId === (mobile ? "mobile-" : "") + order.id}
      onOpenChange={(open) =>
        setOpenMenuId(open ? (mobile ? "mobile-" : "") + order.id : null)
      }
      ariaLabel={"Actions for order " + order.orderNumber}
      dismissOnScroll
      className="relative z-30 inline-block"
    >
      <MenuAction
        Icon={DownloadSimple}
        label="Download invoice"
        onClick={() => {
          setOpenMenuId(null);
          onDownloadInvoice(order);
        }}
      />
      <MenuAction
        Icon={ArrowSquareOut}
        label="View course"
        onClick={() => {
          setOpenMenuId(null);
          onViewCourse(order);
        }}
      />
      <MenuDivider />
      <MenuAction
        Icon={Headset}
        label="Get support"
        onClick={() => {
          setOpenMenuId(null);
          onGetSupport(order);
        }}
      />
    </CourseActionMenu>
  );

  return (
    <>
      <div
        className="hidden overflow-hidden rounded-[18px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) shadow-(--card-shadow) md:block"
        style={{ boxShadow: "var(--card-shadow)" }}
        aria-label="Purchase history"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-210 border-collapse text-left">
            <thead className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold uppercase tracking-wider text-(--muted) select-none">
              <tr>
                <th scope="col" className="px-5 py-3.5">Course</th>
                <th scope="col" className="px-4 py-3.5">Amount</th>
                <th scope="col" className="px-4 py-3.5">Payment Method</th>
                <th scope="col" className="px-4 py-3.5" aria-sort={sortOrder === "desc" ? "descending" : "ascending"}>
                  <button
                    type="button"
                    onClick={onToggleSortOrder}
                    className="inline-flex items-center gap-1.5 hover:text-(--text) transition-colors cursor-pointer uppercase tracking-wider"
                    title={`Sorted by date ${sortOrder}. Click to reverse.`}
                  >
                    <span>Date</span>
                    {sortOrder === "desc" ? (
                      <ArrowDown size={13} weight="bold" className="text-(--accent)" />
                    ) : (
                      <ArrowUp size={13} weight="bold" className="text-(--accent)" />
                    )}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const item = firstCourse(order);
                const title = item?.titleSnapshot || "Course";
                const brand = getCourseBrandBadge(title);
                const payment = formatMethod(order);
                const date = formatOrderDate(order.createdAt);
                const statusStyle = getOrderStatusStyle(order.status);
                const count = order.items?.length ?? 0;
                return (
                  <tr
                    key={order.id}
                    className="border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] last:border-0 hover:bg-(--hover) transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tracking-tight shadow-xs"
                          style={{
                            backgroundColor: brand.bgColor,
                            color: brand.textColor,
                            border: brand.borderColor ? `1px solid ${brand.borderColor}` : undefined,
                          }}
                        >
                          {brand.label}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-(--text)">{title}</p>
                          {count > 1 && (
                            <p className="mt-0.5 text-xs text-(--muted)">
                              +{count - 1} more item{count > 2 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-sm font-bold text-(--text)">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </td>
                    <td className="px-4 py-3.5">
                      {typeof payment === "string" ? (
                        <span className="text-xs text-(--muted)">{payment}</span>
                      ) : (
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-(--text)">{payment.provider}</p>
                          <p className="truncate text-[11px] text-(--muted)">{payment.method}</p>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-mono text-xs font-medium text-(--text)">{date.dateStr}</p>
                      <p className="font-mono text-[11px] text-(--muted)">{date.timeStr}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle.pillClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
                        <span>{statusStyle.label}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">{renderActions(order)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden" aria-label="Purchase history">
        {orders.map((order) => {
          const item = firstCourse(order);
          const title = item?.titleSnapshot || "Course";
          const brand = getCourseBrandBadge(title);
          const payment = formatMethod(order);
          const date = formatOrderDate(order.createdAt);
          const statusStyle = getOrderStatusStyle(order.status);
          return (
            <article
              key={order.id}
              className="rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-4 transition-all shadow-(--card-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tracking-tight shadow-xs"
                    style={{
                      backgroundColor: brand.bgColor,
                      color: brand.textColor,
                      border: brand.borderColor ? `1px solid ${brand.borderColor}` : undefined,
                    }}
                  >
                    {brand.label}
                  </span>
                  <h2 className="min-w-0 break-words text-sm font-semibold text-(--text)">{title}</h2>
                </div>
                {renderActions(order, true)}
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] pt-3 text-xs">
                <div>
                  <p className="text-[11px] text-(--muted)">Amount</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-(--text)">
                    {formatCurrency(order.totalAmount, order.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-(--muted)">Date</p>
                  <p className="mt-0.5 font-mono text-xs text-(--text)">
                    {date.dateStr}<br />
                    <span className="text-(--muted)">{date.timeStr}</span>
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-(--muted)">Payment method</p>
                  {typeof payment === "string" ? (
                    <p className="mt-0.5 text-xs text-(--text)">{payment}</p>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-(--text)">
                      {payment.provider}<br />
                      <span className="text-[11px] text-(--muted)">{payment.method}</span>
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-(--muted)">Status</p>
                  <span
                    className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle.pillClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
                    <span>{statusStyle.label}</span>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
