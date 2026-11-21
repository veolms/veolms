import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import type {
  AdminPayout,
  AffiliatePayoutStatus,
  CreateAdminPayoutsResponse,
} from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useCapabilities } from "../../services/authorization";
import {
  affiliatesAdminService,
  useAdminPayouts,
  useCloseAffiliatePayout,
  useCreateAffiliatePayouts,
  useMarkAffiliatePayoutPaid,
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
import {
  FilterPills,
  MoreButton,
  ReasonPanel,
  formatDay,
  indiaToday,
  money,
} from "./adminBits";

const FILTERS: readonly { id: AffiliatePayoutStatus | "all"; label: string }[] =
  [
    { id: "requested", label: "To pay" },
    { id: "paid", label: "Paid" },
    { id: "rejected", label: "Rejected" },
    { id: "failed", label: "Failed" },
    { id: "all", label: "All" },
  ];

const CHIPS = {
  requested: { tone: "accent", label: "To pay" },
  paid: { tone: "success", label: "Paid" },
  rejected: { tone: "neutral", label: "Rejected" },
  failed: { tone: "danger", label: "Failed" },
} as const;

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
 * Payouts: pay outside VeoLMS (UPI or bank transfer), then mark paid with
 * the reference. Or reject, or mark failed when the transfer bounced; the
 * money goes back to the affiliate's balance.
 */
export function AffiliatePayoutsTab() {
  const { can } = useCapabilities();
  const canPay = can("affiliate.payout");
  const [filter, setFilter] = useState<AffiliatePayoutStatus | "all">(
    "requested",
  );
  const list = useAdminPayouts(filter === "all" ? undefined : filter);
  const create = useCreateAffiliatePayouts();
  const close = useCloseAffiliatePayout();
  const [paying, setPaying] = useState<AdminPayout | null>(null);
  const [closing, setClosing] = useState<{
    payout: AdminPayout;
    status: "rejected" | "failed";
  } | null>(null);
  const [created, setCreated] = useState<CreateAdminPayoutsResponse | null>(
    null,
  );
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
        {canPay ? (
          <div className="flex flex-wrap gap-2">
            <a
              className={secondaryButtonClassName}
              href={affiliatesAdminService.payoutsExportUrl("requested")}
            >
              <DownloadSimple size={16} aria-hidden="true" /> CSV to pay
            </a>
            <Button
              elevation="flat"
              motion="static"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { allAboveMinimum: true },
                  { onSuccess: setCreated },
                )
              }
            >
              {create.isPending ? "Making payouts…" : "Pay everyone owed"}
            </Button>
          </div>
        ) : null}
      </div>
      {create.error ? (
        <p role="alert" className="m-0 text-sm text-rose-500">
          {create.error.message}
        </p>
      ) : null}
      {created ? (
        <div
          role="status"
          className="rounded-xl bg-(--surface-strong) px-4 py-3 text-sm text-(--text)"
        >
          {created.created.length} payout
          {created.created.length === 1 ? "" : "s"} made.
          {created.skipped.length ? (
            <span className="text-(--muted)">
              {" "}
              Not paid:{" "}
              {created.skipped
                .map((skip) => `${skip.code} (${SKIP_LABELS[skip.reason]})`)
                .join(", ")}
              .
            </span>
          ) : null}
        </div>
      ) : null}

      {list.isPending ? (
        <ListSkeleton rows={4} />
      ) : list.isError ? (
        <LoadError
          icon={Wallet}
          title="Couldn't load payouts"
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filter === "requested" ? "Nothing to pay" : "No payouts here"}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((payout) => {
            const chip = CHIPS[payout.status];
            return (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-(--surface) px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)]"
              >
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="font-semibold text-(--text)">
                    {payout.affiliate.code}
                    {payout.affiliate.name ? (
                      <span className="font-normal text-(--muted)">
                        {" "}
                        · {payout.affiliate.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-(--muted)">
                    {payout.requestedBy === "admin"
                      ? "Made by the academy"
                      : "Asked"}{" "}
                    {formatDay(payout.createdAt)}
                    {payout.hint ? ` · ${payout.hint}` : ""}
                    {payout.reference ? ` · ref ${payout.reference}` : ""}
                    {payout.paidOn ? ` · paid ${formatDay(payout.paidOn)}` : ""}
                  </span>
                  {payout.tdsSuggestion &&
                  payout.tdsSuggestion.suggested.amountMinor > 0 ? (
                    <span className="text-xs text-amber-500">
                      Suggested TDS {money(payout.tdsSuggestion.suggested)} (
                      {payout.tdsSuggestion.rate / 100}%
                      {payout.tdsSuggestion.panOnFile ? "" : ", no PAN"}) ·{" "}
                      {money(payout.tdsSuggestion.yearPaid)} paid this year
                    </span>
                  ) : null}
                  {payout.reason ? (
                    <span className="text-xs text-(--text-secondary)">
                      {payout.reason}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-(--text)">
                    {money(
                      payout.status === "paid" ? payout.net : payout.gross,
                    )}
                  </span>
                  <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                  {canPay && payout.status === "requested" ? (
                    <>
                      <Button
                        elevation="flat"
                        motion="static"
                        className="h-9"
                        onClick={() => setPaying(payout)}
                      >
                        Mark paid
                      </Button>
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() =>
                          setClosing({ payout, status: "rejected" })
                        }
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        onClick={() => setClosing({ payout, status: "failed" })}
                      >
                        Failed
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <MoreButton
        hasMore={Boolean(list.hasNextPage)}
        loading={list.isFetchingNextPage}
        onMore={() => void list.fetchNextPage()}
      />

      {paying ? (
        <MarkPaidPanel payout={paying} onClose={() => setPaying(null)} />
      ) : null}
      {closing ? (
        <ReasonPanel
          title={
            closing.status === "rejected"
              ? "Reject this payout"
              : "The transfer failed"
          }
          description={`${money(closing.payout.gross)} goes back to ${closing.payout.affiliate.code}'s balance and they can ask again. They see the reason.`}
          confirmLabel={
            closing.status === "rejected" ? "Reject" : "Mark failed"
          }
          danger
          pending={close.isPending}
          error={close.error?.message}
          onConfirm={(reason) =>
            close.mutate(
              {
                id: closing.payout.id,
                status: closing.status,
                body: { reason },
              },
              { onSuccess: () => setClosing(null) },
            )
          }
          onClose={() => setClosing(null)}
        />
      ) : null}
    </div>
  );
}

function MarkPaidPanel({
  payout,
  onClose,
}: {
  payout: AdminPayout;
  onClose: () => void;
}) {
  const mark = useMarkAffiliatePayoutPaid();
  const suggested = payout.tdsSuggestion?.suggested.amountMinor ?? 0;
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(indiaToday());
  const [tds, setTds] = useState((suggested / 100).toFixed(2));
  const [note, setNote] = useState("");
  const tdsMinor = Math.round(Number(tds || "0") * 100);
  const valid =
    reference.trim().length >= 3 &&
    Boolean(paidOn) &&
    Number.isFinite(tdsMinor) &&
    tdsMinor >= 0 &&
    tdsMinor <= payout.gross.amountMinor;
  const net = {
    amountMinor:
      payout.gross.amountMinor - (Number.isFinite(tdsMinor) ? tdsMinor : 0),
    currency: payout.gross.currency,
  };
  return (
    <SlideOverPanel
      label="Mark paid"
      title={`Pay ${payout.affiliate.code}`}
      onClose={onClose}
    >
      <PanelBody>
        <div className="flex flex-col gap-4 text-sm">
          <dl className="m-0 grid grid-cols-3 gap-2 rounded-xl bg-(--surface-strong) p-3">
            <Fact label="Gross" value={money(payout.gross)} />
            <Fact
              label="TDS"
              value={money({
                amountMinor: tdsMinor || 0,
                currency: payout.gross.currency,
              })}
            />
            <Fact label="Net to pay" value={money(net)} />
          </dl>
          {payout.tdsSuggestion?.crossesThreshold ? (
            <p className="m-0 text-xs text-amber-500">
              This payout takes the year past ₹20,000: earlier payouts this year
              may also need TDS. Check with your accountant.
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Payment reference (UTR or UPI)
            <input
              className={inputClassName}
              value={reference}
              maxLength={100}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Paid on
            <input
              type="date"
              className={inputClassName}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            TDS withheld (₹)
            <input
              className={inputClassName}
              inputMode="decimal"
              value={tds}
              onChange={(event) => setTds(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-semibold text-(--text)">
            Note (optional, for example a GST invoice number)
            <input
              className={inputClassName}
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className="m-0 text-xs text-(--muted)">
            Paid is final. A mistake afterwards is fixed with an adjustment.
          </p>
          {mark.error ? (
            <p role="alert" className="m-0 text-rose-500">
              {mark.error.message}
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
              { onSuccess: onClose },
            )
          }
        >
          {mark.isPending ? "Saving…" : "Mark paid"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-(--muted)">{label}</dt>
      <dd className="m-0 font-semibold text-(--text)">{value}</dd>
    </div>
  );
}
