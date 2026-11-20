import type {
  AffiliateMeResponse,
  AffiliatePayoutDetailsRequest,
} from "@veolms/contracts";
import { useRef, useState, type FormEvent } from "react";

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
  below_minimum:
    "You can ask for a payout once your available balance reaches the minimum.",
  details_missing: "Add your UPI or bank details to be paid.",
  payout_open: "Your payout request is with the academy.",
  not_approved: "Payouts start once you're approved.",
};

/** Payout details (shown only as a hint) and the payout request. */
export function AffiliatePayoutPanel({ me }: { me: AffiliateMeResponse }) {
  const [editing, setEditing] = useState(!me.payoutDetails);
  const request = useRequestAffiliatePayout();
  // One key per press, kept across a retry of the same press.
  const keyRef = useRef<string | null>(null);

  return (
    <ElevatedCard padded className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-(--text)">Payouts</h2>
          <p className="m-0 mt-1 text-sm text-(--muted)">
            From {formatAffiliateMoney(me.program.minPayout)}, paid by the
            academy by UPI or bank transfer.
          </p>
        </div>
        <Button
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
          className="h-10 rounded-lg px-4 text-sm font-semibold"
        >
          {request.isPending
            ? "Asking…"
            : `Withdraw ${formatAffiliateMoney(me.balances.available)}`}
        </Button>
      </div>
      {me.payoutBlockedReason ? (
        <p className="m-0 text-sm text-(--text-secondary)">
          {BLOCKED_REASONS[me.payoutBlockedReason]}
        </p>
      ) : null}
      {request.error ? (
        <p role="alert" className="m-0 text-sm text-rose-500">
          {request.error.message}
        </p>
      ) : null}

      {editing ? (
        <PayoutDetailsForm
          onDone={() => setEditing(false)}
          canCancel={Boolean(me.payoutDetails)}
        />
      ) : me.payoutDetails ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-(--surface-strong) px-4 py-3">
          <span className="text-sm text-(--text)">
            {me.payoutDetails.hint}
            {me.payoutDetails.panLast4 ? (
              <span className="text-(--muted)">
                {" "}
                · PAN ••••{me.payoutDetails.panLast4}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        </div>
      ) : null}
    </ElevatedCard>
  );
}

function PayoutDetailsForm({
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
        className="flex gap-2"
      >
        {(["upi", "bank"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={`h-9 rounded-lg px-3.5 text-sm font-semibold ${
              method === value
                ? "bg-(--accent) text-(--on-accent)"
                : "bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover)"
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
