import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CreditCard } from "@phosphor-icons/react/CreditCard";
import { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileText } from "@phosphor-icons/react/FileText";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import type { OrderItem, OrderStatus } from "./ordersData";

export interface OrderCardProps {
  order: OrderItem;
  onViewReceipt: (order: OrderItem) => void;
  setNotice?: (message: string) => void;
}

export function OrderCard({
  order,
  onViewReceipt,
  setNotice,
}: OrderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

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
      className="group relative rounded-[18px] border border-[var(--border)] bg-[var(--card-surface-raised,var(--surface))] p-4 md:p-5 transition-all duration-200 hover:bg-[var(--card-surface-hover,var(--hover))]"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between min-w-0">
        {/* Left: Badge + Course Title & Order ID */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div
            className="flex h-11 w-11 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold text-xs sm:text-sm shadow-sm"
            style={{
              backgroundColor: order.badgeColor,
              color: order.badgeTextColor || "#ffffff",
            }}
            aria-hidden="true"
          >
            {order.badgeText}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-sm sm:text-base text-[var(--text)] tracking-tight">
              {order.courseTitle}
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">
              Order ID: {order.orderNumber}
            </p>
          </div>
        </div>

        {/* Right Info Group: Date, Payment, Price, Status, Options */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-6 text-xs sm:text-sm flex-shrink-0">
          {/* Date & Payment Method */}
          <div className="flex flex-col gap-0.5 min-w-[90px]">
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
              <CalendarBlank size={14} className="text-[var(--muted)] flex-shrink-0" />
              <span>{order.date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <CreditCard size={13} className="text-[var(--muted)] flex-shrink-0" />
              <span>{order.paymentMethod}</span>
            </div>
          </div>

          {/* Price */}
          <div className="text-right font-extrabold text-base sm:text-lg text-[var(--text)] min-w-[65px]">
            {order.formattedPrice}
          </div>

          {/* Status Badge */}
          <div className="min-w-[85px] flex justify-end">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getStatusBadgeStyle(
                order.status,
              )}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>{order.statusLabel}</span>
            </span>
          </div>

          {/* More Actions Menu */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`Options for order ${order.orderNumber}`}
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-30 min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onViewReceipt(order);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                  >
                    <FileText size={14} />
                    <span>View invoice</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyOrderId}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
                  >
                    <LinkSimple size={14} />
                    <span>Copy Order ID</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDownload}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] cursor-pointer"
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
