import type {
  AdminCommissionRow,
  AdminCommissionState,
  AffiliatePayoutMethod,
  AffiliatePayoutStatus,
  AffiliateStatus,
} from "@veolms/contracts";

/** The Orders page's pill colours, so a status reads the same everywhere. */
const TONES = {
  success: {
    dot: "bg-emerald-500",
    pill: "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    dot: "bg-amber-500",
    pill: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-400",
  },
  danger: {
    dot: "bg-rose-500",
    pill: "border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-400",
  },
  info: {
    dot: "bg-sky-500",
    pill: "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-400",
  },
  accent: {
    dot: "bg-violet-500",
    pill: "border-violet-500/30 bg-violet-500/12 text-violet-700 dark:text-violet-300",
  },
  neutral: {
    dot: "bg-zinc-400",
    pill: "border-zinc-500/30 bg-zinc-500/12 text-(--muted)",
  },
} as const;

export type AdminTone = keyof typeof TONES;
export interface AdminStatusTone {
  label: string;
  tone: AdminTone;
}

export const AFFILIATE_STATUS_TONES: Record<AffiliateStatus, AdminStatusTone> =
  {
    pending: { label: "Pending", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
    suspended: { label: "Suspended", tone: "danger" },
    rejected: { label: "Rejected", tone: "neutral" },
  };

export const COMMISSION_STATE_TONES: Record<
  AdminCommissionState,
  AdminStatusTone
> = {
  held: { label: "Held", tone: "warning" },
  pending: { label: "Pending", tone: "info" },
  owed: { label: "Owed", tone: "success" },
  in_payout: { label: "In payout", tone: "accent" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const PAYOUT_STATUS_TONES: Record<
  AffiliatePayoutStatus,
  AdminStatusTone
> = {
  requested: { label: "To pay", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const PAYOUT_METHOD_LABELS: Record<AffiliatePayoutMethod, string> = {
  upi: "UPI",
  bank: "Bank transfer",
};

/** Where a commission row stands, as the admin's filter names it. */
export function commissionState(row: AdminCommissionRow): AdminCommissionState {
  if (row.paid) return "paid";
  if (row.inPayout) return "in_payout";
  if (row.status === "rejected") return "rejected";
  if (row.status === "approved") return "owed";
  return row.flags.length ? "held" : "pending";
}

export function StatusDot({ tone }: { tone: AdminTone }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${TONES[tone].dot}`}
    />
  );
}

/** A status as the Orders table shows one: a dot and a word in a pill. */
export function AdminStatusPill({ status }: { status: AdminStatusTone }) {
  const tone = TONES[status.tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone.pill}`}
    >
      <span
        className={`size-1.5 rounded-full ${tone.dot}`}
        aria-hidden="true"
      />
      {status.label}
    </span>
  );
}
