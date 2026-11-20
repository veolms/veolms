import type {
  AffiliateCommissionRow,
  AffiliatePayout,
} from "@veolms/contracts";

import { ElevatedCard } from "../components/ElevatedCard";
import {
  useAffiliateCommissions,
  useAffiliatePayouts,
} from "../services/affiliates";
import {
  ListSkeleton,
  StatusChip,
  secondaryButtonClassName,
} from "../team/TeamBits";
import { formatAffiliateMoney, formatAffiliateRate } from "./affiliateFormat";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(value: string): string {
  return dateFormat.format(new Date(value));
}

function commissionChip(row: AffiliateCommissionRow) {
  if (row.paid) return <StatusChip tone="success">Paid</StatusChip>;
  if (row.inPayout) return <StatusChip tone="accent">In payout</StatusChip>;
  if (row.status === "rejected")
    return <StatusChip tone="danger">Rejected</StatusChip>;
  if (row.status === "approved")
    return <StatusChip tone="success">Available</StatusChip>;
  return <StatusChip tone="warning">Pending</StatusChip>;
}

const KIND_LABELS: Record<AffiliateCommissionRow["kind"], string> = {
  sale: "Sale",
  reversal: "Refund",
  adjustment: "Adjustment",
};

/** Every commission, newest first, 25 at a time. */
export function AffiliateCommissionHistory() {
  const query = useAffiliateCommissions();
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ElevatedCard padded className="flex flex-col gap-3">
      <h2 className="m-0 text-base font-semibold text-(--text)">Commissions</h2>
      {query.isPending ? (
        <ListSkeleton rows={3} />
      ) : query.isError ? (
        <p role="alert" className="m-0 text-sm text-rose-500">
          Couldn&apos;t load your commissions.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-sm text-(--muted)">
          No commissions yet. Share your link to earn your first.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-(--text)">
                  {KIND_LABELS[row.kind]}
                  {row.product ? ` · ${row.product}` : ""}
                </span>
                <span className="text-xs text-(--muted)">
                  {formatDate(row.createdAt)}
                  {row.buyer ? ` · ${row.buyer}` : ""}
                  {row.orderNumber ? ` · ${row.orderNumber}` : ""}
                  {row.rateType && row.rateValue !== null
                    ? ` · ${formatAffiliateRate({ rateType: row.rateType, rateValue: row.rateValue, currency: row.amount.currency })}`
                    : ""}
                </span>
                {row.status === "pending" && row.kind === "sale" ? (
                  <span className="text-xs text-(--muted)">
                    Available from {formatDate(row.availableAt)}
                  </span>
                ) : null}
                {row.note ? (
                  <span className="text-xs text-(--text-secondary)">
                    {row.note}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-semibold ${row.amount.amountMinor < 0 ? "text-rose-500" : "text-(--text)"}`}
                >
                  {formatAffiliateMoney(row.amount)}
                  {row.payoutAmount &&
                  row.payoutAmount.currency !== row.amount.currency ? (
                    <span className="ml-1 text-xs font-normal text-(--muted)">
                      ({formatAffiliateMoney(row.payoutAmount)})
                    </span>
                  ) : null}
                </span>
                {commissionChip(row)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <button
          type="button"
          className={`${secondaryButtonClassName} self-center`}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </ElevatedCard>
  );
}

const PAYOUT_CHIPS: Record<
  AffiliatePayout["status"],
  { tone: "accent" | "success" | "danger"; label: string }
> = {
  requested: { tone: "accent", label: "Requested" },
  paid: { tone: "success", label: "Paid" },
  rejected: { tone: "danger", label: "Rejected" },
  failed: { tone: "danger", label: "Failed" },
};

/** Payout requests and what became of them. Hidden until there is one. */
export function AffiliatePayoutHistory() {
  const query = useAffiliatePayouts();
  const items = query.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <ElevatedCard padded className="flex flex-col gap-3">
      <h2 className="m-0 text-base font-semibold text-(--text)">
        Payout history
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
        {items.map((payout) => {
          const chip = PAYOUT_CHIPS[payout.status];
          return (
            <li
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-(--text)">
                  {formatAffiliateMoney(payout.net)}
                  {payout.tds.amountMinor > 0 ? (
                    <span className="ml-1 text-xs font-normal text-(--muted)">
                      after {formatAffiliateMoney(payout.tds)} TDS on{" "}
                      {formatAffiliateMoney(payout.gross)}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-(--muted)">
                  Asked {formatDate(payout.createdAt)}
                  {payout.paidOn ? ` · paid ${formatDate(payout.paidOn)}` : ""}
                  {payout.hint ? ` · ${payout.hint}` : ""}
                  {payout.reference ? ` · ref ${payout.reference}` : ""}
                </span>
                {payout.reason ? (
                  <span className="text-xs text-(--text-secondary)">
                    {payout.reason}
                  </span>
                ) : null}
              </div>
              <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            </li>
          );
        })}
      </ul>
    </ElevatedCard>
  );
}
