import { useId, useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { XIcon as X } from "@phosphor-icons/react/X";

import { useBackDismiss } from "../navigation/useBackDismiss";
import type { OrderHistoryItem } from "./orderHistoryData";

export interface RefundRequestDialogProps {
  order: OrderHistoryItem | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Confirms a refund before it is asked for: an eligible purchase is
 * refunded at once and its course taken away, so the learner is told so
 * first. A purchase paid by bank transfer goes to staff instead.
 */
export function RefundRequestDialog({
  order,
  submitting,
  error,
  onCancel,
  onConfirm,
}: RefundRequestDialogProps) {
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const open = order !== null;
  useBackDismiss({ open, onDismiss: onCancel });

  if (!order) return null;
  const manualTransfer = order.refund?.manualTransfer ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        className="w-full max-w-md rounded-[20px] border border-(--border) bg-(--card-surface) p-6 shadow-2xl animate-in zoom-in-95 duration-150"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitting) onConfirm(reason.trim());
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)"
              aria-hidden="true"
            >
              <ArrowCounterClockwise size={21} weight="bold" />
            </span>
            <h2
              id={titleId}
              className="text-lg font-bold tracking-tight text-(--text)"
            >
              Request a refund?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 text-sm font-semibold text-(--text)">
          {order.courseTitle}
          <span className="font-mono text-(--muted)">
            {" "}
            · {order.formattedAmount}
          </span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
          {manualTransfer
            ? `We'll send ${order.formattedAmount} back by bank transfer and let you know when it's done. Your access to this course ends when the refund is made.`
            : `${order.formattedAmount} goes back to your original payment method, usually within 5 to 10 business days. You'll lose access to this course straight away.`}
        </p>

        <label
          htmlFor={reasonId}
          className="mt-4 block text-xs font-semibold text-(--text-secondary)"
        >
          Tell us why (optional)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-xl border border-(--border) bg-(--canvas) px-3 py-2 text-sm text-(--text) outline-none placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20"
          placeholder="What could have been better?"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="cursor-pointer rounded-xl border border-(--border) px-4 py-2.5 text-sm font-semibold text-(--text) transition-colors hover:bg-(--hover)"
          >
            Keep my course
          </button>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting && (
              <CircleNotch size={15} className="animate-spin" aria-hidden />
            )}
            {manualTransfer
              ? "Request refund"
              : `Refund ${order.formattedAmount}`}
          </button>
        </div>
      </form>
    </div>
  );
}
