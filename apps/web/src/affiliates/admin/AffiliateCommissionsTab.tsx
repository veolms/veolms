import { CoinsIcon as Coins } from "@phosphor-icons/react/Coins";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import type {
  AdminCommissionRow,
  AffiliateCommissionStatus,
} from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useCapabilities } from "../../services/authorization";
import {
  useAddAffiliateAdjustment,
  useAdminAffiliates,
  useAdminCommissions,
  useApproveAffiliateCommission,
  useRejectAffiliateCommission,
  useSetOrderAttribution,
} from "../../services/affiliates";
import {
  EmptyState,
  inputClassName,
  ListSkeleton,
  LoadError,
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
  StatusChip,
} from "../../team/TeamBits";
import { formatAffiliateRate } from "../affiliateFormat";
import {
  FLAG_LABELS,
  FilterPills,
  MoreButton,
  ReasonPanel,
  formatDay,
  money,
} from "./adminBits";

type Filter = "flagged" | AffiliateCommissionStatus | "all";
const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "flagged", label: "Held for review" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

function statusChip(row: AdminCommissionRow) {
  if (row.paid) return <StatusChip tone="success">Paid</StatusChip>;
  if (row.inPayout) return <StatusChip tone="accent">In payout</StatusChip>;
  if (row.status === "rejected")
    return <StatusChip tone="neutral">Rejected</StatusChip>;
  if (row.status === "approved")
    return <StatusChip tone="success">Owed</StatusChip>;
  if (row.flags.length) return <StatusChip tone="warning">Held</StatusChip>;
  return <StatusChip tone="neutral">Pending</StatusChip>;
}

/** The ledger across affiliates: review what's held, approve early, reject, adjust. */
export function AffiliateCommissionsTab() {
  const { can } = useCapabilities();
  const canManage = can("affiliate.manage");
  const [filter, setFilter] = useState<Filter>("flagged");
  const list = useAdminCommissions({
    status:
      filter === "flagged" ? "pending" : filter === "all" ? undefined : filter,
    flagged: filter === "flagged" ? true : undefined,
  });
  const approve = useApproveAffiliateCommission();
  const reject = useRejectAffiliateCommission();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [recrediting, setRecrediting] = useState<AdminCommissionRow | null>(
    null,
  );
  const [adjusting, setAdjusting] = useState(false);
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          label="Show"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
        {canManage ? (
          <Button
            elevation="flat"
            motion="static"
            onClick={() => setAdjusting(true)}
          >
            <Plus size={16} weight="bold" aria-hidden="true" /> Adjustment
          </Button>
        ) : null}
      </div>
      {approve.error ? (
        <p role="alert" className="m-0 text-sm text-rose-500">
          {approve.error.message}
        </p>
      ) : null}

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <LoadError
          icon={Coins}
          title="Couldn't load commissions"
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title={
            filter === "flagged"
              ? "Nothing held for review"
              : "No commissions here"
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-(--surface) px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <span className="font-semibold text-(--text)">
                  {row.affiliate.code}
                  <span className="font-normal text-(--muted)">
                    {" · "}
                    {row.kind === "sale"
                      ? (row.item ?? "Sale")
                      : row.kind === "reversal"
                        ? "Refund"
                        : "Adjustment"}
                  </span>
                </span>
                <span className="text-xs text-(--muted)">
                  {formatDay(row.createdAt)}
                  {row.order ? ` · ${row.order.number}` : ""}
                  {row.order?.buyer ? ` · ${row.order.buyer}` : ""}
                  {row.base ? ` · ${money(row.base)} base` : ""}
                  {row.rate
                    ? ` · ${formatAffiliateRate({ rateType: row.rate.type, rateValue: row.rate.value, currency: row.amount.currency })}`
                    : ""}
                  {row.status === "pending"
                    ? ` · due ${formatDay(row.availableAt)}`
                    : ""}
                </span>
                {row.flags.length ? (
                  <span className="text-xs font-semibold text-amber-500">
                    {row.flags
                      .map((flag) => FLAG_LABELS[flag] ?? flag)
                      .join(" · ")}
                  </span>
                ) : null}
                {row.note ? (
                  <span className="text-xs whitespace-pre-wrap text-(--text-secondary)">
                    {row.note}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-semibold ${row.amount.amountMinor < 0 ? "text-rose-500" : "text-(--text)"}`}
                >
                  {money(row.amount)}
                </span>
                {statusChip(row)}
                {canManage && row.status === "pending" && !row.inPayout ? (
                  <>
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(row.id)}
                    >
                      Approve now
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      onClick={() => setRejecting(row.id)}
                    >
                      Reject
                    </button>
                    {row.kind === "sale" && row.order ? (
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() => setRecrediting(row)}
                      >
                        Credit someone else
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <MoreButton
        hasMore={Boolean(list.hasNextPage)}
        loading={list.isFetchingNextPage}
        onMore={() => void list.fetchNextPage()}
      />

      {rejecting ? (
        <ReasonPanel
          title="Reject this commission"
          description="It no longer counts toward the affiliate's earnings; a sale's pending refund rows go with it. The affiliate sees the reason in their history."
          confirmLabel="Reject"
          danger
          pending={reject.isPending}
          error={reject.error?.message}
          onConfirm={(reason) =>
            reject.mutate(
              { id: rejecting, reason },
              { onSuccess: () => setRejecting(null) },
            )
          }
          onClose={() => setRejecting(null)}
        />
      ) : null}
      {adjusting ? (
        <AdjustmentPanel onClose={() => setAdjusting(false)} />
      ) : null}
      {recrediting ? (
        <RecreditPanel row={recrediting} onClose={() => setRecrediting(null)} />
      ) : null}
    </div>
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
  const list = useAdminAffiliates({
    status: "approved",
    q: search.trim() || undefined,
  });
  const rows = (list.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (row) => row.id !== exceptId,
  );
  return (
    <div className="flex flex-col gap-2">
      <input
        className={inputClassName}
        placeholder="Search by code or name"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        role="listbox"
        aria-label="Affiliates"
        className="flex max-h-56 flex-col overflow-y-auto rounded-xl bg-(--surface-strong) p-1"
      >
        {rows.length === 0 ? (
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
              <span className="font-semibold">{row.code}</span>
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

function AdjustmentPanel({ onClose }: { onClose: () => void }) {
  const add = useAddAffiliateAdjustment();
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"plus" | "minus">("plus");
  const [rupees, setRupees] = useState("");
  const [note, setNote] = useState("");
  const amount = Math.round(Number(rupees) * 100);
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
            A correction in rupees, owed at once. Use it for a bonus, a bounced
            transfer, or anything a commission row can&apos;t express. It
            can&apos;t be edited afterwards.
          </p>
          <div>
            <p className="m-0 mb-1.5 font-semibold text-(--text)">Affiliate</p>
            <AffiliatePicker value={affiliateId} onChange={setAffiliateId} />
          </div>
          <FilterPills
            label="Direction"
            options={[
              { id: "plus", label: "Add to their balance" },
              { id: "minus", label: "Take from it" },
            ]}
            value={direction}
            onChange={setDirection}
          />
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Amount (₹)
            <input
              className={inputClassName}
              inputMode="decimal"
              value={rupees}
              onChange={(event) => setRupees(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Note (the affiliate sees it)
            <textarea
              className={`${inputClassName} min-h-24 py-2`}
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {add.error ? (
            <p role="alert" className="m-0 text-rose-500">
              {add.error.message}
            </p>
          ) : null}
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

function RecreditPanel({
  row,
  onClose,
}: {
  row: AdminCommissionRow;
  onClose: () => void;
}) {
  const change = useSetOrderAttribution();
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const submit = (affiliateId: string | null) =>
    change.mutate(
      {
        orderId: row.order!.id,
        body: { affiliateId, ...(note.trim() ? { note: note.trim() } : {}) },
      },
      { onSuccess: onClose },
    );
  return (
    <SlideOverPanel
      label="Credit"
      title={`Order ${row.order?.number ?? ""}`}
      onClose={onClose}
    >
      <PanelBody>
        <div className="flex flex-col gap-4 text-sm">
          <p className="m-0 text-(--muted)">
            Credited to {row.affiliate.code}. Move the credit to another
            affiliate, or remove it. Their commission is rejected and the new
            affiliate&apos;s is worked out afresh; this is possible only while
            it is pending.
          </p>
          <AffiliatePicker
            value={target}
            onChange={setTarget}
            exceptId={row.affiliate.id}
          />
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Note (optional)
            <input
              className={inputClassName}
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {change.error ? (
            <p role="alert" className="m-0 text-rose-500">
              {change.error.message}
            </p>
          ) : null}
        </div>
      </PanelBody>
      <PanelFooter>
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={change.isPending}
          onClick={() => submit(null)}
        >
          Remove the credit
        </button>
        <Button
          elevation="flat"
          motion="static"
          disabled={!target || change.isPending}
          onClick={() => submit(target)}
        >
          Credit the chosen affiliate
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
