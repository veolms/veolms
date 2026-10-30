import { memo } from "react";
import type { NeedsRefundEntry } from "@veolms/contracts";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import {
  describeNeedsRefundEntry,
  isReportedTransfer,
  needsRefundHeadline,
  transferRejectionNote,
} from "./needsRefundHelpers";
import { RejectTransferRequestAction } from "./RejectTransferRequestAction";
import { ElevatedCard } from "../components/ElevatedCard";

export interface NeedsRefundNoticeProps {
  /** The payments to refund by hand; nothing is rendered for an empty list. */
  entries: readonly NeedsRefundEntry[];
  /** True when the server has more than the entries shown. */
  hasMore: boolean;
  /** Opens an order in the details drawer. */
  onOpenOrder: (orderId: string) => void;
  /**
   * Whether the viewer may reject a reported transfer (`payment.manual.verify`). Other
   * staff see a line telling them to ask an admin instead of the button.
   */
  canRejectTransfers: boolean;
  setNotice?: (message: string) => void;
}

const rowDividerClass =
  "border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] last:border-b-0";

/**
 * Shown at the top of the staff Orders screen only while there is money to
 * return by hand: a gateway payment taken for an order that was already
 * paid, a course or a bundle a learner paid for twice, or a transfer a
 * learner reported for an order that was then paid another way, cancelled
 * or failed. Nothing here acts on its own; it says what happened and what
 * to do, and opens the order. The one thing it does itself is close a
 * reported transfer, when staff ask it to.
 */
export const NeedsRefundNotice = memo(function NeedsRefundNotice({
  entries,
  hasMore,
  onOpenOrder,
  canRejectTransfers,
  setNotice,
}: NeedsRefundNoticeProps) {
  if (entries.length === 0) return null;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setNotice?.(`Copied ${label} to clipboard.`);
  };

  return (
    <ElevatedCard
      aria-labelledby="orders-needs-refund-title"
      className="overflow-hidden"
    >
      <div className="flex items-start gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-3.5 sm:px-5 sm:py-4">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400"
          aria-hidden="true"
        >
          <WarningCircle size={16} weight="bold" />
        </span>
        <div className="min-w-0">
          <h2
            id="orders-needs-refund-title"
            className="text-sm font-bold leading-snug text-(--text)"
          >
            {needsRefundHeadline(entries.length, hasMore)}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-(--muted)">
            Nothing here is refunded automatically. Each one leaves this list
            once its money has gone back or its request is closed.
            {hasMore ? " The newest are shown first." : ""}
          </p>
        </div>
      </div>

      <ul className="max-h-96 overflow-y-auto overscroll-contain">
        {entries.map((entry) => {
          const lines = describeNeedsRefundEntry(entry);
          return (
            <li
              key={`${entry.kind}:${entry.id}`}
              className={`flex flex-col gap-3 p-3.5 sm:px-5 sm:py-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8 ${rowDividerClass}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-snug text-(--text)">
                  {lines.buyerName}
                </p>
                {lines.buyerEmail && (
                  <p className="mt-0.5 truncate font-mono text-xs leading-tight text-(--muted)">
                    {lines.buyerEmail}
                  </p>
                )}
                <p className="mt-1.5 truncate text-sm font-semibold text-(--text)">
                  {lines.courseTitle}
                </p>
                <p className="mt-1 text-xs leading-5 text-(--muted)">
                  {lines.reason}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-(--text)">
                  {lines.action}
                </p>
                {isReportedTransfer(entry) && (
                  <div className="mt-2">
                    <RejectTransferRequestAction
                      canReject={canRejectTransfers}
                      requestId={entry.id}
                      orderNumber={lines.orderNumber}
                      adminNotes={transferRejectionNote(entry)}
                      setNotice={setNotice}
                    />
                  </div>
                )}
              </div>

              <dl className="shrink-0 space-y-1.5 text-xs lg:w-80">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-(--muted)">{lines.amountLabel}</dt>
                  <dd className="text-right">
                    <span className="font-mono text-sm font-bold text-(--text)">
                      {lines.amount}
                    </span>
                    {lines.refundedNote && (
                      <span className="mt-0.5 block text-[11px] text-(--muted)">
                        {lines.refundedNote}
                      </span>
                    )}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <dt className="text-(--muted)">{lines.orderLabel}</dt>
                  <dd className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenOrder(entry.order.id)}
                      title="Open order details"
                      className="inline-flex max-w-full items-center gap-1 rounded-md text-(--text) transition-colors hover:text-(--accent) cursor-pointer"
                    >
                      <span className="truncate font-mono text-xs font-semibold">
                        {lines.orderNumber}
                      </span>
                      <ArrowSquareOut
                        size={12}
                        weight="bold"
                        aria-hidden="true"
                      />
                    </button>
                  </dd>
                </div>

                {lines.reference && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-(--muted)">{lines.referenceLabel}</dt>
                    <dd className="flex min-w-0 items-center gap-1.5 font-mono text-(--text)">
                      <span className="max-w-[180px] truncate">
                        {lines.reference}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(lines.reference!, lines.referenceLabel)
                        }
                        className="rounded p-0.5 text-(--muted) hover:text-(--text) cursor-pointer"
                        title={`Copy ${lines.referenceLabel}`}
                        aria-label={`Copy ${lines.referenceLabel}`}
                      >
                        <Copy size={13} aria-hidden="true" />
                      </button>
                    </dd>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <dt className="sr-only">When</dt>
                  <dd className="ml-auto text-[11px] text-(--muted)">
                    {lines.when}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </ElevatedCard>
  );
});
