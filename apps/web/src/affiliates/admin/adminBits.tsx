import type { AffiliateMoney } from "@veolms/contracts";
import { useState, type ReactNode } from "react";

import { inputClassName } from "../../team/TeamBits";
import { formatAffiliateMoney } from "../affiliateFormat";
import { panelDangerButton, panelSecondaryButton } from "./AdminListBits";

export const money = (value: AffiliateMoney | null | undefined) =>
  value ? formatAffiliateMoney(value) : "–";

/** Rupees from a total in rupees' minor units (the summaries' amounts). */
export const rupees = (amountMinor: number) =>
  formatAffiliateMoney({ amountMinor, currency: "INR" });

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
export const formatDay = (value: string | null | undefined) =>
  value ? dateFormat.format(new Date(value)) : "–";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
export const formatTime = (value: string | null | undefined) =>
  value ? timeFormat.format(new Date(value)) : "";

const number = new Intl.NumberFormat("en-IN");
export const formatCount = (value: number) => number.format(value);

/** Today in India as YYYY-MM-DD (payouts are dated in IST). */
export function indiaToday(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export const FLAG_LABELS: Record<string, string> = {
  email_match: "Email like the affiliate's",
  phone_match: "Affiliate's phone",
  ip_match: "Same network as the affiliate",
  high_refund_rate: "Many refunds",
  affiliate_suspended: "Affiliate suspended",
  no_settlement: "Waiting for settlement",
};

export const fieldLabel =
  "flex flex-col gap-1.5 text-sm font-semibold text-(--text)";
export { inputClassName };

/**
 * Asks for a reason in place (rejecting, suspending, a failed payout), so
 * no second panel opens over the first. The person it is about usually
 * sees what is written.
 */
export function InlineReason({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <section
      role="group"
      aria-label={title}
      className="rounded-2xl border border-rose-500/30 bg-rose-500/6 p-4"
    >
      <h3 className="m-0 text-sm font-bold text-(--text)">{title}</h3>
      <p className="m-0 mt-1 text-sm text-(--muted)">{description}</p>
      <label className={`${fieldLabel} mt-3`}>
        Reason
        <textarea
          // Opened by a button press: the reason is the next thing typed.
          autoFocus
          className={`${inputClassName} min-h-24 py-2 font-normal`}
          value={reason}
          maxLength={2000}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-rose-500">
          {error}
        </p>
      ) : null}
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
          className={panelDangerButton}
          disabled={!valid || pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending ? "Saving…" : confirmLabel}
        </button>
      </div>
    </section>
  );
}

/** A line saying what just happened, or what went wrong. */
export function PanelMessage({
  tone,
  children,
}: {
  tone: "error" | "done";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`m-0 rounded-lg px-3 py-2 text-sm ${
        tone === "error"
          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {children}
    </p>
  );
}
