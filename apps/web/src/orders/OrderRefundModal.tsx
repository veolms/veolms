import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Order } from "@veolms/contracts";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { useRefundOrder } from "../services/orders";
import { getApiError } from "../lib/api-error";
import { formatCurrency } from "./orderHelpers";

// 3D design system surface tokens: 0 borders, pure tactile depth via theme-adaptive shadows & highlights
const MODAL_FRAME_CLASS =
  "relative flex max-h-[calc(100dvh-16px)] w-full max-w-[480px] min-w-0 flex-col overflow-hidden rounded-[20px] sm:rounded-[24px] border-none bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] sm:max-h-[calc(100dvh-32px)]";

const RAISED_CARD_CLASS =
  "rounded-[14px] sm:rounded-[16px] border-none bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) shadow-(--card-shadow,var(--surface-depth-shadow))";

const SECONDARY_ACTION_CLASS =
  "inline-flex h-9.5 items-center justify-center rounded-[10px] border-none bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--surface))] active:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] px-5 text-[0.82rem] font-semibold text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))] transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap";

export interface OrderRefundModalProps {
  order: Order | null;
  onClose: () => void;
  setNotice?: (message: string) => void;
}

export const OrderRefundModal = memo(function OrderRefundModal({
  order,
  onClose,
  setNotice,
}: OrderRefundModalProps) {
  const refundMutation = useRefundOrder();

  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmountInr, setPartialAmountInr] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [preserveAccess, setPreserveAccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lock body scroll and listen for ESC key
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!order) return null;

  const totalPaidInr = Math.round(order.totalAmount / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    let amountPaise: number | undefined;
    if (refundType === "partial") {
      const parsedInr = parseFloat(partialAmountInr);
      if (isNaN(parsedInr) || parsedInr <= 0) {
        setErrorMessage("Please enter a valid partial refund amount.");
        return;
      }
      if (parsedInr > totalPaidInr) {
        setErrorMessage(`Partial refund cannot exceed total paid amount (₹${totalPaidInr}).`);
        return;
      }
      amountPaise = Math.round(parsedInr * 100);
    }

    try {
      await refundMutation.mutateAsync({
        orderId: order.id,
        payload: {
          amount: amountPaise,
          reason: reason.trim() || undefined,
          preserveAccess,
        },
      });

      setNotice?.(`Refund processed successfully for order ${order.orderNumber}.`);
      onClose();
    } catch (err) {
      setErrorMessage(getApiError(err).message || "Failed to process refund.");
    }
  };

  const content = (
    <div
      className="animate-in fade-in fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-[8px] duration-150 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-modal-title"
      onClick={onClose}
    >
      <div
        className={`${MODAL_FRAME_CLASS} animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-none bg-[linear-gradient(145deg,color-mix(in_srgb,#f43f5e_22%,var(--surface))_0%,color-mix(in_srgb,#f43f5e_10%,var(--canvas))_100%)] text-rose-500 shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_12%,transparent))] sm:h-9 sm:w-9">
              <ArrowCounterClockwise size={19} weight="bold" />
            </div>
            <div className="min-w-0">
              <h2
                id="refund-modal-title"
                className="m-0 truncate text-[0.98rem] font-semibold tracking-[-0.01em] text-(--text) sm:text-[1.05rem]"
              >
                Issue Refund
              </h2>
              <p className="m-0 mt-0.5 truncate font-mono text-[0.72rem] text-(--muted) sm:text-[0.74rem]">
                Order #{order.orderNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent),0_1px_2px_color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] hover:text-(--text) active:scale-95"
            aria-label="Close refund dialog"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-[12px] border-none bg-rose-500/12 p-3 text-[0.76rem] leading-snug font-semibold text-rose-400 shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,black_15%,transparent))] sm:p-3.5"
              >
                <WarningCircle size={18} weight="fill" className="shrink-0 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Refund Type Selection */}
            <div>
              <label className="mb-2 block text-[0.78rem] font-semibold text-(--text-secondary)">
                Refund Type
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRefundType("full")}
                  className={`cursor-pointer rounded-[14px] p-3 text-left transition-all sm:p-3.5 ${
                    refundType === "full"
                      ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-(--text) shadow-[inset_0_0_0_1.5px_var(--accent),var(--card-shadow,0_4px_12px_rgba(0,0,0,0.2))]"
                      : `${RAISED_CARD_CLASS} text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_6%,var(--surface))]`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[0.82rem] font-bold text-(--text)">Full Refund</span>
                    {refundType === "full" && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-(--accent) text-(--on-accent,#ffffff)">
                        <Check size={10} weight="bold" />
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-[0.74rem] font-medium text-(--muted) tabular-nums">
                    {formatCurrency(order.totalAmount, order.currency)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRefundType("partial")}
                  className={`cursor-pointer rounded-[14px] p-3 text-left transition-all sm:p-3.5 ${
                    refundType === "partial"
                      ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-(--text) shadow-[inset_0_0_0_1.5px_var(--accent),var(--card-shadow,0_4px_12px_rgba(0,0,0,0.2))]"
                      : `${RAISED_CARD_CLASS} text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_6%,var(--surface))]`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[0.82rem] font-bold text-(--text)">Partial Refund</span>
                    {refundType === "partial" && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-(--accent) text-(--on-accent,#ffffff)">
                        <Check size={10} weight="bold" />
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-[0.74rem] font-medium text-(--muted)">
                    Custom amount
                  </span>
                </button>
              </div>
            </div>

            {/* Custom Amount Field (if partial) */}
            {refundType === "partial" && (
              <div className="animate-in fade-in duration-150">
                <label
                  htmlFor="refund-amount"
                  className="mb-1.5 block text-[0.78rem] font-semibold text-(--text-secondary)"
                >
                  Refund Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[0.84rem] font-semibold text-(--muted)">
                    ₹
                  </span>
                  <input
                    id="refund-amount"
                    type="number"
                    min="1"
                    max={totalPaidInr}
                    step="1"
                    placeholder={`Max ₹${totalPaidInr}`}
                    value={partialAmountInr}
                    onChange={(e) => setPartialAmountInr(e.target.value)}
                    className="w-full rounded-[12px] border-none bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] py-2.5 pr-3.5 pl-8 text-[0.82rem] text-(--text) shadow-[inset_0_2px_4px_color-mix(in_srgb,black_20%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] transition-all outline-none placeholder:text-(--muted) focus:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)] sm:text-[0.85rem]"
                    required
                  />
                </div>
              </div>
            )}

            {/* Reason Field */}
            <div>
              <label
                htmlFor="refund-reason"
                className="mb-1.5 block text-[0.78rem] font-semibold text-(--text-secondary)"
              >
                Reason (Optional)
              </label>
              <textarea
                id="refund-reason"
                rows={2}
                placeholder="e.g. Student requested cancellation within guarantee window"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full resize-none rounded-[12px] border-none bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] p-3 text-[0.82rem] text-(--text) shadow-[inset_0_2px_4px_color-mix(in_srgb,black_20%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] transition-all outline-none placeholder:text-(--muted) focus:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)] sm:text-[0.85rem]"
              />
            </div>

            {/* Preserve Access Checkbox */}
            <label className="flex cursor-pointer items-center gap-2.5 text-[0.78rem] text-(--text-secondary) transition-colors select-none hover:text-(--text) sm:text-[0.82rem]">
              <input
                type="checkbox"
                checked={preserveAccess}
                onChange={(e) => setPreserveAccess(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded-[5px] border-none bg-[color-mix(in_srgb,var(--text)_15%,var(--surface))] text-(--accent) accent-(--accent) focus:ring-0"
              />
              <span>Preserve student course access after refund</span>
            </label>
          </div>

          {/* Footer Action Bar */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] px-4 py-3 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={refundMutation.isPending}
              className={SECONDARY_ACTION_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={refundMutation.isPending}
              className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none bg-rose-600 px-5 text-[0.82rem] font-bold whitespace-nowrap text-white shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(225,29,72,0.35)] transition-all duration-150 hover:bg-rose-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refundMutation.isPending && <CircleNotch size={14} className="animate-spin" />}
              <span>Confirm Refund</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
});
