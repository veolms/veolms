import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { X } from "@phosphor-icons/react/X";
import type { OrderItem } from "./ordersData";

export interface OrderReceiptModalProps {
  order: OrderItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadReceipt?: (order: OrderItem) => void;
}

export function OrderReceiptModal({
  order,
  isOpen,
  onClose,
  onDownloadReceipt,
}: OrderReceiptModalProps) {
  if (!isOpen || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
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
                id="receipt-modal-title"
                className="text-lg font-bold text-[var(--text)] tracking-tight"
              >
                Payment Receipt
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Invoice {order.invoiceNumber}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Course Card Preview */}
        <div className="mt-4 flex items-center gap-3.5 rounded-[14px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl font-bold text-sm shadow-sm"
            style={{
              backgroundColor: order.badgeColor,
              color: order.badgeTextColor || "#ffffff",
            }}
            aria-hidden="true"
          >
            {order.badgeText}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-sm text-[var(--text)]">
              {order.courseTitle}
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Order ID: {order.orderNumber}
            </p>
          </div>
        </div>

        {/* Transaction Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3">
            <span className="text-[var(--muted)] block">Transaction Date</span>
            <strong className="text-[var(--text)] font-semibold mt-1 block">
              {order.date}
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3">
            <span className="text-[var(--muted)] block">Payment Method</span>
            <strong className="text-[var(--text)] font-semibold mt-1 block">
              {order.paymentMethod}
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3 col-span-2 sm:col-span-1">
            <span className="text-[var(--muted)] block">Transaction ID</span>
            <strong className="text-[var(--text)] font-mono text-[11px] mt-1 block truncate">
              {order.transactionId}
            </strong>
          </div>
          <div className="rounded-xl bg-[var(--card-surface-raised,var(--hover))] p-3 col-span-2 sm:col-span-1">
            <span className="text-[var(--muted)] block">Payment Status</span>
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
            <span>₹{order.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1 text-[var(--muted)]">
            <span>Estimated GST / Taxes (18%)</span>
            <span>₹{order.tax.toLocaleString()}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] flex justify-between text-sm font-bold text-[var(--text)]">
            <span>Total Amount Paid</span>
            <span className="text-[var(--accent)]">{order.formattedPrice}</span>
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
