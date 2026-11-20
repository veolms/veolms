import type { AffiliateMeResponse } from "@veolms/contracts";

import { ElevatedCard } from "../components/ElevatedCard";
import { useAffiliateStats } from "../services/affiliates";
import { formatAffiliateMoney } from "./affiliateFormat";

/**
 * The numbers at the top of the dashboard: the last 30 days' clicks and
 * sales, and what is pending (still in the refund period) and available
 * (owed, ready to withdraw). In payout and paid are shown under them.
 */
export function AffiliateBalances({ me }: { me: AffiliateMeResponse }) {
  const stats = useAffiliateStats();
  const { balances } = me;
  return (
    <section aria-label="Your numbers" className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <Tile
          label="Clicks"
          value={stats.data ? String(stats.data.clicks) : "–"}
          note="last 30 days"
        />
        <Tile
          label="Sales"
          value={stats.data ? String(stats.data.sales) : "–"}
          note="last 30 days"
        />
        <Tile
          label="Pending"
          value={formatAffiliateMoney(balances.pending)}
          note={`held ${me.program.holdDays} days for refunds`}
        />
        <Tile
          label="Available"
          value={formatAffiliateMoney(balances.available)}
          note="ready to withdraw"
          accent
        />
      </div>
      <p className="m-0 text-xs text-(--muted)">
        In payout {formatAffiliateMoney(balances.inPayout)} · Paid so far{" "}
        {formatAffiliateMoney(balances.paid)}
      </p>
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <ElevatedCard padded className="flex flex-col gap-1">
      <span className="text-xs text-(--muted)">{label}</span>
      <span
        className={`text-2xl font-bold tracking-tight ${accent ? "text-(--accent)" : "text-(--text)"}`}
      >
        {value}
      </span>
      <span className="text-xs text-(--muted)">{note}</span>
    </ElevatedCard>
  );
}
