import type {
  AffiliateMeResponse,
  AffiliatePayoutDetailsRequest,
} from "@veolms/contracts";
import { useRef, useState, type FormEvent } from "react";

import { BankIcon as Bank } from "@phosphor-icons/react/Bank";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";

import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import {
  useRequestAffiliatePayout,
  useSetAffiliatePayoutDetails,
} from "../services/affiliates";
import { inputClassName, secondaryButtonClassName } from "../team/TeamBits";
import { formatAffiliateMoney, newIdempotencyKey } from "./affiliateFormat";

const BLOCKED_REASONS: Record<
  NonNullable<AffiliateMeResponse["payoutBlockedReason"]>,
  string
> = {
  below_minimum: "You can withdraw once you reach the minimum.",
  details_missing: "Add your UPI or bank details to be paid.",
  payout_open:
    "Your payout is with the academy. You can ask again once it's paid.",
  not_approved: "Payouts start once you're approved.",
};

/**
 * The money: what can be withdrawn now, what is still waiting, in a payout
 * and paid; the withdraw button with why it is not open yet; and where the
 * academy pays (shown only as a hint, changed here).
 */
export function AffiliatePayoutPanel({
  me,
  onEditDetails,
}: {
  me: AffiliateMeResponse;
  /** Opens the details elsewhere (the Settings tab) instead of here. */
  onEditDetails?: () => void;
}) {
  const [editing, setEditingHere] = useState(
    !me.payoutDetails && !onEditDetails,
  );
  const setEditing = (on: boolean) => {
    if (on && onEditDetails) onEditDetails();
    else setEditingHere(on);
  };
  const request = useRequestAffiliatePayout();
  // One key per press, kept across a retry of the same press.
  const keyRef = useRef<string | null>(null);
  const { balances, program } = me;
  const approved = me.status === "approved";
  const toGo = program.minPayout.amountMinor - balances.available.amountMinor;

  const blocked =
    me.payoutBlockedReason === "below_minimum"
      ? balances.available.amountMinor === 0
        ? `Nothing to withdraw yet. You can withdraw from ${formatAffiliateMoney(program.minPayout)}.`
        : toGo > 0
          ? `${formatAffiliateMoney({ amountMinor: toGo, currency: program.minPayout.currency })} more to reach the ${formatAffiliateMoney(program.minPayout)} minimum.`
          : BLOCKED_REASONS.below_minimum
      : me.payoutBlockedReason
        ? BLOCKED_REASONS[me.payoutBlockedReason]
        : null;
  const progress =
    program.minPayout.amountMinor > 0
      ? Math.min(
          100,
          Math.round(
            (balances.available.amountMinor / program.minPayout.amountMinor) *
              100,
          ),
        )
      : 100;

  const tiles = [
    {
      label: "Ready to withdraw",
      value: balances.available,
      note: "yours to ask for",
      highlight: true,
    },
    {
      label: "Waiting",
      value: balances.pending,
      note: `${program.holdDays} days for refunds`,
    },
    {
      label: "In a payout",
      value: balances.inPayout,
      note: "asked, being paid",
    },
    {
      label: "Paid so far",
      value: balances.paid,
      note: "to your account",
    },
  ];

  return (
    <ElevatedCard
      as="section"
      className="@container overflow-hidden p-0"
      aria-label="Your money"
    >
      <header className="flex items-center gap-2 px-4 pt-4 sm:px-5">
        <Wallet
          size={16}
          weight="duotone"
          aria-hidden="true"
          className="text-(--muted)"
        />
        <h2 className="m-0 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase">
          Your money
        </h2>
      </header>

      <dl className="m-0 grid grid-cols-2 gap-2.5 p-4 sm:px-5 @2xl:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`flex min-w-0 flex-col rounded-2xl border px-4 py-3 ${
              tile.highlight
                ? "border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                : "border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_40%,transparent)]"
            }`}
          >
            <dt className="truncate text-xs font-semibold text-(--muted)">
              {tile.label}
            </dt>
            <dd
              className={`m-0 mt-1 truncate text-xl font-bold tracking-tight tabular-nums ${tile.highlight ? "text-(--accent)" : "text-(--text)"}`}
            >
              {formatAffiliateMoney(tile.value)}
            </dd>
            <dd className="m-0 truncate text-[0.6875rem] text-(--muted)">
              {tile.note}
            </dd>
          </div>
        ))}
      </dl>

      {approved && (
        <div className="flex flex-col gap-3 border-t border-(--border) px-4 py-3.5 sm:px-5 @xl:flex-row @xl:items-center @xl:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              {request.isSuccess ? (
                <p
                  role="status"
                  className="m-0 text-sm text-emerald-600 dark:text-emerald-400"
                >
                  Asked. The academy pays it by UPI or bank transfer and
                  you&apos;ll get an email.
                </p>
              ) : request.error ? (
                <p role="alert" className="m-0 text-sm text-rose-500">
                  {request.error.message}
                </p>
              ) : (
                <p className="m-0 text-sm text-(--text-secondary)">
                  {blocked ??
                    `You can withdraw ${formatAffiliateMoney(balances.available)} now. The academy pays by UPI or bank transfer.`}
                </p>
              )}
              {me.payoutBlockedReason === "below_minimum" && (
                <span className="shrink-0 text-xs font-semibold text-(--muted) tabular-nums">
                  {formatAffiliateMoney(balances.available)} of{" "}
                  {formatAffiliateMoney(program.minPayout)}
                </span>
              )}
            </div>
            {me.payoutBlockedReason === "below_minimum" && (
              <div
                role="progressbar"
                aria-label="Towards the minimum payout"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_14%,transparent)]"
              >
                <div
                  className="h-full rounded-full bg-(--accent)"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!me.canRequestPayout || request.isPending}
            onClick={() => {
              keyRef.current ??= newIdempotencyKey();
              request.mutate(keyRef.current, {
                onSuccess: () => {
                  keyRef.current = null;
                },
              });
            }}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-(--accent) px-5 @xl:min-w-[11rem] text-sm font-bold text-(--on-accent) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {request.isPending
              ? "Asking…"
              : me.payoutBlockedReason === "payout_open"
                ? "Payout requested"
                : `Withdraw ${formatAffiliateMoney(balances.available)}`}
          </button>
        </div>
      )}

      {approved && (
        <div className="border-t border-(--border) px-4 py-3.5 sm:px-5">
          {editing ? (
            <>
              <p className="m-0 mb-3 text-sm font-semibold text-(--text)">
                Where the academy pays you
              </p>
              <PayoutDetailsForm
                onDone={() => setEditing(false)}
                canCancel={Boolean(me.payoutDetails)}
              />
            </>
          ) : !me.payoutDetails ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="m-0 flex-1 text-sm text-(--text-secondary)">
                Add your UPI or bank details so the academy can pay you.
              </p>
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => setEditing(true)}
              >
                Add payout details
              </button>
            </div>
          ) : me.payoutDetails ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--surface-strong) text-(--muted)">
                <Bank size={17} weight="duotone" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-xs text-(--muted)">Paid to</p>
                <p className="m-0 truncate text-sm font-semibold text-(--text)">
                  {me.payoutDetails.hint}
                  <span className="font-normal text-(--muted)">
                    {me.payoutDetails.panLast4
                      ? ` · PAN ••••${me.payoutDetails.panLast4}`
                      : " · no PAN (20% TDS may apply)"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => setEditing(true)}
              >
                Change
              </button>
            </div>
          ) : null}
        </div>
      )}
    </ElevatedCard>
  );
}

export function PayoutDetailsForm({
  onDone,
  canCancel,
}: {
  onDone: () => void;
  canCancel: boolean;
}) {
  const save = useSetAffiliatePayoutDetails();
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [upiId, setUpiId] = useState("");
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [pan, setPan] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const panValue = pan.trim() ? pan.trim().toUpperCase() : null;
    const details: AffiliatePayoutDetailsRequest =
      method === "upi"
        ? { method, upiId: upiId.trim(), pan: panValue }
        : {
            method,
            holderName: holderName.trim(),
            accountNumber: accountNumber.trim(),
            ifsc: ifsc.trim().toUpperCase(),
            pan: panValue,
          };
    save.mutate(details, { onSuccess: onDone });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div
        role="radiogroup"
        aria-label="How you are paid"
        className="inline-flex gap-1 self-start rounded-xl border border-(--border) p-1"
      >
        {(["upi", "bank"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={`h-8 rounded-lg px-3.5 text-sm font-semibold ${
              method === value
                ? "bg-(--accent) text-(--on-accent)"
                : "text-(--text-secondary) hover:bg-(--hover)"
            }`}
          >
            {value === "upi" ? "UPI" : "Bank account"}
          </button>
        ))}
      </div>
      {method === "upi" ? (
        <Field label="UPI id">
          <input
            className={inputClassName}
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="name@okhdfc"
            required
            autoComplete="off"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Field label="Account holder">
            <input
              className={inputClassName}
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
              autoComplete="name"
            />
          </Field>
          <Field label="Account number">
            <input
              className={inputClassName}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              inputMode="numeric"
              required
              autoComplete="off"
            />
          </Field>
          <Field label="IFSC">
            <input
              className={inputClassName}
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value)}
              placeholder="HDFC0001234"
              required
              autoComplete="off"
            />
          </Field>
        </div>
      )}
      <Field label="PAN (for tax on commissions)">
        <input
          className={inputClassName}
          value={pan}
          onChange={(e) => setPan(e.target.value)}
          placeholder="ABCDE1234F"
          maxLength={10}
          autoComplete="off"
        />
      </Field>
      <p className="m-0 text-xs text-(--muted)">
        Stored encrypted and only used to pay you and meet tax rules. Only the
        last digits are ever shown.
      </p>
      {save.error ? (
        <p role="alert" className="m-0 text-sm text-rose-500">
          {save.error.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={save.isPending}
          className="h-10 rounded-lg px-4 text-sm font-semibold"
        >
          {save.isPending ? "Saving…" : "Save details"}
        </Button>
        {canCancel ? (
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={onDone}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-(--text)">
      {label}
      {children}
    </label>
  );
}
