import { useState } from "react";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { HeadsetIcon as Headset } from "@phosphor-icons/react/Headset";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import {
  CourseActionMenu,
  MenuAction,
  MenuDivider,
} from "../courses/CourseActionMenu";
import type { NavigateTo } from "../routing/navigation";
import { useBackDismiss } from "../navigation/useBackDismiss";
import type { OrderSortOrder } from "@veolms/contracts";
import type { OrderHistoryItem } from "./orderHistoryData";
import {
  getCourseBrandBadge,
  getOrderStatusStyle,
} from "../orders/orderHelpers";

export interface OrderHistoryTableProps {
  orders: readonly OrderHistoryItem[];
  sortOrder: OrderSortOrder;
  onToggleSortOrder: () => void;
  onViewInvoice: (order: OrderHistoryItem) => void;
  onDownloadReceipt: (order: OrderHistoryItem) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

function OrderActions({
  order,
  open,
  setOpen,
  onViewInvoice,
  onDownloadReceipt,
  onNavigatePage,
  setNotice,
}: {
  order: OrderHistoryItem;
  open: boolean;
  setOpen: (open: boolean) => void;
  onViewInvoice: (order: OrderHistoryItem) => void;
  onDownloadReceipt: (order: OrderHistoryItem) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice?.(message);
    } catch {
      setNotice?.("Clipboard access is unavailable in this browser.");
    }
  };

  return (
    <CourseActionMenu
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`Actions for ${order.orderNumber}`}
      menuLabel={`Order actions for ${order.orderNumber}`}
      className="relative z-30 ml-auto shrink-0 inline-block"
      dismissOnScroll
    >
      <MenuAction
        Icon={FileText}
        label="View invoice"
        onClick={() => {
          setOpen(false);
          onViewInvoice(order);
        }}
      />
      <MenuAction
        Icon={DownloadSimple}
        label="Download invoice"
        onClick={() => {
          setOpen(false);
          onDownloadReceipt(order);
        }}
      />
      <MenuAction
        Icon={Copy}
        label="Copy order ID"
        onClick={() => {
          setOpen(false);
          void copyText(order.orderNumber, "Order ID copied.");
        }}
      />
      <MenuAction
        Icon={LinkSimple}
        label="Copy invoice ID"
        onClick={() => {
          setOpen(false);
          void copyText(order.invoiceNumber, "Invoice ID copied.");
        }}
      />
      {order.courseId && (
        <>
          <MenuDivider />
          <MenuAction
            Icon={Eye}
            label="View course"
            onClick={() => {
              setOpen(false);
              onNavigatePage?.(
                `/courses/${encodeURIComponent(order.courseId)}/overview`,
              );
            }}
          />
        </>
      )}
      <MenuDivider />
      <MenuAction
        Icon={Headset}
        label="Get support"
        onClick={() => {
          setOpen(false);
          setNotice?.(
            `Include order ${order.orderNumber} when asking for help.`,
          );
          onNavigatePage?.("/discussions");
        }}
      />
    </CourseActionMenu>
  );
}

function OrderStatusBadge({ order }: { order: OrderHistoryItem }) {
  const statusStyle = getOrderStatusStyle(order.status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle.pillClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
      <span>{order.statusLabel || statusStyle.label}</span>
    </span>
  );
}

export function OrderHistoryTable({
  orders,
  sortOrder,
  onToggleSortOrder,
  onViewInvoice,
  onDownloadReceipt,
  onNavigatePage,
  setNotice,
}: OrderHistoryTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useBackDismiss({
    open: openMenuId !== null,
    onDismiss: () => setOpenMenuId(null),
  });

  return (
    <div
      className="@container/history min-w-0 overflow-hidden rounded-[18px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) shadow-(--card-shadow)"
      style={{ boxShadow: "var(--card-shadow)" }}
      aria-label="Purchase history"
    >
      {/* Desktop / Tablet Table View */}
      <div className="hidden overflow-x-auto @3xl/history:block">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold uppercase tracking-wider text-(--muted) select-none">
            <tr>
              <th scope="col" className="px-5 py-3.5">
                Course
              </th>
              <th scope="col" className="px-4 py-3.5">
                Amount
              </th>
              <th scope="col" className="px-4 py-3.5">
                Payment method
              </th>
              <th
                scope="col"
                className="px-4 py-3.5"
                aria-sort={sortOrder === "desc" ? "descending" : "ascending"}
              >
                <button
                  type="button"
                  onClick={onToggleSortOrder}
                  className="inline-flex items-center gap-1.5 hover:text-(--text) transition-colors cursor-pointer uppercase tracking-wider"
                  title={`Sorted by date ${sortOrder}. Click to reverse.`}
                >
                  <span>Date</span>
                  {sortOrder === "desc" ? (
                    <ArrowDown
                      size={13}
                      weight="bold"
                      className="text-(--accent)"
                    />
                  ) : (
                    <ArrowUp
                      size={13}
                      weight="bold"
                      className="text-(--accent)"
                    />
                  )}
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                Status
              </th>
              <th scope="col" className="px-5 py-3.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] text-sm text-(--text)">
            {orders.map((order) => {
              const brand = getCourseBrandBadge(order.courseTitle);
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
                          border: brand.borderColor
                            ? `1px solid ${brand.borderColor}`
                            : undefined,
                        }}
                        aria-hidden="true"
                      >
                        {brand.label}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-sm text-(--text)">
                          {order.courseTitle}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-(--muted)">
                          {order.itemCount}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-sm font-bold text-(--text)">
                    {order.formattedAmount}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-(--text)">
                        {order.payment.brand}
                      </p>
                      <p className="truncate text-[11px] text-(--muted)">
                        {order.payment.label}
                      </p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <p className="font-mono text-xs font-medium text-(--text)">
                      {order.date}
                    </p>
                    <p className="font-mono text-[11px] text-(--muted)">
                      {order.time}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <OrderStatusBadge order={order} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <OrderActions
                      order={order}
                      open={openMenuId === order.id}
                      setOpen={(open) => setOpenMenuId(open ? order.id : null)}
                      onViewInvoice={onViewInvoice}
                      onDownloadReceipt={onDownloadReceipt}
                      onNavigatePage={onNavigatePage}
                      setNotice={setNotice}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Feed View */}
      <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] @3xl/history:hidden">
        {orders.map((order) => {
          const brand = getCourseBrandBadge(order.courseTitle);
          return (
            <article
              key={order.id}
              className="p-4 transition-colors hover:bg-(--hover)"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tracking-tight shadow-xs"
                  style={{
                    backgroundColor: brand.bgColor,
                    color: brand.textColor,
                    border: brand.borderColor
                      ? `1px solid ${brand.borderColor}`
                      : undefined,
                  }}
                  aria-hidden="true"
                >
                  {brand.label}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-sm text-(--text)">
                    {order.courseTitle}
                  </h2>
                  <p className="mt-0.5 text-xs text-(--muted)">
                    {order.itemCount}
                  </p>
                </div>
                <OrderActions
                  order={order}
                  open={openMenuId === `mobile-${order.id}`}
                  setOpen={(open) =>
                    setOpenMenuId(open ? `mobile-${order.id}` : null)
                  }
                  onViewInvoice={onViewInvoice}
                  onDownloadReceipt={onDownloadReceipt}
                  onNavigatePage={onNavigatePage}
                  setNotice={setNotice}
                />
              </div>

              <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] pt-3 text-xs">
                <div>
                  <p className="text-[11px] text-(--muted)">Amount</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-(--text)">
                    {order.formattedAmount}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-(--muted)">Date</p>
                  <p className="mt-0.5 font-mono text-xs text-(--text)">
                    {order.date} ·{" "}
                    <span className="text-(--muted)">{order.time}</span>
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-(--muted)">Payment method</p>
                  <p className="mt-0.5 truncate text-xs text-(--text)">
                    {order.payment.brand} ({order.payment.label})
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-(--muted)">Status</p>
                  <div className="mt-0.5">
                    <OrderStatusBadge order={order} />
                  </div>
                </div>
              </div>

              <p className="mt-3 truncate font-mono text-[11px] text-(--muted)">
                Order {order.orderNumber} · Invoice {order.invoiceNumber}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
