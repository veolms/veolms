import type { ReactNode } from "react";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";

import { ElevatedCard } from "../../components/ElevatedCard";
import { DateRangeControl } from "../../orders/filters/DateRangeControl";
import { StudentAvatar } from "../../orders/StudentAvatar";
import {
  affiliatesAdminService,
  useAffiliateSummary,
} from "../../services/affiliates";
import { AdminSummaryTiles, AdminTabHeader } from "./AdminListBits";
import { formatCount, money } from "./adminBits";
import type { AffiliateProgramTab } from "./affiliateProgramTabs";
import { useAdminListUrl } from "./useAdminListUrl";

const percent = (value: number | null) =>
  value === null ? "–" : `${(value * 100).toFixed(1)}%`;

export type OpenAffiliateTab = (
  tab: Exclude<AffiliateProgramTab, "overview">,
  search?: Record<string, string>,
) => void;

const cardTitle =
  "m-0 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";
const linkButton =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-(--accent) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)";

/**
 * The program at a glance for a date range (the last 30 days at first):
 * sales, commissions and money owed, the top affiliates, and what needs a
 * person's attention, each a link to the list it is about.
 */
export function AffiliateOverviewTab({
  onOpenTab,
}: {
  onOpenTab: OpenAffiliateTab;
}) {
  const url = useAdminListUrl({ defaultRange: "30d" });
  const summary = useAffiliateSummary(url.days);
  const data = summary.data;

  const tiles = data
    ? [
        {
          id: "sales",
          title: "Affiliate sales",
          value: money(data.affiliateSales),
          note: `${percent(data.shareOfRevenue)} of all revenue`,
        },
        {
          id: "orders",
          title: "Orders",
          value: formatCount(data.orders),
          note: `${formatCount(data.clickOrders)} after a click`,
        },
        {
          id: "clicks",
          title: "Clicks",
          value: formatCount(data.clicks),
          note: `${percent(data.conversionRate)} became orders`,
        },
        {
          id: "earned",
          title: "Commission earned",
          value: money(data.commissionEarned),
          note: "in this period",
        },
        {
          id: "owed",
          title: "Owed now",
          value: money(data.owedNow),
          note: "ready to pay",
          onSelect: () => onOpenTab("payouts"),
        },
        {
          id: "pending",
          title: "Pending",
          value: money(data.pending),
          note: "in the refund period",
          onSelect: () => onOpenTab("commissions", { states: "pending" }),
        },
        {
          id: "paid",
          title: "Paid out",
          value: money(data.paidOut),
          note: "in this period",
          onSelect: () => onOpenTab("payouts", { statuses: "paid" }),
        },
        {
          id: "affiliates",
          title: "Active affiliates",
          value: formatCount(data.activeAffiliates),
          note: `${formatCount(data.pendingApplications)} waiting for review`,
          onSelect: () => onOpenTab("affiliates"),
        },
      ]
    : null;

  const attention: {
    id: string;
    label: string;
    note: string;
    count: number;
    open: () => void;
  }[] = data
    ? [
        {
          id: "applications",
          label: "Applications to review",
          note: "Approve or reject each one",
          count: data.pendingApplications,
          open: () => onOpenTab("affiliates", { statuses: "pending" }),
        },
        {
          id: "held",
          label: "Commissions held by a flag",
          note: "Possible self-referrals and the like",
          count: data.health.heldByFlag,
          open: () => onOpenTab("commissions", { states: "held" }),
        },
        {
          id: "settlement",
          label: "Waiting for a rupee settlement",
          note: "Paid in another currency, not settled yet",
          count: data.health.waitingForSettlement,
          open: () => onOpenTab("commissions", { states: "held" }),
        },
        {
          id: "payouts",
          label: "Payouts open for over a week",
          note: "Asked for, not paid yet",
          count: data.health.payoutsOpenOverAWeek,
          open: () => onOpenTab("payouts", { statuses: "requested" }),
        },
      ]
    : [];
  const needing = attention.filter((item) => item.count > 0);

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Overview"
        description="How the program is doing, and what needs you."
      >
        <DateRangeControl
          range={url.range === "all" ? "30d" : url.range}
          customFrom={url.customFrom}
          customTo={url.customTo}
          onRangeChange={url.setRange}
          onCustomRange={url.setCustomRange}
        />
      </AdminTabHeader>

      {summary.isError && !data ? (
        <ElevatedCard as="div" role="alert" className="p-8 text-center">
          <WarningCircle
            size={32}
            weight="duotone"
            className="mx-auto mb-3 text-rose-500"
            aria-hidden="true"
          />
          <h2 className="m-0 text-base font-bold text-(--text)">
            The overview could not be loaded.
          </h2>
          <button
            type="button"
            onClick={() => void summary.refetch()}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) hover:opacity-90"
          >
            Try again
          </button>
        </ElevatedCard>
      ) : (
        <>
          <div
            className={
              summary.isFetching && data ? "opacity-70 transition-opacity" : ""
            }
          >
            <AdminSummaryTiles
              label="Program figures"
              tiles={tiles}
              count={8}
              isLoading={summary.isPending}
            />
          </div>

          <div className="@container">
            <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ElevatedCard as="section" className="overflow-hidden p-0">
                <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
                  <h2 className={cardTitle}>Top affiliates</h2>
                  <button
                    type="button"
                    className={linkButton}
                    onClick={() => onOpenTab("affiliates", { sort: "earned" })}
                  >
                    See all
                    <CaretRight size={13} weight="bold" aria-hidden="true" />
                  </button>
                </header>
                {!data ? (
                  <ListBones rows={5} />
                ) : data.topAffiliates.length === 0 ? (
                  <p className="m-0 px-4 pb-5 text-sm text-(--muted)">
                    No sales through affiliates in this period.
                  </p>
                ) : (
                  <ol className="m-0 list-none p-0">
                    {data.topAffiliates.map((row, index) => (
                      <li key={row.id} className="border-t border-(--border)">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenTab("affiliates", { open: row.id })
                          }
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
                        >
                          <span className="w-5 shrink-0 text-center text-sm font-bold text-(--muted) tabular-nums">
                            {index + 1}
                          </span>
                          <StudentAvatar
                            name={row.name ?? row.code}
                            size="md"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-(--text)">
                              {row.name ?? row.code}
                            </span>
                            <span className="block truncate font-mono text-xs text-(--accent)">
                              {row.code}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-bold text-(--text) tabular-nums">
                              {money(row.earned)}
                            </span>
                            <span className="block text-xs text-(--muted) tabular-nums">
                              {formatCount(row.orders)}{" "}
                              {row.orders === 1 ? "order" : "orders"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </ElevatedCard>

              <div className="flex flex-col gap-4">
                <ElevatedCard as="section" className="overflow-hidden p-0">
                  <header className="px-4 pt-4 pb-2">
                    <h2 className={cardTitle}>Needs attention</h2>
                  </header>
                  {!data ? (
                    <ListBones rows={3} />
                  ) : needing.length === 0 ? (
                    <p className="m-0 flex items-center gap-2 px-4 pb-5 text-sm text-(--text-secondary)">
                      <CheckCircle
                        size={18}
                        weight="duotone"
                        className="text-emerald-500"
                        aria-hidden="true"
                      />
                      Nothing waiting for you.
                    </p>
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {needing.map((item) => (
                        <li
                          key={item.id}
                          className="border-t border-(--border)"
                        >
                          <AttentionRow
                            label={item.label}
                            note={item.note}
                            onOpen={item.open}
                            count={
                              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-amber-500/15 px-2 text-sm font-bold text-amber-700 tabular-nums dark:text-amber-300">
                                {formatCount(item.count)}
                              </span>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </ElevatedCard>

                <ElevatedCard as="section" className="p-4">
                  <h2 className={cardTitle}>Reports</h2>
                  <p className="m-0 mt-1 text-sm text-(--muted)">
                    For your accountant or a spreadsheet.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <a
                      className={linkButton}
                      download
                      href={affiliatesAdminService.reportExportUrl(
                        "commissions",
                        url.days,
                      )}
                    >
                      <DownloadSimple
                        size={15}
                        weight="bold"
                        aria-hidden="true"
                      />
                      Commissions in this period
                    </a>
                    <a
                      className={linkButton}
                      download
                      href={affiliatesAdminService.reportExportUrl(
                        "affiliates",
                      )}
                    >
                      <DownloadSimple
                        size={15}
                        weight="bold"
                        aria-hidden="true"
                      />
                      All affiliates
                    </a>
                  </div>
                </ElevatedCard>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AttentionRow({
  label,
  note,
  count,
  onOpen,
}: {
  label: string;
  note: string;
  count: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-(--text)">
          {label}
        </span>
        <span className="block truncate text-xs text-(--muted)">{note}</span>
      </span>
      {count}
      <CaretRight
        size={14}
        weight="bold"
        className="shrink-0 text-(--muted)"
        aria-hidden="true"
      />
    </button>
  );
}

function ListBones({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 border-t border-(--border) px-4 py-3"
        >
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-(--border)" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-28 animate-pulse rounded bg-(--border)" />
            <div className="h-3 w-16 animate-pulse rounded bg-(--border)" />
          </div>
          <div className="h-3.5 w-14 animate-pulse rounded bg-(--border)" />
        </div>
      ))}
    </div>
  );
}
