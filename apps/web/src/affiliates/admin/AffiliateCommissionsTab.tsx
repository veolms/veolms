import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_COMMISSION_STATES,
  AFFILIATE_COMMISSION_KINDS,
  type AdminCommissionRow,
  type AdminCommissionState,
  type AffiliateCommissionKind,
} from "@veolms/contracts";
import { CalculatorIcon as Calculator } from "@phosphor-icons/react/Calculator";
import { NoteIcon } from "@phosphor-icons/react/Note";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { WarningIcon as Warning } from "@phosphor-icons/react/Warning";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { usePageSearchShortcut } from "../../hooks/usePageSearchShortcut";
import { DateRangeControl } from "../../orders/filters/DateRangeControl";
import { MultiSelectFilter } from "../../orders/filters/MultiSelectFilter";
import { useCapabilities } from "../../services/authorization";
import {
  affiliatesAdminService,
  useAddAffiliateAdjustment,
  useAdminAffiliates,
  useAdminCommissions,
  useApproveAffiliateCommission,
  useRejectAffiliateCommission,
  useSetOrderAttribution,
} from "../../services/affiliates";
import {
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
} from "../../team/TeamBits";
import { formatAffiliateRate } from "../affiliateFormat";
import { AdminDataTable, type AdminColumn } from "./AdminDataTable";
import {
  AdminFilterRow,
  AdminSearchBox,
  AdminSummaryTiles,
  AdminTabHeader,
  DetailBox,
  DetailRow,
  adminFilterWidth,
  panelDangerButton,
  panelPrimaryButton,
  panelSecondaryButton,
} from "./AdminListBits";
import {
  CodeChip,
  ProgressSteps,
  PanelActions,
  PanelHero,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
} from "./AdminPanelBits";
import { AdminSidePanel, AdminWithPanel, usePanelStep } from "./AdminSidePanel";
import {
  FLAG_LABELS,
  InlineReason,
  PanelMessage,
  fieldLabel,
  formatCount,
  formatDay,
  formatTime,
  inputClassName,
  money,
  rupees,
} from "./adminBits";
import {
  COMMISSION_STATE_TONES,
  AdminStatusPill,
  StatusDot,
  commissionState,
} from "./adminTones";
import { includedValues, multiLabel, useAdminListUrl } from "./useAdminListUrl";

const STATE_LABELS = Object.fromEntries(
  ADMIN_COMMISSION_STATES.map((state) => [
    state,
    COMMISSION_STATE_TONES[state].label,
  ]),
);
const KIND_LABELS: Record<AffiliateCommissionKind, string> = {
  sale: "Sale",
  reversal: "Refund",
  adjustment: "Adjustment",
};
const STATE_NOTES: Record<AdminCommissionState, string> = {
  held: "flagged for review",
  pending: "in the refund period",
  owed: "ready to pay",
  in_payout: "in an open payout",
  paid: "paid out",
  rejected: "not counted",
};
const SUMMARY_KEYS: Record<
  AdminCommissionState,
  "held" | "pending" | "owed" | "inPayout" | "paid" | "rejected"
> = {
  held: "held",
  pending: "pending",
  owed: "owed",
  in_payout: "inPayout",
  paid: "paid",
  rejected: "rejected",
};

function rowTitle(row: AdminCommissionRow) {
  if (row.kind === "sale") return row.item ?? "Sale";
  return row.kind === "reversal" ? "Refund" : "Adjustment";
}

/** The affiliates for a filter or a picker: the 50 who earned most. */
function useAffiliateOptions(search = "", onlyApproved = false) {
  return useAdminAffiliates({
    q: search.trim(),
    statuses: onlyApproved ? "approved" : undefined,
    sort: "earned",
    pageSize: 50,
  });
}

/**
 * The commission ledger across affiliates: by state, kind, affiliate and
 * date, searched by order, code or buyer. A row opens beside the list,
 * where a held or pending commission can be approved, rejected or credited
 * to someone else.
 */
export function AffiliateCommissionsTab() {
  const { can } = useCapabilities();
  const url = useAdminListUrl({ defaultRange: "all" });
  const states = url.list("states", ADMIN_COMMISSION_STATES);
  const kinds = url.list("kinds", AFFILIATE_COMMISSION_KINDS);
  const affiliateIds = url.list("affiliates");
  const [adjusting, setAdjusting] = useState(false);

  const filters = {
    states: states.join(","),
    kinds: kinds.join(","),
    affiliateIds: affiliateIds.join(","),
    q: url.search,
    ...url.days,
  };
  const list = useAdminCommissions({
    ...filters,
    page: url.page,
    pageSize: url.pageSize,
  });
  const data = list.data;
  const rows = data?.items ?? [];

  const { page, setPage } = url;
  useEffect(() => {
    if (data && data.total > 0 && page > data.pageCount)
      setPage(data.pageCount);
  }, [data, page, setPage]);

  usePageSearchShortcut("commissions-search-input");

  const affiliateOptions = useAffiliateOptions();
  const affiliateGroups = useMemo(
    () => [
      {
        id: "affiliates",
        options: (affiliateOptions.data?.items ?? []).map((row) => ({
          id: row.id,
          label: row.name ? `${row.code} · ${row.name}` : row.code,
        })),
      },
    ],
    [affiliateOptions.data],
  );
  const affiliateLabels = useMemo(
    () =>
      Object.fromEntries(
        (affiliateOptions.data?.items ?? []).map((row) => [row.id, row.code]),
      ),
    [affiliateOptions.data],
  );

  const summary = data?.summary;
  const setStates = (next: readonly AdminCommissionState[]) =>
    url.set({
      states: next.length === ADMIN_COMMISSION_STATES.length ? null : next,
    });
  const tiles = summary
    ? ADMIN_COMMISSION_STATES.map((state) => {
        const figure = summary[SUMMARY_KEYS[state]];
        const only = states.length === 1 && states[0] === state;
        return {
          id: state,
          title: STATE_LABELS[state]!,
          value: rupees(figure.amount.amountMinor),
          note: `${formatCount(figure.count)} · ${STATE_NOTES[state]}`,
          active: only,
          onSelect: () => setStates(only ? [] : [state]),
        };
      })
    : null;

  const columns: readonly AdminColumn<AdminCommissionRow>[] = [
    {
      id: "date",
      header: "Date",
      className: "w-[7.5rem]",
      cell: (row) => (
        <>
          <p className="m-0 text-sm font-semibold text-(--text)">
            {formatDay(row.createdAt)}
          </p>
          <p className="m-0 font-mono text-xs text-(--muted)">
            {formatTime(row.createdAt)}
          </p>
        </>
      ),
    },
    {
      id: "affiliate",
      header: "Affiliate",
      className: "w-[22%]",
      skeleton: "w-28",
      cell: (row) => (
        <div className="min-w-0">
          <p className="m-0 truncate font-mono text-sm font-semibold text-(--accent)">
            {row.affiliate.code}
          </p>
          <p className="m-0 truncate text-xs text-(--muted)">
            {row.affiliate.name ?? "–"}
          </p>
        </div>
      ),
    },
    {
      id: "what",
      header: "For",
      skeleton: "w-40",
      cell: (row) => (
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-(--text)">
            {rowTitle(row)}
          </p>
          <p className="m-0 truncate text-xs text-(--muted)">
            {row.order
              ? `${row.order.number}${row.order.buyer ? ` · ${row.order.buyer}` : ""}`
              : (row.note ?? "–")}
          </p>
        </div>
      ),
    },
    {
      id: "rate",
      header: "Rate",
      align: "right",
      className: "hidden w-[8rem] @5xl:table-cell",
      cell: (row) =>
        row.rate ? (
          <>
            <p className="m-0 text-sm text-(--text-secondary)">
              {formatAffiliateRate({
                rateType: row.rate.type,
                rateValue: row.rate.value,
                currency: row.amount.currency,
              })}
            </p>
            {row.base && (
              <p className="m-0 text-xs text-(--muted)">of {money(row.base)}</p>
            )}
          </>
        ) : (
          <span className="text-sm text-(--muted)">–</span>
        ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      className: "w-[8rem]",
      cell: (row) => (
        <span
          className={`text-sm font-bold ${row.amount.amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
        >
          {money(row.amount)}
        </span>
      ),
    },
    {
      id: "state",
      header: "Status",
      className: "w-[10rem]",
      skeleton: "w-20",
      cell: (row) => {
        const state = commissionState(row);
        return (
          <div className="flex flex-col items-start gap-1">
            <AdminStatusPill status={COMMISSION_STATE_TONES[state]} />
            {state === "pending" && (
              <span className="text-xs text-(--muted)">
                due {formatDay(row.availableAt)}
              </span>
            )}
            {state === "held" && row.flags[0] && (
              <span className="max-w-full truncate text-xs text-amber-600 dark:text-amber-400">
                {FLAG_LABELS[row.flags[0]] ?? row.flags[0]}
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
  // A row acted on can leave the filtered page; the panel keeps showing it.
  const lastRowRef = useRef<AdminCommissionRow | null>(null);
  const foundRow = rows.find((row) => row.id === url.openId) ?? null;
  if (foundRow) lastRowRef.current = foundRow;
  const openRow =
    foundRow ??
    (lastRowRef.current?.id === url.openId ? lastRowRef.current : null);

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Commissions"
        description="Every commission, refund and adjustment: review what's held, approve early, or correct."
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
        {can("affiliate.manage") && (
          <button
            type="button"
            className={panelPrimaryButton}
            onClick={() => setAdjusting(true)}
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            Adjustment
          </button>
        )}
      </AdminTabHeader>

      <AdminWithPanel
        panel={
          <AdminSidePanel
            openId={url.openId}
            onOpenChange={url.setOpenId}
            label="Commission"
            storageKey="veolms-commissions-panel-width"
            heading={openRow?.order?.number ?? openRow?.affiliate.code}
            step={step}
          >
            {openRow ? (
              <CommissionDetailBody key={openRow.id} row={openRow} />
            ) : url.openId && !list.isPending ? (
              <PanelSections>
                <PanelMessage tone="error">
                  This commission isn&apos;t on this page of the list any more.
                </PanelMessage>
              </PanelSections>
            ) : null}
          </AdminSidePanel>
        }
      >
        <AdminSummaryTiles
          label="Commissions by status"
          tiles={tiles}
          count={6}
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
                  ADMIN_COMMISSION_STATES.length,
                )}
                buttonLeading={
                  states.length === 1 ? (
                    <StatusDot tone={COMMISSION_STATE_TONES[states[0]!].tone} />
                  ) : undefined
                }
                groups={[
                  {
                    id: "states",
                    options: ADMIN_COMMISSION_STATES.map((state) => ({
                      id: state,
                      label: summary
                        ? `${STATE_LABELS[state]} (${formatCount(summary[SUMMARY_KEYS[state]].count)})`
                        : STATE_LABELS[state]!,
                      leading: (
                        <StatusDot tone={COMMISSION_STATE_TONES[state].tone} />
                      ),
                    })),
                  },
                ]}
                value={{ selected: states, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) =>
                  setStates(
                    includedValues(selected, mode, ADMIN_COMMISSION_STATES),
                  )
                }
                triggerClassName={adminFilterWidth}
                contentClassName="w-[19rem]"
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
              <MultiSelectFilter
                name="Affiliate"
                noun="affiliates"
                buttonLabel={
                  affiliateIds.length === 0
                    ? "All affiliates"
                    : affiliateIds.length === 1
                      ? (affiliateLabels[affiliateIds[0]!] ?? "1 affiliate")
                      : `${affiliateIds.length} affiliates`
                }
                groups={affiliateGroups}
                isLoading={affiliateOptions.isPending}
                emptyText="No affiliates yet."
                searchPlaceholder="Find an affiliate"
                value={{ selected: affiliateIds, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) => {
                  const all = affiliateGroups[0]!.options.map(
                    (option) => option.id,
                  );
                  url.set({
                    affiliates: (mode === "include"
                      ? selected
                      : all.filter((id) => !selected.includes(id))
                    ).slice(0, 50),
                  });
                }}
                triggerClassName={`${adminFilterWidth} col-span-2 @lg:col-span-1`}
                contentClassName="w-[22rem]"
              />
            </>
          }
          search={
            <AdminSearchBox
              id="commissions-search-input"
              value={url.searchText}
              onChange={url.setSearchText}
              placeholder="Search by order, code or buyer email"
            />
          }
        />

        <AdminDataTable
          label="Commissions"
          nouns={["commission", "commissions"]}
          rows={rows}
          columns={columns}
          card={(row) => {
            const state = commissionState(row);
            return (
              <>
                <div className="flex w-full items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold text-(--text)">
                      {rowTitle(row)}
                    </p>
                    <p className="m-0 truncate text-xs text-(--muted)">
                      <span className="font-mono font-semibold text-(--accent)">
                        {row.affiliate.code}
                      </span>{" "}
                      · {formatDay(row.createdAt)}
                      {row.order ? ` · ${row.order.number}` : ""}
                    </p>
                  </div>
                  <p
                    className={`m-0 shrink-0 text-sm font-bold tabular-nums ${row.amount.amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
                  >
                    {money(row.amount)}
                  </p>
                </div>
                <div className="flex w-full items-center gap-2">
                  <AdminStatusPill status={COMMISSION_STATE_TONES[state]} />
                  {state === "held" && row.flags[0] && (
                    <span className="truncate text-xs text-amber-600 dark:text-amber-400">
                      {FLAG_LABELS[row.flags[0]] ?? row.flags[0]}
                    </span>
                  )}
                </div>
              </>
            );
          }}
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
          selectedId={url.openId}
          onOpen={url.setOpenId}
          exportUrl={affiliatesAdminService.reportExportUrl(
            "commissions",
            filters,
          )}
          isFiltered={url.isFiltered}
          onResetFilters={url.reset}
          empty={{
            title: "No commissions yet",
            text: "They appear here when a sale comes through an affiliate's link or code.",
          }}
        />
      </AdminWithPanel>

      {adjusting && <AdjustmentPanel onClose={() => setAdjusting(false)} />}
    </div>
  );
}

/** One commission: the amounts, why it is held, and what can be done. */
function CommissionDetailBody({ row }: { row: AdminCommissionRow }) {
  const { can } = useCapabilities();
  const approve = useApproveAffiliateCommission();
  const reject = useRejectAffiliateCommission();
  const recredit = useSetOrderAttribution();
  const [mode, setMode] = useState<"reject" | "recredit" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const state = commissionState(row);
  const open = row.status === "pending" && !row.inPayout;
  // Once acted on, the row shown may be out of date: no second action.
  const canManage = can("affiliate.manage") && open && !done;
  const negative = row.amount.amountMinor < 0;
  const rate = row.rate
    ? formatAffiliateRate({
        rateType: row.rate.type,
        rateValue: row.rate.value,
        currency: row.amount.currency,
      })
    : null;

  return (
    <>
      <PanelHero>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs font-semibold tracking-wider text-(--muted) uppercase">
            {KIND_LABELS[row.kind]} commission
          </span>
          <AdminStatusPill status={COMMISSION_STATE_TONES[state]} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <p
            className={`m-0 text-3xl font-bold tracking-tight tabular-nums ${negative ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
          >
            {money(row.amount)}
          </p>
          {rate && row.base ? (
            <p className="m-0 text-sm text-(--muted)">
              {rate} of {money(row.base)}
            </p>
          ) : null}
        </div>
        <p className="m-0 mt-1 truncate text-sm text-(--text-secondary)">
          <span className="font-semibold text-(--text)">{rowTitle(row)}</span>
          <span className="text-(--muted)">
            {" · "}
            {formatDay(row.createdAt)}, {formatTime(row.createdAt)}
          </span>
        </p>
        {state !== "rejected" && <CommissionProgress row={row} state={state} />}
      </PanelHero>

      <PanelSections>
        {done && <PanelMessage tone="done">{done}</PanelMessage>}
        {approve.error && (
          <PanelMessage tone="error">{approve.error.message}</PanelMessage>
        )}
        {mode === "reject" && (
          <InlineReason
            title="Reject this commission"
            description="It no longer counts toward the affiliate's earnings; a sale's pending refund rows go with it. The affiliate sees the reason."
            confirmLabel="Reject"
            pending={reject.isPending}
            error={reject.error?.message}
            onConfirm={(reason) =>
              reject.mutate(
                { id: row.id, reason },
                {
                  onSuccess: () => {
                    setMode(null);
                    setDone("Rejected.");
                  },
                },
              )
            }
            onCancel={() => setMode(null)}
          />
        )}
        {mode === "recredit" && row.order && (
          <RecreditBox
            row={row}
            pending={recredit.isPending}
            error={recredit.error?.message}
            onCancel={() => setMode(null)}
            onSubmit={(affiliateId, note) =>
              recredit.mutate(
                {
                  orderId: row.order!.id,
                  body: { affiliateId, ...(note ? { note } : {}) },
                },
                {
                  onSuccess: () => {
                    setMode(null);
                    setDone(
                      affiliateId
                        ? "Credited to the chosen affiliate."
                        : "The credit was removed.",
                    );
                  },
                },
              )
            }
          />
        )}

        {row.flags.length > 0 &&
          (state === "held" ? (
            <PanelSection title="Held for review" icon={Warning} tone="warning">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {row.flags.map((flag) => (
                  <li
                    key={flag}
                    className="flex items-center gap-2 text-sm font-medium text-(--text)"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                    {FLAG_LABELS[flag] ?? flag}
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-2.5 text-xs text-(--muted)">
                It won&apos;t be owed until you decide: approve it if the sale
                is genuine, or reject it.
              </p>
            </PanelSection>
          ) : (
            <p className="m-0 flex items-start gap-2 rounded-xl border border-(--border) px-3 py-2.5 text-xs text-(--muted)">
              <Warning
                size={14}
                weight="duotone"
                aria-hidden="true"
                className="mt-px shrink-0 text-amber-500"
              />
              <span>
                Was flagged (
                {row.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(", ")})
                and {state === "rejected" ? "rejected" : "approved"}.
              </span>
            </p>
          ))}

        <PanelSection title="Details" icon={Receipt}>
          <PanelRows>
            <div className="flex items-center justify-between gap-4 py-2">
              <dt className="shrink-0 text-sm text-(--muted)">Affiliate</dt>
              <dd className="m-0 flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-(--text)">
                  {row.affiliate.name ?? "–"}
                </span>
                <CodeChip code={row.affiliate.code} />
              </dd>
            </div>
            {row.order && (
              <PanelRow label="Order">
                <span className="font-mono text-xs">{row.order.number}</span>
              </PanelRow>
            )}
            {row.order && (
              <PanelRow label="Buyer">{row.order.buyer ?? "–"}</PanelRow>
            )}
            {row.item && <PanelRow label="Product">{row.item}</PanelRow>}
          </PanelRows>
        </PanelSection>

        <PanelSection title="How it's worked out" icon={Calculator}>
          {row.base && rate ? (
            <div className="flex items-stretch gap-2 text-center">
              <div className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--card-surface) px-2 py-2">
                <p className="m-0 text-[0.6875rem] font-semibold text-(--muted)">
                  Sale value
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-(--text) tabular-nums">
                  {money(row.base)}
                </p>
              </div>
              <span className="self-center text-sm font-bold text-(--muted)">
                ×
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--card-surface) px-2 py-2">
                <p className="m-0 text-[0.6875rem] font-semibold text-(--muted)">
                  Rate
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-(--text) tabular-nums">
                  {rate}
                </p>
              </div>
              <span className="self-center text-sm font-bold text-(--muted)">
                =
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-2">
                <p className="m-0 text-[0.6875rem] font-semibold text-(--muted)">
                  Commission
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-(--accent) tabular-nums">
                  {money(row.amount)}
                </p>
              </div>
            </div>
          ) : (
            <PanelRows>
              <PanelRow label="Amount" strong>
                {money(row.amount)}
              </PanelRow>
            </PanelRows>
          )}
          {row.payoutAmount &&
            row.payoutAmount.currency !== row.amount.currency && (
              <p className="m-0 mt-2 text-xs text-(--muted)">
                Paid in rupees: {money(row.payoutAmount)}
              </p>
            )}
          <p className="m-0 mt-2.5 text-xs text-(--muted)">
            On the price before tax, after any discount.
          </p>
        </PanelSection>

        {row.note && (
          <PanelSection title="Note" icon={NoteIcon}>
            <p className="m-0 text-sm whitespace-pre-wrap text-(--text)">
              {row.note}
            </p>
          </PanelSection>
        )}
      </PanelSections>

      {canManage && !mode && (
        <PanelActions>
          <button
            type="button"
            className={panelDangerButton}
            onClick={() => setMode("reject")}
          >
            Reject
          </button>
          <button
            type="button"
            className={panelPrimaryButton}
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(row.id, {
                onSuccess: () => setDone("Approved. It's owed now."),
              })
            }
          >
            {approve.isPending ? "Approving…" : "Approve now"}
          </button>
          {row.kind === "sale" && row.order && (
            <button
              type="button"
              className={`${panelSecondaryButton} col-span-2`}
              onClick={() => setMode("recredit")}
            >
              Credit someone else
            </button>
          )}
        </PanelActions>
      )}
    </>
  );
}

const PROGRESS_STEPS = ["Earned", "Owed", "In payout", "Paid"] as const;

/** Where the commission is on its way to being paid. */
function CommissionProgress({
  row,
  state,
}: {
  row: AdminCommissionRow;
  state: AdminCommissionState;
}) {
  const reached =
    state === "paid" ? 3 : state === "in_payout" ? 2 : state === "owed" ? 1 : 0;
  const notes = [
    state === "held" ? "flagged" : formatDay(row.createdAt),
    reached >= 1
      ? "ready to pay"
      : state === "held"
        ? "after review"
        : formatDay(row.availableAt),
    reached >= 2 ? "asked for" : "",
    reached >= 3 ? "done" : "",
  ];
  return (
    <ProgressSteps
      steps={PROGRESS_STEPS.map((label, index) => ({
        label: state === "held" && index === 0 ? "In review" : label,
        note: notes[index] ?? "",
      }))}
      reached={reached}
      allDone={state === "paid"}
      warn={state === "held"}
    />
  );
}

/** Picks an approved affiliate by code or name. */
function AffiliatePicker({
  value,
  onChange,
  exceptId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  exceptId?: string;
}) {
  const [search, setSearch] = useState("");
  const list = useAffiliateOptions(search, true);
  const rows = (list.data?.items ?? []).filter((row) => row.id !== exceptId);
  return (
    <div className="flex flex-col gap-2">
      <input
        className={inputClassName}
        placeholder="Search by code or name"
        aria-label="Search affiliates"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        role="listbox"
        aria-label="Affiliates"
        className="flex max-h-56 flex-col overflow-y-auto rounded-xl border border-(--border) p-1"
      >
        {list.isPending ? (
          <span className="px-3 py-2 text-sm text-(--muted)">Loading…</span>
        ) : rows.length === 0 ? (
          <span className="px-3 py-2 text-sm text-(--muted)">
            No approved affiliate matches.
          </span>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={value === row.id}
              onClick={() => onChange(row.id)}
              className={`rounded-lg px-3 py-2 text-left text-sm ${value === row.id ? "bg-(--accent) text-(--on-accent)" : "text-(--text) hover:bg-(--hover)"}`}
            >
              <span className="font-mono font-semibold">{row.code}</span>
              {row.name ? (
                <span className="opacity-75"> · {row.name}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function RecreditBox({
  row,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  row: AdminCommissionRow;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (affiliateId: string | null, note: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <section
      role="group"
      aria-label="Credit someone else"
      className="rounded-2xl border border-(--border) bg-(--card-surface) p-4"
    >
      <h3 className="m-0 text-sm font-bold text-(--text)">
        Credit order {row.order?.number}
      </h3>
      <p className="m-0 mt-1 mb-3 text-sm text-(--muted)">
        Credited to {row.affiliate.code} now. Their commission is rejected and
        the new affiliate&apos;s is worked out afresh.
      </p>
      <AffiliatePicker
        value={target}
        onChange={setTarget}
        exceptId={row.affiliate.id}
      />
      <label className={`${fieldLabel} mt-3`}>
        Note (optional)
        <input
          className={`${inputClassName} font-normal`}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="m-0 mt-2 text-sm text-rose-500">
          {error}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={panelSecondaryButton}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={panelPrimaryButton}
          disabled={!target || pending}
          onClick={() => onSubmit(target, note.trim())}
        >
          Credit them
        </button>
        <button
          type="button"
          className={`${panelDangerButton} col-span-2`}
          disabled={pending}
          onClick={() => onSubmit(null, note.trim())}
        >
          Remove the credit
        </button>
      </div>
    </section>
  );
}

function AdjustmentPanel({ onClose }: { onClose: () => void }) {
  const add = useAddAffiliateAdjustment();
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"plus" | "minus">("plus");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const amount = Math.round(Number(amountText) * 100);
  const valid =
    Boolean(affiliateId) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    note.trim().length >= 3;
  return (
    <SlideOverPanel
      label="Adjustment"
      title="Add an adjustment"
      onClose={onClose}
    >
      <PanelBody>
        <div className="flex flex-col gap-4 text-sm">
          <p className="m-0 text-(--muted)">
            A correction in rupees, owed at once: a bonus, a bounced transfer,
            or anything a commission can&apos;t express. It can&apos;t be edited
            afterwards.
          </p>
          <div>
            <p className="m-0 mb-1.5 font-semibold text-(--text)">Affiliate</p>
            <AffiliatePicker value={affiliateId} onChange={setAffiliateId} />
          </div>
          <div
            role="radiogroup"
            aria-label="Direction"
            className="grid grid-cols-2 gap-1 rounded-xl border border-(--border) p-1"
          >
            {(
              [
                ["plus", "Add to their balance"],
                ["minus", "Take from it"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                onClick={() => setDirection(value)}
                className={`h-9 rounded-lg text-sm font-semibold ${direction === value ? "bg-(--accent) text-(--on-accent)" : "text-(--text-secondary) hover:bg-(--hover)"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={fieldLabel}>
            Amount (₹)
            <input
              className={`${inputClassName} font-normal`}
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          </label>
          <label className={fieldLabel}>
            Note (the affiliate sees it)
            <textarea
              className={`${inputClassName} min-h-24 py-2 font-normal`}
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {add.error && (
            <p role="alert" className="m-0 text-rose-500">
              {add.error.message}
            </p>
          )}
        </div>
      </PanelBody>
      <PanelFooter>
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={onClose}
        >
          Cancel
        </button>
        <Button
          elevation="flat"
          motion="static"
          disabled={!valid || add.isPending}
          onClick={() =>
            add.mutate(
              {
                affiliateId: affiliateId!,
                amountMinor: direction === "plus" ? amount : -amount,
                note: note.trim(),
              },
              { onSuccess: onClose },
            )
          }
        >
          {add.isPending ? "Saving…" : "Add adjustment"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
