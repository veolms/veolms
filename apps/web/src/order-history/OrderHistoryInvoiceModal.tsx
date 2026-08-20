import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import { X } from "@phosphor-icons/react/X";
import type { OrderHistoryItem } from "./orderHistoryData";

export interface OrderHistoryInvoiceModalProps {
  order: OrderHistoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadReceipt?: (order: OrderHistoryItem) => void;
}

export function OrderHistoryInvoiceModal({
  order,
  isOpen,
  onClose,
  onDownloadReceipt,
}: OrderHistoryInvoiceModalProps) {
  if (!isOpen || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-history-receipt-title"
    >
      <div
        className="w-full max-w-lg rounded-[20px] border border-[var(--border)] bg-[var(--card-surface)] p-6 shadow-2xl animate-in zoom-in-95 duration-150"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Receipt size={22} weight="duotone" />
            </div>
            <div>
              <h2
                id="order-history-receipt-title"
                className="text-lg font-bold text-[var(--text)] tracking-tight"
              >
                Order Invoice
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Invoice {order.invoiceNumber}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close invoice modal"
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Order Banner */}
        <div className="mt-4 flex items-center gap-3.5 rounded-[14px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: order.iconColor }}
            aria-hidden="true"
          >
            <ShoppingBag size={21} weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-sm text-[var(--text)]">
              {order.courseTitle}
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">
              Order ID: {order.orderNumber}
            </p>
          </div>
        </div>

        {/* Transaction Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3">
            <span className="text-[var(--muted)] block">Date & Time</span>
            <strong className="text-[var(--text)] font-semibold mt-1 block">
              {order.date} • {order.time}
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3">
            <span className="text-[var(--muted)] block">Payment Method</span>
            <strong className="text-[var(--text)] font-semibold mt-1 block">
              {order.payment.brand} ({order.payment.label})
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3 col-span-2 sm:col-span-1">
            <span className="text-[var(--muted)] block">Transaction ID</span>
            <strong className="text-[var(--text)] font-mono text-[11px] mt-1 block truncate">
              {order.transactionId}
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3 col-span-2 sm:col-span-1">
            <span className="text-[var(--muted)] block">Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle size={15} weight="fill" className="text-emerald-400" />
              <strong className="text-[var(--text)] font-semibold">
                {order.statusLabel}
              </strong>
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="mt-4 rounded-xl border border-[var(--border)] p-4 text-xs">
          <div className="flex justify-between py-1 text-[var(--text-secondary)]">
            <span>Course Subtotal</span>
            <span>${order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 text-[var(--muted)]">
            <span>Taxes & Processing Fee (18%)</span>
            <span>${order.tax.toFixed(2)}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] flex justify-between text-sm font-bold text-[var(--text)]">
            <span>Total Paid</span>
            <span className="text-[var(--accent)]">{order.formattedAmount}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-semibold text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => onDownloadReceipt?.(order)}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs md:text-sm font-semibold text-[var(--on-accent,#ffffff)] shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <DownloadSimple size={16} weight="bold" />
            <span>Download receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
