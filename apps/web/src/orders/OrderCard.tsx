import { useState } from "react";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import type { OrderItem, OrderStatus } from "./ordersData";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface OrderCardProps {
  order: OrderItem;
  onViewReceipt: (order: OrderItem) => void;
  setNotice?: (message: string) => void;
}

export function OrderCard({ order, onViewReceipt, setNotice }: OrderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useBackDismiss({ open: menuOpen, onDismiss: () => setMenuOpen(false) });

  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "pending":
        return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
      case "failed":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "refunded":
        return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    }
  };

  const handleCopyOrderId = () => {
    setMenuOpen(false);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(order.orderNumber);
      setNotice?.(`Order ID ${order.orderNumber} copied to clipboard.`);
    }
  };

  const handleDownload = () => {
    setMenuOpen(false);
    setNotice?.(`Receipt for order ${order.orderNumber} downloaded.`);
  };

  return (
    <article
      id={order.id}
      className="group relative rounded-[18px] border border-(--border) bg-(--card-surface-raised,var(--surface)) p-4 transition-all duration-200 hover:bg-(--card-surface-hover,var(--hover)) md:p-5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex min-w-0 flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Badge + Course Title & Order ID */}
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-sm sm:h-12 sm:w-12 sm:text-sm"
            style={{
              backgroundColor: order.badgeColor,
              color: order.badgeTextColor || "#ffffff",
            }}
            aria-hidden="true"
          >
            {order.badgeText}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold tracking-tight text-(--text) sm:text-base">
              {order.courseTitle}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-(--muted)">Order ID: {order.orderNumber}</p>
          </div>
        </div>

        {/* Right Info Group: Date, Payment, Price, Status, Options */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs sm:justify-end sm:gap-6 sm:text-sm">
          {/* Date & Payment Method */}
          <div className="flex min-w-22.5 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 font-medium text-(--text-secondary)">
              <CalendarBlank size={14} className="shrink-0 text-(--muted)" />
              <span>{order.date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-(--muted)">
              <CreditCard size={13} className="shrink-0 text-(--muted)" />
              <span>{order.paymentMethod}</span>
            </div>
          </div>

          {/* Price */}
          <div className="min-w-16.25 text-right text-base font-extrabold text-(--text) sm:text-lg">
            {order.formattedPrice}
          </div>

          {/* Status Badge */}
          <div className="flex min-w-21.25 justify-end">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeStyle(
                order.status,
              )}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>{order.statusLabel}</span>
            </span>
          </div>

          {/* More Actions Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`Options for order ${order.orderNumber}`}
              aria-expanded={menuOpen}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div
                  role="menu"
                  className="animate-in fade-in zoom-in-95 absolute top-full right-0 z-30 mt-1 min-w-42.5 rounded-xl border border-(--border) bg-(--card-surface) p-1.5 shadow-xl backdrop-blur-md duration-100"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onViewReceipt(order);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover)"
                  >
                    <FileText size={14} />
                    <span>View invoice</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyOrderId}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover)"
                  >
                    <LinkSimple size={14} />
                    <span>Copy Order ID</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDownload}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-(--text) hover:bg-(--hover)"
                  >
                    <DownloadSimple size={14} />
                    <span>Download receipt</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
