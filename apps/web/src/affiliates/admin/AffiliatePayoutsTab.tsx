import { useEffect, useMemo, useRef, useState } from "react";
import {
  AFFILIATE_PAYOUT_METHODS,
  AFFILIATE_PAYOUT_STATUSES,
  type AdminPayout,
  type AffiliatePayoutStatus,
  type CreateAdminPayoutsResponse,
} from "@veolms/contracts";
import { BankIcon as Bank } from "@phosphor-icons/react/Bank";
import { CalculatorIcon as Calculator } from "@phosphor-icons/react/Calculator";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { NoteIcon } from "@phosphor-icons/react/Note";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { WarningIcon as Warning } from "@phosphor-icons/react/Warning";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";

import { usePageSearchShortcut } from "../../hooks/usePageSearchShortcut";
import { DateRangeControl } from "../../orders/filters/DateRangeControl";
import { MultiSelectFilter } from "../../orders/filters/MultiSelectFilter";
import { StudentAvatar } from "../../orders/StudentAvatar";
import { useCapabilities } from "../../services/authorization";
import {
  affiliatesAdminService,
  useAdminAffiliates,
  useAdminPayouts,
  useCloseAffiliatePayout,
  useCreateAffiliatePayouts,
  useMarkAffiliatePayoutPaid,
} from "../../services/affiliates";
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
  PanelActions,
  PanelHero,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
} from "./AdminPanelBits";
import { AdminSidePanel, AdminWithPanel, usePanelStep } from "./AdminSidePanel";
import {
  InlineReason,
  PanelMessage,
  fieldLabel,
  formatCount,
  formatDay,
  indiaToday,
  inputClassName,
  money,
  rupees,
} from "./adminBits";
import {
  AdminStatusPill,
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUS_TONES,
  StatusDot,
} from "./adminTones";
import { includedValues, multiLabel, useAdminListUrl } from "./useAdminListUrl";

const STATUS_LABELS = Object.fromEntries(
  AFFILIATE_PAYOUT_STATUSES.map((status) => [
    status,
    PAYOUT_STATUS_TONES[status].label,
  ]),
);

const SKIP_LABELS: Record<
  CreateAdminPayoutsResponse["skipped"][number]["reason"],
  string
> = {
  not_approved: "not approved",
  payout_open: "already has a payout to pay",
  details_missing: "no payout details",
  below_minimum: "below the minimum",
};

/**
 * Payouts: paid outside VeoLMS (UPI or bank transfer), then marked paid with
 * the reference; or rejected, or marked failed when a transfer bounced (the
 * money goes back to the affiliate's balance). Filtered by status, method,
 * affiliate and date; open payouts come first.
 */
export function AffiliatePayoutsTab() {
  const { can } = useCapabilities();
  const canPay = can("affiliate.payout");
  const url = useAdminListUrl({ defaultRange: "all" });
  const statuses = url.list("statuses", AFFILIATE_PAYOUT_STATUSES);
  const methods = url.list("methods", AFFILIATE_PAYOUT_METHODS);
  const affiliateIds = url.list("affiliates");
  const create = useCreateAffiliatePayouts();
  const [created, setCreated] = useState<CreateAdminPayoutsResponse | null>(
    null,
  );

  const filters = {
    statuses: statuses.join(","),
    methods: methods.join(","),
    affiliateIds: affiliateIds.join(","),
    q: url.search,
    ...url.days,
  };
  const list = useAdminPayouts({
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

  usePageSearchShortcut("payouts-search-input");

  const affiliateOptions = useAdminAffiliates({ sort: "earned", pageSize: 50 });
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

  const setStatuses = (next: readonly AffiliatePayoutStatus[]) =>
    url.set({
      statuses: next.length === AFFILIATE_PAYOUT_STATUSES.length ? null : next,
    });
  const onlyToPay = statuses.length === 1 && statuses[0] === "requested";
  const onlyPaid = statuses.length === 1 && statuses[0] === "paid";
  const summary = data?.summary;
  const tiles = summary
    ? [
        {
          id: "to-pay",
          title: "To pay",
          value: rupees(summary.toPay.amount.amountMinor),
          note: `${formatCount(summary.toPay.count)} ${summary.toPay.count === 1 ? "payout" : "payouts"} open`,
          active: onlyToPay,
          onSelect: () => setStatuses(onlyToPay ? [] : ["requested"]),
        },
        {
          id: "paid",
          title: "Paid",
          value: rupees(summary.paid.amount.amountMinor),
          note: `${formatCount(summary.paid.count)} ${summary.paid.count === 1 ? "payout" : "payouts"}, net`,
          active: onlyPaid,
          onSelect: () => setStatuses(onlyPaid ? [] : ["paid"]),
        },
        {
          id: "tds",
          title: "TDS withheld",
          value: rupees(summary.tds.amountMinor),
          note: "on payouts paid",
        },
        {
          id: "closed",
          title: "Rejected or failed",
          value: formatCount(summary.closed),
          note: "money went back",
        },
      ]
    : null;

  const columns: readonly AdminColumn<AdminPayout>[] = [
    {
      id: "asked",
      header: "Asked",
      className: "w-[8rem]",
      cell: (row) => (
        <>
          <p className="m-0 text-sm font-semibold text-(--text)">
            {formatDay(row.createdAt)}
          </p>
          <p className="m-0 text-xs text-(--muted)">
            {row.requestedBy === "admin" ? "by the academy" : "by them"}
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
      id: "method",
      header: "Pay to",
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
      id: "gross",
      header: "Amount",
      align: "right",
      className: "w-[8rem]",
      cell: (row) => (
        <span className="text-sm font-bold text-(--text)">
          {money(row.gross)}
        </span>
      ),
    },
    {
      id: "tds",
      header: "TDS",
      align: "right",
      className: "hidden w-[7rem] @5xl:table-cell",
      cell: (row) => (
        <span className="text-sm text-(--text-secondary)">
          {row.status === "paid"
            ? money(row.tds)
            : row.tdsSuggestion && row.tdsSuggestion.suggested.amountMinor > 0
              ? `~${money(row.tdsSuggestion.suggested)}`
              : "–"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      className: "w-[10rem]",
      skeleton: "w-20",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <AdminStatusPill status={PAYOUT_STATUS_TONES[row.status]} />
          {row.status === "paid" && row.paidOn && (
            <span className="text-xs text-(--muted)">
              {formatDay(row.paidOn)}
            </span>
          )}
        </div>
      ),
    },
  ];

  const step = usePanelStep(
    rows,
    url.openId,
    url.setOpenId,
    (url.page - 1) * url.pageSize,
    data?.total ?? 0,
  );
  const lastRowRef = useRef<AdminPayout | null>(null);
  const foundRow = rows.find((row) => row.id === url.openId) ?? null;
  if (foundRow) lastRowRef.current = foundRow;
  const openRow =
    foundRow ??
    (lastRowRef.current?.id === url.openId ? lastRowRef.current : null);

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Payouts"
        description="Pay affiliates by UPI or bank transfer, then record it here with the reference."
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
        {canPay && (
          <>
            <a
              className={panelSecondaryButton}
              href={affiliatesAdminService.payoutsExportUrl({
                ...filters,
                statuses: "requested",
              })}
              download
            >
              <DownloadSimple size={16} weight="bold" aria-hidden="true" />
              CSV to pay
            </a>
            <button
              type="button"
              className={panelPrimaryButton}
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { allAboveMinimum: true },
                  { onSuccess: setCreated },
                )
              }
            >
              <Wallet size={16} weight="bold" aria-hidden="true" />
              {create.isPending ? "Making payouts…" : "Pay everyone owed"}
            </button>
          </>
        )}
      </AdminTabHeader>

      <AdminWithPanel
        panel={
          <AdminSidePanel
            openId={url.openId}
            onOpenChange={url.setOpenId}
            label="Payout"
            storageKey="veolms-payouts-panel-width"
            step={step}
          >
            {openRow ? (
              <PayoutDetailBody key={openRow.id} payout={openRow} />
            ) : url.openId && !list.isPending ? (
              <PanelSections>
                <PanelMessage tone="error">
                  This payout isn&apos;t on this page of the list any more.
                </PanelMessage>
              </PanelSections>
            ) : null}
          </AdminSidePanel>
        }
      >
        {create.error && (
          <PanelMessage tone="error">{create.error.message}</PanelMessage>
        )}
        {created && (
          <PanelMessage tone="done">
            {created.created.length === 0
              ? "No new payouts: nobody was owed enough."
              : `${created.created.length} ${created.created.length === 1 ? "payout" : "payouts"} made.`}
            {created.skipped.length > 0 &&
              ` Left out: ${created.skipped
                .map((skip) => `${skip.code} (${SKIP_LABELS[skip.reason]})`)
                .join(", ")}.`}
          </PanelMessage>
        )}

        <AdminSummaryTiles
          label="Payouts summary"
          tiles={tiles}
          count={4}
          isLoading={list.isPending}
        />

        <AdminFilterRow
          filters={
            <>
              <MultiSelectFilter
                name="Status"
                noun="statuses"
                buttonLabel={multiLabel(
                  statuses,
                  STATUS_LABELS,
                  ["status", "statuses"],
                  AFFILIATE_PAYOUT_STATUSES.length,
                )}
                buttonLeading={
                  statuses.length === 1 ? (
                    <StatusDot tone={PAYOUT_STATUS_TONES[statuses[0]!].tone} />
                  ) : undefined
                }
                groups={[
                  {
                    id: "statuses",
                    options: AFFILIATE_PAYOUT_STATUSES.map((status) => ({
                      id: status,
                      label: STATUS_LABELS[status]!,
                      leading: (
                        <StatusDot tone={PAYOUT_STATUS_TONES[status].tone} />
                      ),
                    })),
                  },
                ]}
                value={{ selected: statuses, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) =>
                  setStatuses(
                    includedValues(selected, mode, AFFILIATE_PAYOUT_STATUSES),
                  )
                }
                triggerClassName={adminFilterWidth}
                contentClassName="w-[18rem]"
              />
              <MultiSelectFilter
                name="Method"
                noun="methods"
                buttonLabel={multiLabel(
                  methods,
                  PAYOUT_METHOD_LABELS,
                  ["method", "methods"],
                  AFFILIATE_PAYOUT_METHODS.length,
                )}
                groups={[
                  {
                    id: "methods",
                    options: AFFILIATE_PAYOUT_METHODS.map((method) => ({
                      id: method,
                      label: PAYOUT_METHOD_LABELS[method],
                    })),
                  },
                ]}
                value={{ selected: methods, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) => {
                  const next = includedValues(
                    selected,
                    mode,
                    AFFILIATE_PAYOUT_METHODS,
                  );
                  url.set({
                    methods:
                      next.length === AFFILIATE_PAYOUT_METHODS.length
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
              id="payouts-search-input"
              value={url.searchText}
              onChange={url.setSearchText}
              placeholder="Search by code, name, email or reference"
            />
          }
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
                  <p className="m-0 truncate text-sm font-semibold text-(--text)">
                    <span className="font-mono text-(--accent)">
                      {row.affiliate.code}
                    </span>
                    {row.affiliate.name ? ` · ${row.affiliate.name}` : ""}
                  </p>
                  <p className="m-0 truncate text-xs text-(--muted)">
                    {formatDay(row.createdAt)} ·{" "}
                    {PAYOUT_METHOD_LABELS[row.method]}
                    {row.hint ? ` ${row.hint}` : ""}
                  </p>
                </div>
                <p className="m-0 shrink-0 text-sm font-bold text-(--text) tabular-nums">
                  {money(row.gross)}
                </p>
              </div>
              <AdminStatusPill status={PAYOUT_STATUS_TONES[row.status]} />
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
          selectedId={url.openId}
          onOpen={url.setOpenId}
          exportUrl={
            canPay
              ? affiliatesAdminService.payoutsExportUrl({
                  ...filters,
                  // Every status unless some are chosen.
                  statuses:
                    filters.statuses || AFFILIATE_PAYOUT_STATUSES.join(","),
                })
              : undefined
          }
          isFiltered={url.isFiltered}
          onResetFilters={url.reset}
          empty={{
            title: "No payouts yet",
            text: "An affiliate asks for one from their dashboard, or press Pay everyone owed.",
          }}
        />
      </AdminWithPanel>
    </div>
  );
}

/** One payout: the amounts, where to send it, and marking it paid or closed. */
function PayoutDetailBody({ payout }: { payout: AdminPayout }) {
  const { can } = useCapabilities();
  const close = useCloseAffiliatePayout();
  const [mode, setMode] = useState<"pay" | "rejected" | "failed" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const canAct =
    can("affiliate.payout") && payout.status === "requested" && !done;
  const suggestion = payout.tdsSuggestion;
  const paid = payout.status === "paid";

  return (
    <>
      <PanelHero>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs font-semibold tracking-wider text-(--muted) uppercase">
            {paid ? "Paid out" : "Payout"}
          </span>
          <AdminStatusPill status={PAYOUT_STATUS_TONES[payout.status]} />
        </div>
        <p className="m-0 mt-2 text-3xl font-bold tracking-tight text-(--text) tabular-nums">
          {money(paid ? payout.net : payout.gross)}
        </p>
        <p className="m-0 mt-1 text-sm text-(--text-secondary)">
          {PAYOUT_METHOD_LABELS[payout.method]}
          {payout.hint ? ` · ${payout.hint}` : ""}
        </p>
        <p className="m-0 mt-0.5 text-xs text-(--muted)">
          {paid
            ? `Paid ${formatDay(payout.paidOn)}`
            : `Asked ${formatDay(payout.createdAt)}`}
          {payout.requestedBy === "admin" ? " · made by the academy" : ""}
        </p>
      </PanelHero>

      <PanelSections>
        {done && <PanelMessage tone="done">{done}</PanelMessage>}
        {mode === "pay" && (
          <MarkPaidBox
            payout={payout}
            onCancel={() => setMode(null)}
            onDone={() => {
              setMode(null);
              setDone("Marked paid. The affiliate was told.");
            }}
          />
        )}
        {(mode === "rejected" || mode === "failed") && (
          <InlineReason
            title={
              mode === "rejected" ? "Reject this payout" : "The transfer failed"
            }
            description={`${money(payout.gross)} goes back to ${payout.affiliate.code}'s balance and they can ask again. They see the reason.`}
            confirmLabel={mode === "rejected" ? "Reject" : "Mark failed"}
            pending={close.isPending}
            error={close.error?.message}
            onConfirm={(reason) =>
              close.mutate(
                { id: payout.id, status: mode, body: { reason } },
                {
                  onSuccess: () => {
                    setMode(null);
                    setDone(
                      mode === "rejected"
                        ? "Rejected. The money is back in their balance."
                        : "Marked failed. The money is back in their balance.",
                    );
                  },
                },
              )
            }
            onCancel={() => setMode(null)}
          />
        )}

        {suggestion &&
          payout.status === "requested" &&
          suggestion.suggested.amountMinor > 0 && (
            <PanelSection title="TDS to deduct" icon={Warning} tone="warning">
              <PanelRows>
                <PanelRow label="Suggested">
                  {money(suggestion.suggested)} ({suggestion.rate / 100}%)
                </PanelRow>
                <PanelRow label="Paid this year">
                  {money(suggestion.yearPaid)}
                </PanelRow>
                <PanelRow label="PAN">
                  {suggestion.panOnFile ? "On file" : "Not given (20%)"}
                </PanelRow>
              </PanelRows>
              {suggestion.crossesThreshold && (
                <p className="m-0 mt-2 text-xs text-amber-700 dark:text-amber-300">
                  This payout takes the year past ₹20,000: earlier payouts this
                  year may also need TDS. Check with your accountant.
                </p>
              )}
            </PanelSection>
          )}

        <PanelSection title="Affiliate" icon={UserCircle}>
          <div className="flex items-center gap-3">
            <StudentAvatar
              name={payout.affiliate.name ?? payout.affiliate.code}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-semibold text-(--text)">
                {payout.affiliate.name ?? "–"}
              </p>
              <CodeChip code={payout.affiliate.code} />
            </div>
          </div>
        </PanelSection>

        <PanelSection title="Amount" icon={Calculator}>
          <PanelRows>
            <PanelRow label="Gross">{money(payout.gross)}</PanelRow>
            <PanelRow label="TDS">{money(payout.tds)}</PanelRow>
            <PanelRow label={paid ? "Paid" : "Net"} strong>
              {money(payout.net)}
            </PanelRow>
          </PanelRows>
        </PanelSection>

        <PanelSection title="Pay to" icon={Bank}>
          <PanelRows>
            <PanelRow label="Method">
              {PAYOUT_METHOD_LABELS[payout.method]}
            </PanelRow>
            <PanelRow label="Account">
              <span className="font-mono text-xs">{payout.hint ?? "–"}</span>
            </PanelRow>
          </PanelRows>
          <p className="m-0 mt-2 text-xs text-(--muted)">
            The full account is on the affiliate&apos;s panel (Affiliates tab)
            and in the CSV to pay.
          </p>
        </PanelSection>

        {(payout.reference || payout.note || payout.reason) && (
          <PanelSection title="Record" icon={NoteIcon}>
            <PanelRows>
              {payout.reference && (
                <PanelRow label="Reference">
                  <span className="font-mono text-xs select-all">
                    {payout.reference}
                  </span>
                </PanelRow>
              )}
              {payout.decidedAt && (
                <PanelRow label="Recorded">
                  {formatDay(payout.decidedAt)}
                </PanelRow>
              )}
            </PanelRows>
            {(payout.note || payout.reason) && (
              <p className="m-0 mt-2 text-sm whitespace-pre-wrap text-(--text)">
                {payout.reason ?? payout.note}
              </p>
            )}
          </PanelSection>
        )}
      </PanelSections>

      {canAct && !mode && (
        <PanelActions>
          <button
            type="button"
            className={`${panelPrimaryButton} col-span-2`}
            onClick={() => setMode("pay")}
          >
            Mark paid
          </button>
          <button
            type="button"
            className={panelDangerButton}
            onClick={() => setMode("rejected")}
          >
            Reject
          </button>
          <button
            type="button"
            className={panelDangerButton}
            onClick={() => setMode("failed")}
          >
            Transfer failed
          </button>
        </PanelActions>
      )}
    </>
  );
}

function MarkPaidBox({
  payout,
  onCancel,
  onDone,
}: {
  payout: AdminPayout;
  onCancel: () => void;
  onDone: () => void;
}) {
  const mark = useMarkAffiliatePayoutPaid();
  const suggested = payout.tdsSuggestion?.suggested.amountMinor ?? 0;
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(indiaToday());
  const [tds, setTds] = useState((suggested / 100).toFixed(2));
  const [note, setNote] = useState("");
  const tdsMinor = Math.round(Number(tds || "0") * 100);
  const tdsValid =
    Number.isFinite(tdsMinor) &&
    tdsMinor >= 0 &&
    tdsMinor <= payout.gross.amountMinor;
  const valid =
    reference.trim().length >= 3 &&
    Boolean(paidOn) &&
    paidOn <= indiaToday() &&
    tdsValid;
  const net = {
    amountMinor: payout.gross.amountMinor - (tdsValid ? tdsMinor : 0),
    currency: payout.gross.currency,
  };
  return (
    <section
      role="group"
      aria-label="Mark paid"
      className="rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--card-surface))] p-4"
    >
      <h3 className="m-0 text-sm font-bold text-(--text)">
        Pay {money(net)} to {payout.affiliate.code}
      </h3>
      <p className="m-0 mt-1 text-xs text-(--muted)">
        Send it first, then record it. Paid is final; a mistake afterwards is
        fixed with an adjustment.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className={fieldLabel}>
          Payment reference (UTR or UPI)
          <input
            autoFocus
            className={`${inputClassName} font-normal`}
            value={reference}
            maxLength={100}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={fieldLabel}>
            Paid on
            <input
              type="date"
              className={`${inputClassName} font-normal`}
              value={paidOn}
              max={indiaToday()}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </label>
          <label className={fieldLabel}>
            TDS withheld (₹)
            <input
              className={`${inputClassName} font-normal`}
              inputMode="decimal"
              value={tds}
              aria-invalid={!tdsValid || undefined}
              onChange={(event) => setTds(event.target.value)}
            />
          </label>
        </div>
        <label className={fieldLabel}>
          Note (optional, for example a GST invoice number)
          <input
            className={`${inputClassName} font-normal`}
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <dl className="m-0 rounded-xl bg-(--card-surface) px-3 py-1.5">
          <DetailRow label="Gross">{money(payout.gross)}</DetailRow>
          <DetailRow label="TDS">
            {money({
              amountMinor: tdsValid ? tdsMinor : 0,
              currency: payout.gross.currency,
            })}
          </DetailRow>
          <DetailRow label="Net to pay" strong>
            {money(net)}
          </DetailRow>
        </dl>
        {mark.error && (
          <p role="alert" className="m-0 text-sm text-rose-500">
            {mark.error.message}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
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
            disabled={!valid || mark.isPending}
            onClick={() =>
              mark.mutate(
                {
                  id: payout.id,
                  body: {
                    reference: reference.trim(),
                    paidOn,
                    tdsMinor,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  },
                },
                { onSuccess: onDone },
              )
            }
          >
            {mark.isPending ? "Saving…" : "Mark paid"}
          </button>
        </div>
      </div>
    </section>
  );
}
