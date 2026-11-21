import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ChartLineIcon as ChartLine } from "@phosphor-icons/react/ChartLine";

import { ElevatedCard } from "../../components/ElevatedCard";
import {
  affiliatesAdminService,
  useAffiliateSummary,
} from "../../services/affiliates";
import {
  ListSkeleton,
  LoadError,
  secondaryButtonClassName,
} from "../../team/TeamBits";
import { money } from "./adminBits";

const percent = (value: number | null) =>
  value === null ? "–" : `${(value * 100).toFixed(1)}%`;

/** The last 30 days at a glance (PRD section 17.1), and the health panel. */
export function AffiliateOverviewTab({
  onOpenTab,
}: {
  onOpenTab: (tab: "affiliates" | "commissions" | "payouts") => void;
}) {
  const summary = useAffiliateSummary();
  if (summary.isPending) return <ListSkeleton rows={4} />;
  if (summary.isError || !summary.data) {
    return (
      <LoadError
        icon={ChartLine}
        title="Couldn't load the overview"
        onRetry={() => void summary.refetch()}
      />
    );
  }
  const data = summary.data;
  const tiles: { label: string; value: string; note?: string }[] = [
    {
      label: "Affiliate sales",
      value: money(data.affiliateSales),
      note: `${percent(data.shareOfRevenue)} of revenue`,
    },
    {
      label: "Orders",
      value: String(data.orders),
      note: `${percent(data.conversionRate)} of ${data.clicks} clicks`,
    },
    { label: "Commission earned", value: money(data.commissionEarned) },
    { label: "Paid out", value: money(data.paidOut) },
    { label: "Owed now", value: money(data.owedNow), note: "ready to pay" },
    {
      label: "Pending",
      value: money(data.pending),
      note: "in the refund period",
    },
    {
      label: "Active affiliates",
      value: String(data.activeAffiliates),
      note: "with a click",
    },
    {
      label: "Applications",
      value: String(data.pendingApplications),
      note: "waiting for review",
    },
  ];
  const health = [
    {
      label: "Commissions held by a flag",
      count: data.health.heldByFlag,
      tab: "commissions" as const,
    },
    {
      label: "Waiting for a rupee settlement",
      count: data.health.waitingForSettlement,
      tab: "commissions" as const,
    },
    {
      label: "Payouts open for over a week",
      count: data.health.payoutsOpenOverAWeek,
      tab: "payouts" as const,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-(--muted)">The last 30 days.</p>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {tiles.map((tile) => (
          <ElevatedCard key={tile.label} padded className="flex flex-col gap-1">
            <span className="text-xs text-(--muted)">{tile.label}</span>
            <span className="text-xl font-bold tracking-tight text-(--text)">
              {tile.value}
            </span>
            {tile.note ? (
              <span className="text-xs text-(--muted)">{tile.note}</span>
            ) : null}
          </ElevatedCard>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <ElevatedCard padded className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-semibold text-(--text)">
            Top affiliates
          </h2>
          {data.topAffiliates.length === 0 ? (
            <p className="m-0 text-sm text-(--muted)">
              No sales through affiliates yet.
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
              {data.topAffiliates.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate text-(--text)">
                    <span className="font-semibold">{row.code}</span>
                    {row.name ? (
                      <span className="text-(--muted)"> · {row.name}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-(--text-secondary)">
                    {row.orders} orders · {money(row.earned)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ElevatedCard>

        <ElevatedCard padded className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-semibold text-(--text)">
            Needs attention
          </h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
            {health.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-(--text)">{row.label}</span>
                {row.count > 0 ? (
                  <button
                    type="button"
                    className="font-semibold text-(--accent) hover:underline"
                    onClick={() => onOpenTab(row.tab)}
                  >
                    {row.count}
                  </button>
                ) : (
                  <span className="text-(--muted)">0</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              className={secondaryButtonClassName}
              href={affiliatesAdminService.reportExportUrl("commissions")}
            >
              <DownloadSimple size={16} aria-hidden="true" /> Commissions CSV
            </a>
            <a
              className={secondaryButtonClassName}
              href={affiliatesAdminService.reportExportUrl("affiliates")}
            >
              <DownloadSimple size={16} aria-hidden="true" /> Affiliates CSV
            </a>
          </div>
        </ElevatedCard>
      </div>
    </div>
  );
}
