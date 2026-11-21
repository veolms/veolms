import { useEffect, useRef, type ReactNode } from "react";
import {
  AFFILIATE_COMMISSION_KINDS,
  AFFILIATE_PAYOUT_STATUSES,
  AFFILIATE_VIEW_STATES,
  type AffiliateCommissionRow,
  type AffiliateCommissionKind,
  type AffiliatePayout,
  type AffiliatePayoutStatus,
  type AffiliateViewState,
} from "@veolms/contracts";
import { CalculatorIcon as Calculator } from "@phosphor-icons/react/Calculator";
import { NoteIcon } from "@phosphor-icons/react/Note";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";

import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { DateRangeControl } from "../orders/filters/DateRangeControl";
import { MultiSelectFilter } from "../orders/filters/MultiSelectFilter";
import {
  useAffiliateCommissionsPage,
  useAffiliatePayoutsPage,
} from "../services/affiliates";
import { AdminDataTable, type AdminColumn } from "./admin/AdminDataTable";
import {
  AdminFilterRow,
  AdminSearchBox,
  AdminSummaryTiles,
  AdminTabHeader,
  adminFilterWidth,
} from "./admin/AdminListBits";
import {
  PanelHero,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
  ProgressSteps,
} from "./admin/AdminPanelBits";
import {
  AdminSidePanel,
  AdminWithPanel,
  usePanelStep,
} from "./admin/AdminSidePanel";
import {
  AdminStatusPill,
  PAYOUT_METHOD_LABELS,
  StatusDot,
  type AdminStatusTone,
} from "./admin/adminTones";
import {
  includedValues,
  multiLabel,
  useAdminListUrl,
} from "./admin/useAdminListUrl";
import { formatAffiliateMoney, formatAffiliateRate } from "./affiliateFormat";

const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const formatDay = (value: string | null) =>
  value ? dayFormat.format(new Date(value)) : "–";
const number = new Intl.NumberFormat("en-IN");

export const VIEW_STATE_TONES: Record<AffiliateViewState, AdminStatusTone> = {
  waiting: { label: "Waiting", tone: "info" },
  available: { label: "Available", tone: "success" },
  in_payout: { label: "In payout", tone: "accent" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
};
const VIEW_STATE_NOTES: Record<AffiliateViewState, string> = {
  waiting: "in the refund period",
  available: "ready to withdraw",
  in_payout: "being paid",
  paid: "paid to you",
  rejected: "not counted",
};
const SUMMARY_KEYS: Record<
  AffiliateViewState,
  "waiting" | "available" | "inPayout" | "paid" | "rejected"
> = {
  waiting: "waiting",
  available: "available",
  in_payout: "inPayout",
  paid: "paid",
  rejected: "rejected",
};
const STATE_LABELS = Object.fromEntries(
  AFFILIATE_VIEW_STATES.map((state) => [state, VIEW_STATE_TONES[state].label]),
);
const KIND_LABELS: Record<AffiliateCommissionKind, string> = {
  sale: "Sale",
  reversal: "Refund",
  adjustment: "Adjustment",
};

const SOURCE_LABELS: Record<
  NonNullable<AffiliateCommissionRow["source"]>,
  string
> = {
  link: "Your link",
  code: "Your code",
  account: "Their account (an earlier click)",
  manual: "Credited by the academy",
};

export function viewState(row: AffiliateCommissionRow): AffiliateViewState {
  if (row.paid) return "paid";
  if (row.inPayout) return "in_payout";
  if (row.status === "rejected") return "rejected";
  if (row.status === "approved") return "available";
  return "waiting";
}

export const commissionTitle = (row: AffiliateCommissionRow) =>
  row.kind === "sale" ? (row.product ?? "Sale") : KIND_LABELS[row.kind];

const rateOf = (row: AffiliateCommissionRow) =>
  row.rateType && row.rateValue !== null
    ? formatAffiliateRate({
        rateType: row.rateType,
        rateValue: row.rateValue,
        currency: row.amount.currency,
      })
    : null;

/**
 * Every commission, as the admin's Commissions tab lists them: figures by
 * state (each a filter), filters by state, kind and date, a search by
 * order number, pages, and a row's details beside the list.
 */
export function AffiliateCommissionHistory() {
  const url = useAdminListUrl({ defaultRange: "all" });
  const states = url.list("states", AFFILIATE_VIEW_STATES);
  const kinds = url.list("kinds", AFFILIATE_COMMISSION_KINDS);
  const list = useAffiliateCommissionsPage({
    page: url.page,
    pageSize: url.pageSize,
    states: states.join(","),
    kinds: kinds.join(","),
    q: url.search,
    ...url.days,
  });
  const data = list.data;
  const rows = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;

  const { page, setPage } = url;
  useEffect(() => {
    if (data?.total && page > pageCount) setPage(pageCount);
  }, [data, page, pageCount, setPage]);

  usePageSearchShortcut("my-commissions-search");

  const setStates = (next: readonly AffiliateViewState[]) =>
    url.set({
      states: next.length === AFFILIATE_VIEW_STATES.length ? null : next,
    });
  const summary = data?.summary;
  const tiles = summary
    ? AFFILIATE_VIEW_STATES.map((state) => {
        const figure = summary[SUMMARY_KEYS[state]];
        const only = states.length === 1 && states[0] === state;
        return {
          id: state,
          title: STATE_LABELS[state]!,
          value: formatAffiliateMoney(figure.amount),
          note: `${number.format(figure.count)} · ${VIEW_STATE_NOTES[state]}`,
          active: only,
          onSelect: () => setStates(only ? [] : [state]),
        };
      })
    : null;

  const columns: readonly AdminColumn<AffiliateCommissionRow>[] = [
    {
      id: "date",
      header: "Date",
      className: "w-[8rem]",
      cell: (row) => (
        <>
          <p className="m-0 text-sm font-semibold text-(--text)">
            {formatDay(row.createdAt)}
          </p>
          <p className="m-0 font-mono text-xs text-(--muted)">
            {timeFormat.format(new Date(row.createdAt))}
          </p>
        </>
      ),
    },
    {
      id: "for",
      header: "For",
      skeleton: "w-40",
      cell: (row) => (
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-(--text)">
            {commissionTitle(row)}
          </p>
          <p className="m-0 truncate text-xs text-(--muted)">
            {[row.buyer, row.orderNumber].filter(Boolean).join(" · ") ||
              row.note ||
              "–"}
          </p>
        </div>
      ),
    },
    {
      id: "rate",
      header: "Rate",
      align: "right",
      className: "hidden w-[8rem] @4xl:table-cell",
      cell: (row) => {
        const rate = rateOf(row);
        return rate ? (
          <>
            <p className="m-0 text-sm text-(--text-secondary)">{rate}</p>
            {row.base && (
              <p className="m-0 text-xs text-(--muted)">
                of {formatAffiliateMoney(row.base)}
              </p>
            )}
          </>
        ) : (
          <span className="text-sm text-(--muted)">–</span>
        );
      },
    },
    {
      id: "amount",
      header: "Commission",
      align: "right",
      className: "w-[8.5rem]",
      cell: (row) => (
        <span
          className={`text-sm font-bold ${row.amount.amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
        >
          {formatAffiliateMoney(row.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      className: "w-[10rem]",
      skeleton: "w-20",
      cell: (row) => {
        const state = viewState(row);
        return (
          <div className="flex flex-col items-start gap-1">
            <AdminStatusPill status={VIEW_STATE_TONES[state]} />
            {state === "waiting" && (
              <span className="text-xs text-(--muted)">
                from {formatDay(row.availableAt)}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const step = usePanelStep(
    rows,
    url.openId,
    url.setOpenId,
    (url.page - 1) * url.pageSize,
    data?.total ?? 0,
  );
  const lastRowRef = useRef<AffiliateCommissionRow | null>(null);
  const found = rows.find((row) => row.id === url.openId) ?? null;
  if (found) lastRowRef.current = found;
  const openRow =
    found ??
    (lastRowRef.current?.id === url.openId ? lastRowRef.current : null);

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Commissions"
        description="Everything you've earned: what's waiting, what you can withdraw, and what's been paid."
      >
        <DateRangeControl
          range={url.range === "all" ? "30d" : url.range}
          customFrom={url.customFrom}
          customTo={url.customTo}
          onRangeChange={url.setRange}
          onCustomRange={url.setCustomRange}
          allTime={{
            active: url.range === "all",
            onSelect: () => url.setRange("all"),
          }}
        />
      </AdminTabHeader>

      <AdminWithPanel
        panel={
          <AdminSidePanel
            openId={url.openId}
            onOpenChange={url.setOpenId}
            label="Commission"
            storageKey="veolms-my-commissions-panel"
            heading={openRow?.orderNumber ?? undefined}
            step={step}
          >
            {openRow ? (
              <MyCommissionBody key={openRow.id} row={openRow} />
            ) : null}
          </AdminSidePanel>
        }
      >
        <AdminSummaryTiles
          label="Your commissions by status"
          tiles={tiles}
          count={5}
          isLoading={list.isPending}
        />

        <AdminFilterRow
          filters={
            <>
              <MultiSelectFilter
                name="Status"
                noun="statuses"
                buttonLabel={multiLabel(
                  states,
                  STATE_LABELS,
                  ["status", "statuses"],
                  AFFILIATE_VIEW_STATES.length,
                )}
                buttonLeading={
                  states.length === 1 ? (
                    <StatusDot tone={VIEW_STATE_TONES[states[0]!].tone} />
                  ) : undefined
                }
                groups={[
                  {
                    id: "states",
                    options: AFFILIATE_VIEW_STATES.map((state) => ({
                      id: state,
                      label: summary
                        ? `${STATE_LABELS[state]} (${number.format(summary[SUMMARY_KEYS[state]].count)})`
                        : STATE_LABELS[state]!,
                      leading: (
                        <StatusDot tone={VIEW_STATE_TONES[state].tone} />
                      ),
                    })),
                  },
                ]}
                value={{ selected: states, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) =>
                  setStates(
                    includedValues(selected, mode, AFFILIATE_VIEW_STATES),
                  )
                }
                triggerClassName={adminFilterWidth}
                contentClassName="w-[18rem]"
              />
              <MultiSelectFilter
                name="Kind"
                noun="kinds"
                buttonLabel={multiLabel(
                  kinds,
                  KIND_LABELS,
                  ["kind", "kinds"],
                  AFFILIATE_COMMISSION_KINDS.length,
                )}
                groups={[
                  {
                    id: "kinds",
                    options: AFFILIATE_COMMISSION_KINDS.map((kind) => ({
                      id: kind,
                      label: KIND_LABELS[kind],
                    })),
                  },
                ]}
                value={{ selected: kinds, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) => {
                  const next = includedValues(
                    selected,
                    mode,
                    AFFILIATE_COMMISSION_KINDS,
                  );
                  url.set({
                    kinds:
                      next.length === AFFILIATE_COMMISSION_KINDS.length
                        ? null
                        : next,
                  });
                }}
                triggerClassName={adminFilterWidth}
                contentClassName="w-[17rem]"
              />
            </>
          }
          search={
            <AdminSearchBox
              id="my-commissions-search"
              value={url.searchText}
              onChange={url.setSearchText}
              placeholder="Search by order number"
            />
          }
        />

        <AdminDataTable
          label="Commissions"
          nouns={["commission", "commissions"]}
          rows={rows}
          columns={columns}
          card={(row) => {
            const state = viewState(row);
            return (
              <>
                <div className="flex w-full items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold text-(--text)">
                      {commissionTitle(row)}
                    </p>
                    <p className="m-0 truncate text-xs text-(--muted)">
                      {formatDay(row.createdAt)}
                      {row.buyer ? ` · ${row.buyer}` : ""}
                    </p>
                  </div>
                  <p
                    className={`m-0 shrink-0 text-sm font-bold tabular-nums ${row.amount.amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
                  >
                    {formatAffiliateMoney(row.amount)}
                  </p>
                </div>
                <AdminStatusPill status={VIEW_STATE_TONES[state]} />
              </>
            );
          }}
          total={data?.total ?? 0}
          page={url.page}
          pageCount={pageCount}
          pageSize={url.pageSize}
          onPageChange={url.setPage}
          onPageSizeChange={url.setPageSize}
          isLoading={list.isPending}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          selectedId={url.openId}
          onOpen={url.setOpenId}
          isFiltered={url.isFiltered}
          onResetFilters={url.reset}
          empty={{
            title: "No commissions yet",
            text: "Share your link: each sale through it earns you a commission.",
          }}
        />
      </AdminWithPanel>
    </div>
  );
}

const STEPS = ["Earned", "Available", "In payout", "Paid"] as const;

/** One commission in the side panel: the amount, its progress, and how. */
function MyCommissionBody({ row }: { row: AffiliateCommissionRow }) {
  const state = viewState(row);
  const rate = rateOf(row);
  const reached =
    state === "paid"
      ? 3
      : state === "in_payout"
        ? 2
        : state === "available"
          ? 1
          : 0;
  const negative = row.amount.amountMinor < 0;
  return (
    <>
      <PanelHero>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-(--muted) uppercase">
            {KIND_LABELS[row.kind]} commission
          </span>
          <AdminStatusPill status={VIEW_STATE_TONES[state]} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <p
            className={`m-0 text-3xl font-bold tracking-tight tabular-nums ${negative ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
          >
            {formatAffiliateMoney(row.amount)}
          </p>
          {rate && row.base ? (
            <p className="m-0 text-sm text-(--muted)">
              {rate} of {formatAffiliateMoney(row.base)}
            </p>
          ) : null}
        </div>
        <p className="m-0 mt-1 truncate text-sm">
          <span className="font-semibold text-(--text)">
            {commissionTitle(row)}
          </span>
          <span className="text-(--muted)">
            {" · "}
            {formatDay(row.createdAt)},{" "}
            {timeFormat.format(new Date(row.createdAt))}
          </span>
        </p>
        {state !== "rejected" && (
          <div className="mt-4">
            <ProgressSteps
              steps={STEPS.map((label, index) => ({
                label,
                note:
                  index === 0
                    ? formatDay(row.createdAt)
                    : index === 1
                      ? reached >= 1
                        ? "withdraw it"
                        : formatDay(row.availableAt)
                      : index === 2
                        ? reached >= 2
                          ? "asked for"
                          : ""
                        : reached >= 3
                          ? "done"
                          : "",
              }))}
              reached={reached}
              allDone={state === "paid"}
            />
          </div>
        )}
      </PanelHero>
      <PanelSections>
        {state === "rejected" && row.note && (
          <PanelSection
            title="Why it was rejected"
            icon={NoteIcon}
            tone="warning"
          >
            <p className="m-0 text-sm whitespace-pre-wrap text-(--text)">
              {row.note}
            </p>
          </PanelSection>
        )}
        <PanelSection title="Details" icon={Receipt}>
          <PanelRows>
            {row.orderNumber && (
              <PanelRow label="Order">
                <span className="font-mono text-xs">{row.orderNumber}</span>
              </PanelRow>
            )}
            {row.buyer && <PanelRow label="Buyer">{row.buyer}</PanelRow>}
            {row.product && <PanelRow label="Product">{row.product}</PanelRow>}
            {row.source && (
              <PanelRow label="Came through">
                {SOURCE_LABELS[row.source]}
              </PanelRow>
            )}
            <PanelRow
              label={state === "waiting" ? "Available from" : "Available since"}
            >
              {formatDay(row.availableAt)}
            </PanelRow>
          </PanelRows>
        </PanelSection>
        <PanelSection title="How it's worked out" icon={Calculator}>
          <PanelRows>
            {row.base && (
              <PanelRow label="Sale value">
                {formatAffiliateMoney(row.base)}
              </PanelRow>
            )}
            {rate && <PanelRow label="Rate">{rate}</PanelRow>}
            {row.payoutAmount &&
              row.payoutAmount.currency !== row.amount.currency && (
                <PanelRow label="In rupees">
                  {formatAffiliateMoney(row.payoutAmount)}
                </PanelRow>
              )}
            <PanelRow label="Commission" strong>
              {formatAffiliateMoney(row.amount)}
            </PanelRow>
          </PanelRows>
          <p className="m-0 mt-2 text-xs text-(--muted)">
            On the price before tax, after any discount.
          </p>
        </PanelSection>
        {state !== "rejected" && row.note && (
          <PanelSection title="Note" icon={NoteIcon}>
            <p className="m-0 text-sm whitespace-pre-wrap text-(--text)">
              {row.note}
            </p>
          </PanelSection>
        )}
      </PanelSections>
    </>
  );
}

const PAYOUT_TONES: Record<AffiliatePayoutStatus, AdminStatusTone> = {
  requested: { label: "Requested", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};
const PAYOUT_LABELS = Object.fromEntries(
  AFFILIATE_PAYOUT_STATUSES.map((status) => [
    status,
    PAYOUT_TONES[status].label,
  ]),
);

/** Payout requests and what became of them, filtered by status and date. */
export function AffiliatePayoutHistory({ action }: { action?: ReactNode }) {
  const url = useAdminListUrl({ defaultRange: "all" });
  const statuses = url.list("statuses", AFFILIATE_PAYOUT_STATUSES);
  const list = useAffiliatePayoutsPage({
    page: url.page,
    pageSize: url.pageSize,
    statuses: statuses.join(","),
    ...url.days,
  });
  const data = list.data;
  const rows = data?.items ?? [];

  const columns: readonly AdminColumn<AffiliatePayout>[] = [
    {
      id: "asked",
      header: "Asked",
      className: "w-[8.5rem]",
      cell: (row) => (
        <span className="text-sm font-semibold text-(--text)">
          {formatDay(row.createdAt)}
        </span>
      ),
    },
    {
      id: "to",
      header: "Paid to",
      skeleton: "w-32",
      cell: (row) => (
        <div className="min-w-0">
          <p className="m-0 truncate text-sm text-(--text)">
            {PAYOUT_METHOD_LABELS[row.method]}
          </p>
          <p className="m-0 truncate font-mono text-xs text-(--muted)">
            {row.hint ?? "–"}
          </p>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      className: "w-[8rem]",
      cell: (row) => (
        <span className="text-sm font-bold text-(--text)">
          {formatAffiliateMoney(row.gross)}
        </span>
      ),
    },
    {
      id: "net",
      header: "You got",
      align: "right",
      className: "hidden w-[9rem] @4xl:table-cell",
      cell: (row) =>
        row.status === "paid" ? (
          <>
            <p className="m-0 text-sm font-semibold text-(--text)">
              {formatAffiliateMoney(row.net)}
            </p>
            {row.tds.amountMinor > 0 && (
              <p className="m-0 text-xs text-(--muted)">
                {formatAffiliateMoney(row.tds)} TDS
              </p>
            )}
          </>
        ) : (
          <span className="text-sm text-(--muted)">–</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      className: "w-[11rem]",
      skeleton: "w-20",
      cell: (row) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <AdminStatusPill status={PAYOUT_TONES[row.status]} />
          {row.status === "paid" && row.paidOn ? (
            <span className="text-xs text-(--muted)">
              {formatDay(row.paidOn)}
              {row.reference ? ` · ${row.reference}` : ""}
            </span>
          ) : row.reason ? (
            <span
              className="max-w-full truncate text-xs text-(--muted)"
              title={row.reason}
            >
              {row.reason}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Payouts"
        description="Every payout you asked for, and what the academy did with it."
      >
        <DateRangeControl
          range={url.range === "all" ? "30d" : url.range}
          customFrom={url.customFrom}
          customTo={url.customTo}
          onRangeChange={url.setRange}
          onCustomRange={url.setCustomRange}
          allTime={{
            active: url.range === "all",
            onSelect: () => url.setRange("all"),
          }}
        />
      </AdminTabHeader>
      {action}
      <AdminFilterRow
        filters={
          <MultiSelectFilter
            name="Status"
            noun="statuses"
            buttonLabel={multiLabel(
              statuses,
              PAYOUT_LABELS,
              ["status", "statuses"],
              AFFILIATE_PAYOUT_STATUSES.length,
            )}
            buttonLeading={
              statuses.length === 1 ? (
                <StatusDot tone={PAYOUT_TONES[statuses[0]!].tone} />
              ) : undefined
            }
            groups={[
              {
                id: "statuses",
                options: AFFILIATE_PAYOUT_STATUSES.map((status) => ({
                  id: status,
                  label: PAYOUT_LABELS[status]!,
                  leading: <StatusDot tone={PAYOUT_TONES[status].tone} />,
                })),
              },
            ]}
            value={{ selected: statuses, mode: "include" }}
            defaultValue={{ selected: [], mode: "include" }}
            onChange={({ selected, mode }) => {
              const next = includedValues(
                selected,
                mode,
                AFFILIATE_PAYOUT_STATUSES,
              );
              url.set({
                statuses:
                  next.length === AFFILIATE_PAYOUT_STATUSES.length
                    ? null
                    : next,
              });
            }}
            triggerClassName={adminFilterWidth}
            contentClassName="w-[17rem]"
          />
        }
        search={<span className="hidden @4xl:block @4xl:flex-1" />}
      />
      <AdminDataTable
        label="Payouts"
        nouns={["payout", "payouts"]}
        rows={rows}
        columns={columns}
        card={(row) => (
          <>
            <div className="flex w-full items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-bold text-(--text) tabular-nums">
                  {formatAffiliateMoney(
                    row.status === "paid" ? row.net : row.gross,
                  )}
                </p>
                <p className="m-0 truncate text-xs text-(--muted)">
                  {row.paidOn
                    ? `Paid ${formatDay(row.paidOn)}`
                    : `Asked ${formatDay(row.createdAt)}`}
                  {` · ${PAYOUT_METHOD_LABELS[row.method]}`}
                </p>
              </div>
              <AdminStatusPill status={PAYOUT_TONES[row.status]} />
            </div>
            {row.reason && (
              <p className="m-0 text-xs text-(--text-secondary)">
                {row.reason}
              </p>
            )}
          </>
        )}
        total={data?.total ?? 0}
        page={url.page}
        pageCount={data?.pageCount ?? 1}
        pageSize={url.pageSize}
        onPageChange={url.setPage}
        onPageSizeChange={url.setPageSize}
        isLoading={list.isPending}
        isFetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        isFiltered={url.isFiltered}
        onResetFilters={url.reset}
        empty={{
          title: "No payouts yet",
          text: "Once you can withdraw, ask for a payout from the Overview tab.",
        }}
      />
    </div>
  );
}
