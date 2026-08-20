import { useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileText } from "@phosphor-icons/react/FileText";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import type { OrderHistoryItem, OrderHistoryStatus } from "./orderHistoryData";

export interface OrderHistoryTableProps {
  orders: readonly OrderHistoryItem[];
  onViewInvoice: (order: OrderHistoryItem) => void;
  setNotice?: (message: string) => void;
}

export function OrderHistoryTable({
  orders,
  onViewInvoice,
  setNotice,
}: OrderHistoryTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const getStatusBadgeStyle = (status: OrderHistoryStatus) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "processing":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "failed":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "refunded":
        return "bg-slate-500/15 text-slate-300 border-slate-500/30";
      case "canceled":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    }
  };

  const renderPaymentBadge = (payment: OrderHistoryItem["payment"]) => {
    switch (payment.type) {
      case "visa":
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-[#1a1f71] px-1.5 py-0.5 text-[10px] font-extrabold text-white tracking-wider">
              VISA
            </span>
            <span className="text-xs text-[var(--muted)] font-mono">
              {payment.label}
            </span>
          </div>
        );
      case "mastercard":
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5 rounded bg-[#eb001b]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#eb001b]">
              <span className="h-2 w-2 rounded-full bg-[#eb001b]" />
              <span className="h-2 w-2 rounded-full bg-[#f79e1b] -ml-1" />
            </span>
            <span className="text-xs text-[var(--muted)] font-mono">
              {payment.label}
            </span>
          </div>
        );
      case "upi":
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
              UPI
            </span>
            <span className="text-xs text-[var(--muted)] truncate max-w-[130px]">
              {payment.label}
            </span>
          </div>
        );
      case "paypal":
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
              PayPal
            </span>
            <span className="text-xs text-[var(--muted)] truncate max-w-[130px]">
              {payment.label}
            </span>
          </div>
        );
    }
  };

  const handleCopyOrderId = (order: OrderHistoryItem) => {
    setOpenMenuId(null);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(order.orderNumber);
      setNotice?.(`Order ID ${order.orderNumber} copied to clipboard.`);
    }
  };

  const handleCopyInvoice = (order: OrderHistoryItem) => {
    setOpenMenuId(null);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(order.invoiceNumber);
      setNotice?.(`Invoice ${order.invoiceNumber} copied to clipboard.`);
    }
  };

  const handleDownload = (order: OrderHistoryItem) => {
    setOpenMenuId(null);
    setNotice?.(`Receipt for order ${order.orderNumber} downloaded.`);
  };

  return (
    <>
      {/* Desktop Table View (Visible on md screens and up) */}
      <div
        className="hidden md:block rounded-[18px] border border-[var(--border)] bg-[var(--card-surface-raised,var(--surface))] overflow-hidden transition-all"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold tracking-wider text-[var(--muted)] uppercase">
                <th className="py-3.5 px-5">ORDER</th>
                <th className="py-3.5 px-4">COURSE / ITEM</th>
                <th className="py-3.5 px-4">DATE</th>
                <th className="py-3.5 px-4">PAYMENT METHOD</th>
                <th className="py-3.5 px-4">AMOUNT</th>
                <th className="py-3.5 px-4">STATUS</th>
                <th className="py-3.5 px-5 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] text-xs md:text-sm">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="transition-colors hover:bg-[var(--hover)] group"
                >
                  {/* Order ID & Badge */}
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ backgroundColor: order.iconColor }}
                        aria-hidden="true"
                      >
                        <ShoppingBag size={19} weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs md:text-sm text-[var(--text)] tracking-tight font-mono">
                          {order.orderNumber}
                        </div>
                        <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                          {order.invoiceNumber}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Course Title & Item Count */}
                  <td className="py-4 px-4">
                    <div className="min-w-0 max-w-[220px]">
                      <div className="truncate font-bold text-xs md:text-sm text-[var(--text)]">
                        {order.courseTitle}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {order.itemCount}
                      </div>
                    </div>
                  </td>

                  {/* Date & Time */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="font-medium text-xs md:text-sm text-[var(--text-secondary)]">
                      {order.date}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      {order.time}
                    </div>
                  </td>

                  {/* Payment Method */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    {renderPaymentBadge(order.payment)}
                  </td>

                  {/* Amount */}
                  <td className="py-4 px-4 font-extrabold text-sm md:text-base text-[var(--text)] whitespace-nowrap">
                    {order.formattedAmount}
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusBadgeStyle(
                        order.status,
                      )}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      <span>{order.statusLabel}</span>
                    </span>
                  </td>

                  {/* Action Menu */}
                  <td className="py-4 px-5 text-right relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId(openMenuId === order.id ? null : order.id)
                      }
                      aria-label={`Options for ${order.orderNumber}`}
                      aria-expanded={openMenuId === order.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition-colors cursor-pointer"
                    >
                      <DotsThreeVertical size={18} weight="bold" />
                    </button>

                    {openMenuId === order.id && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div
                          role="menu"
                          className="absolute right-5 top-full mt-1 z-30 min-w-[175px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-1.5 shadow-xl backdrop-blur-md text-left animate-in fade-in zoom-in-95 duration-100"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              onViewInvoice(order);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                          >
                            <FileText size={15} />
                            <span>View invoice</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleCopyOrderId(order)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                          >
                            <LinkSimple size={15} />
                            <span>Copy Order ID</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleCopyInvoice(order)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                          >
                            <LinkSimple size={15} />
                            <span>Copy Invoice ID</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleDownload(order)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                          >
                            <DownloadSimple size={15} />
                            <span>Download receipt</span>
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List View (Visible on small screens) */}
      <div className="flex flex-col gap-3 md:hidden">
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-[18px] border border-[var(--border)] bg-[var(--card-surface-raised,var(--surface))] p-4 transition-all"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            {/* Top Row: Icon + Order ID & Date + Options */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: order.iconColor }}
                  aria-hidden="true"
                >
                  <ShoppingBag size={19} weight="duotone" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-xs text-[var(--text)] font-mono">
                    {order.orderNumber}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">
                    {order.date} • {order.time}
                  </div>
                </div>
              </div>

              {/* Action Menu */}
              <button
                type="button"
                onClick={() => onViewInvoice(order)}
                aria-label={`View invoice for ${order.orderNumber}`}
                className="text-[var(--muted)] hover:text-[var(--text)] p-1 cursor-pointer"
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>
            </div>

            {/* Course Title & Item Count */}
            <div className="mt-3">
              <h3 className="font-bold text-sm text-[var(--text)]">
                {order.courseTitle}
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {order.itemCount}
              </p>
            </div>

            {/* Bottom Row: Price + Status */}
            <div className="mt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] pt-3">
              <div className="font-extrabold text-base text-[var(--text)]">
                {order.formattedAmount}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusBadgeStyle(
                  order.status,
                )}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>{order.statusLabel}</span>
              </span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
