import { memo, useState } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { getApiError } from "../lib/api-error";
import { useRejectManualPayment } from "../services/payments";
import { ASK_ADMIN_TO_REJECT_TRANSFER } from "./needsRefundHelpers";

export interface RejectTransferRequestActionProps {
  /**
   * Whether the viewer may reject transfer requests (`payment.manual.verify`). Anyone
   * else is told to ask an admin, in the button's place.
   */
  canReject: boolean;
  /** The manual payment request to reject. */
  requestId: string;
  /** The order it was reported for, as the row shows it: "#ORD-...". */
  orderNumber: string;
  /**
   * Kept with the request, so the review queue says why it was closed: the
   * order was paid another way, was cancelled, or failed.
   */
  adminNotes: string;
  setNotice?: (message: string) => void;
}

const actionClass =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50";
const neutralClass =
  "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_80%,transparent)] text-(--muted) hover:border-(--accent) hover:text-(--accent)";
const dangerClass =
  "border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20";
// On a span: the app's buttons inherit their font, so size and weight set
// on the button itself would not apply.
const labelClass = "text-[11px] font-semibold";

/**
 * Closes a transfer a learner reported for an order that was then paid
 * another way, cancelled or failed: the last step of dealing with one,
 * after the bank account has been checked and anything that arrived has
 * been sent back (or the learner has been asked to buy again). Asks once
 * more first, because a rejected request cannot be reopened. Rejecting
 * changes nothing else: the order, its payment and the learner's access
 * stay as they are.
 *
 * Every state is one row of the same height, on purpose: the orders table
 * below is positioned from its measured distance to the top of the page,
 * and that is only measured again when the number of entries changes.
 */
export const RejectTransferRequestAction = memo(
  function RejectTransferRequestAction({
    canReject,
    requestId,
    orderNumber,
    adminNotes,
    setNotice,
  }: RejectTransferRequestActionProps) {
    const rejectRequest = useRejectManualPayment();
    const [confirming, setConfirming] = useState(false);

    // Awaited rather than given callbacks: the row is gone from the list by
    // the time this settles, and callbacks of an unmounted row do not run.
    const reject = async () => {
      try {
        await rejectRequest.mutateAsync({ requestId, adminNotes });
        setNotice?.(`Transfer request for order ${orderNumber} rejected.`);
      } catch (error) {
        setConfirming(false);
        setNotice?.(
          getApiError(error).message ||
            "The request could not be rejected. Please try again.",
        );
      }
    };

    if (!canReject) {
      return (
        <p className={`flex h-7 items-center text-(--muted) ${labelClass}`}>
          {ASK_ADMIN_TO_REJECT_TRANSFER}
        </p>
      );
    }

    if (!confirming) {
      return (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${actionClass} ${neutralClass}`}
        >
          <span className={labelClass}>Reject request</span>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void reject()}
          disabled={rejectRequest.isPending}
          title="A rejected request cannot be reopened"
          className={`${actionClass} ${dangerClass}`}
        >
          {rejectRequest.isPending && (
            <CircleNotch
              size={12}
              className="animate-spin"
              aria-hidden="true"
            />
          )}
          <span className={labelClass}>Yes, reject for good</span>
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={rejectRequest.isPending}
          className={`${actionClass} ${neutralClass}`}
        >
          <span className={labelClass}>Cancel</span>
        </button>
      </div>
    );
  },
);
