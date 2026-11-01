import type {
  AdminOrder,
  OutsideRefund,
  RefundRequest,
  ReviewRefundRequest,
} from "@veolms/contracts";

/** Longest transfer reference the refund endpoint accepts. */
export const OUTSIDE_REFUND_REFERENCE_MAX_LENGTH = 100;

/**
 * What staff are told wherever a refund of an order paid by manual transfer
 * is recorded: the refund dialog, and approving a learner's refund request.
 */
export const OUTSIDE_REFUND_EXPLANATION =
  "No money is moved by the app. Send the refund to the student yourself, then record it here.";

/** The label of the field the reference of that transfer is typed in. */
export const OUTSIDE_REFUND_REFERENCE_LABEL = "Transfer Reference";

/**
 * Whether the order's payment arrived by manual bank or UPI transfer. Such
 * an order has no gateway payment: staff return the money themselves and the
 * refund dialog only records it.
 */
export function isPaidByManualTransfer(order: Pick<AdminOrder, "admin">) {
  return order.admin.payment?.gatewayProvider === "manual";
}

export type OutsideRefundInput =
  | { ok: true; outsideRefund: OutsideRefund | undefined }
  | { ok: false; message: string };

/**
 * The `outsideRefund` part of a refund request. Sent only for an order paid
 * by manual transfer, where the reference of the transfer staff made is
 * required; left out for every other order, whatever was typed.
 */
export function toOutsideRefundInput(
  paidByManualTransfer: boolean,
  referenceInput: string,
): OutsideRefundInput {
  if (!paidByManualTransfer) return { ok: true, outsideRefund: undefined };

  const reference = referenceInput.trim();
  if (!reference) {
    return {
      ok: false,
      message: "Please enter the reference of the transfer you made.",
    };
  }
  if (reference.length > OUTSIDE_REFUND_REFERENCE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Transfer reference cannot be longer than ${OUTSIDE_REFUND_REFERENCE_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, outsideRefund: { reference } };
}

/**
 * Whether a learner's refund request is for an order paid by manual
 * transfer. Approving such a request records a refund staff made
 * themselves, so the approval asks for the reference of that transfer.
 */
export function isRefundRequestPaidByManualTransfer(
  request: Pick<RefundRequest, "paidByManualTransfer">,
) {
  return request.paidByManualTransfer === true;
}

/** What staff chose and typed when answering a learner's refund request. */
export interface RefundRequestDecision {
  action: ReviewRefundRequest["action"];
  adminNotes: string;
  preserveAccess: boolean;
  /** The transfer reference field; only read when it applies. */
  referenceInput: string;
}

export type RefundRequestReviewInput =
  { ok: true; review: ReviewRefundRequest } | { ok: false; message: string };

/**
 * The body sent to review a learner's refund request. Approving a request
 * on an order paid by manual transfer is one step: the reference of the
 * transfer staff made goes with the approval, under the same rules as the
 * refund dialog. A rejection, or an approval of any other order, never
 * carries a reference, whatever was typed.
 */
export function toRefundRequestReviewInput(
  request: Pick<RefundRequest, "paidByManualTransfer">,
  decision: RefundRequestDecision,
): RefundRequestReviewInput {
  const adminNotes = decision.adminNotes.trim() || undefined;

  if (decision.action === "reject") {
    return {
      ok: true,
      review: { action: "reject", adminNotes, preserveAccess: false },
    };
  }

  const outside = toOutsideRefundInput(
    isRefundRequestPaidByManualTransfer(request),
    decision.referenceInput,
  );
  if (!outside.ok) return outside;

  return {
    ok: true,
    review: {
      action: "approve",
      adminNotes,
      preserveAccess: decision.preserveAccess,
      outsideRefund: outside.outsideRefund,
    },
  };
}
