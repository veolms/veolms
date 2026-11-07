import { useId, useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import type { LearnerOrderRefund } from "@veolms/contracts";

import { MenuAction } from "../courses/CourseActionMenu";

interface RefundMenuState {
  label: string;
  enabled: boolean;
  /** Why it cannot be chosen, shown on hover, focus or tap. */
  reasons: string[];
}

/** What a purchase's refund option says, and whether it can be chosen. */
export function refundMenuState(refund: LearnerOrderRefund): RefundMenuState {
  switch (refund.requestStatus) {
    case "pending":
      return {
        label: "Refund requested",
        enabled: false,
        reasons: [
          refund.manualTransfer
            ? "We'll send your money back by bank transfer and let you know."
            : "We're processing your refund.",
        ],
      };
    case "rejected":
      return {
        label: "Refund declined",
        enabled: false,
        reasons: [
          "Your refund request was declined. Use Get support if you have questions.",
        ],
      };
    case "approved":
    case "cancelled":
      return {
        label: "Refund requested",
        enabled: false,
        reasons: ["A refund has already been requested for this purchase."],
      };
    default:
      return {
        label: "Request refund",
        enabled: refund.eligible,
        reasons: refund.reasons,
      };
  }
}

/**
 * "Request refund" in a purchase's menu. When the purchase cannot be
 * refunded the item stays, greyed out, and says why on hover, on keyboard
 * focus or on a tap (a touch screen has no hover). It is only marked
 * disabled for assistive technology: a disabled button gets no hover or
 * tap at all, so it could not explain itself.
 */
export function RefundMenuItem({
  refund,
  onRequest,
}: {
  refund: LearnerOrderRefund;
  onRequest: () => void;
}) {
  const state = refundMenuState(refund);
  const reasonsId = useId();
  const [showReasons, setShowReasons] = useState(false);

  if (state.enabled) {
    return (
      <MenuAction
        Icon={ArrowCounterClockwise}
        label={state.label}
        onClick={onRequest}
      />
    );
  }

  return (
    <div
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setShowReasons(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setShowReasons(false);
      }}
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled="true"
        aria-describedby={reasonsId}
        className="flex min-h-10 w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 text-left text-[0.78rem] text-(--muted) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
        onClick={(event) => {
          // Not chosen: the menu stays open, and a tap shows or hides why.
          event.stopPropagation();
          setShowReasons((shown) => !shown);
        }}
        onFocus={() => setShowReasons(true)}
        onBlur={() => setShowReasons(false)}
      >
        <ArrowCounterClockwise
          size={17}
          aria-hidden="true"
          className="opacity-60"
        />
        <span className="opacity-60">{state.label}</span>
        <Info size={15} aria-hidden="true" className="ml-auto shrink-0" />
      </button>
      <div
        id={reasonsId}
        role="note"
        hidden={!showReasons}
        className="mx-2 mb-1 space-y-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2.5 py-2 text-[11px] leading-snug text-(--text-secondary)"
      >
        {state.reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </div>
    </div>
  );
}
