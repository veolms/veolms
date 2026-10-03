import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useBackDismiss } from "../navigation/useBackDismiss";
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
  useBackDismiss({ open: isOpen && order !== null, onDismiss: onClose });

  if (!isOpen || !order) return null;

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div
        className="animate-in zoom-in-95 w-full max-w-lg rounded-[20px] border border-(--border) bg-(--card-surface) p-6 shadow-2xl duration-150"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)">
              <Receipt size={22} weight="duotone" />
            </div>
            <div>
              <h2
                id="receipt-modal-title"
                className="text-lg font-bold tracking-tight text-(--text)"
              >
                Payment Receipt
              </h2>
              <p className="text-xs text-(--muted)">Invoice {order.invoiceNumber}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="cursor-pointer rounded-lg p-1.5 text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Course Card Preview */}
        <div className="mt-4 flex items-center gap-3.5 rounded-[14px] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm"
            style={{
              backgroundColor: order.badgeColor,
              color: order.badgeTextColor || "#ffffff",
            }}
            aria-hidden="true"
          >
            {order.badgeText}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-(--text)">{order.courseTitle}</h3>
            <p className="mt-0.5 text-xs text-(--muted)">Order ID: {order.orderNumber}</p>
          </div>
        </div>

        {/* Transaction Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-(--card-surface-raised,var(--hover)) p-3">
            <span className="block text-(--muted)">Transaction Date</span>
            <strong className="mt-1 block font-semibold text-(--text)">{order.date}</strong>
          </div>
          <div className="rounded-xl bg-(--card-surface-raised,var(--hover)) p-3">
            <span className="block text-(--muted)">Payment Method</span>
            <strong className="mt-1 block font-semibold text-(--text)">
              {order.paymentMethod}
            </strong>
          </div>
          <div className="col-span-2 rounded-xl bg-(--card-surface-raised,var(--hover)) p-3 sm:col-span-1">
            <span className="block text-(--muted)">Transaction ID</span>
            <strong className="mt-1 block truncate font-mono text-[11px] text-(--text)">
              {order.transactionId}
            </strong>
          </div>
          <div className="col-span-2 rounded-xl bg-(--card-surface-raised,var(--hover)) p-3 sm:col-span-1">
            <span className="block text-(--muted)">Payment Status</span>
            <div className="mt-1 flex items-center gap-1.5">
              <CheckCircle size={15} weight="fill" className="text-emerald-400" />
              <strong className="font-semibold text-(--text)">{order.statusLabel}</strong>
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="mt-4 rounded-xl border border-(--border) p-4 text-xs">
          <div className="flex justify-between py-1 text-(--text-secondary)">
            <span>Course Subtotal</span>
            <span>₹{order.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1 text-(--muted)">
            <span>Estimated GST / Taxes (18%)</span>
            <span>₹{order.tax.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] pt-2 text-sm font-bold text-(--text)">
            <span>Total Amount Paid</span>
            <span className="text-(--accent)">{order.formattedPrice}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl px-4 py-2.5 text-xs font-semibold text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) md:text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => onDownloadReceipt?.(order)}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-(--accent) px-4 py-2.5 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm transition-opacity hover:opacity-90 md:text-sm"
          >
            <DownloadSimple size={16} weight="bold" />
            <span>Download receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
