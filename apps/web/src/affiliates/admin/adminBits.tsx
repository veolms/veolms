import type { AffiliateMoney } from "@veolms/contracts";
import { useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import {
  inputClassName,
  PanelBody,
  PanelFooter,
  secondaryButtonClassName,
  StatusChip,
} from "../../team/TeamBits";
import { formatAffiliateMoney } from "../affiliateFormat";

export const money = (value: AffiliateMoney | null | undefined) =>
  value ? formatAffiliateMoney(value) : "–";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
export const formatDay = (value: string | null | undefined) =>
  value ? dateFormat.format(new Date(value)) : "–";

/** Today in India as YYYY-MM-DD (payouts are dated in IST). */
export function indiaToday(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

const AFFILIATE_TONES = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  suspended: "danger",
} as const;

export function AffiliateStatusChip({
  status,
}: {
  status: keyof typeof AFFILIATE_TONES;
}) {
  return (
    <StatusChip tone={AFFILIATE_TONES[status]}>
      {status[0]!.toUpperCase() + status.slice(1)}
    </StatusChip>
  );
}

export const FLAG_LABELS: Record<string, string> = {
  email_match: "Email like the affiliate's",
  phone_match: "Affiliate's phone",
  ip_match: "Same network as the affiliate",
  high_refund_rate: "Many refunds",
  affiliate_suspended: "Affiliate suspended",
  no_settlement: "Waiting for settlement",
};

/** A filter row of pill buttons. */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
            value === option.id
              ? "bg-(--accent) text-(--on-accent)"
              : "bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover)"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A side panel that asks for a reason (rejecting, suspending, a failed
 * payout). The person it is about usually sees what is written.
 */
export function ReasonPanel({
  title,
  description,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <SlideOverPanel label={title} title={title} onClose={onClose}>
      <PanelBody>
        <p className="mb-4 text-sm text-(--muted)">{description}</p>
        <label
          className="block text-sm font-semibold text-(--text)"
          htmlFor="affiliate-reason"
        >
          Reason
        </label>
        <textarea
          id="affiliate-reason"
          className={`${inputClassName} mt-1.5 min-h-28 py-2`}
          value={reason}
          maxLength={2000}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-500">
            {error}
          </p>
        ) : null}
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
          type="button"
          variant={danger ? "danger" : "primary"}
          elevation="flat"
          motion="static"
          disabled={!valid || pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}

/** "Show more" under a list that pages. */
export function MoreButton({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <button
      type="button"
      className={`${secondaryButtonClassName} self-center`}
      disabled={loading}
      onClick={onMore}
    >
      {loading ? "Loading…" : "Show more"}
    </button>
  );
}
