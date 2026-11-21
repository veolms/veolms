import { useState, type ReactNode } from "react";
import type {
  AdminPayoutDetailsResponse,
  AffiliateStatusAction,
} from "@veolms/contracts";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { MegaphoneIcon as Megaphone } from "@phosphor-icons/react/Megaphone";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { BankIcon as Bank } from "@phosphor-icons/react/Bank";

import { StudentAvatar } from "../../orders/StudentAvatar";
import { useCapabilities } from "../../services/authorization";
import {
  useAdminAffiliate,
  useAffiliateAudit,
  useChangeAffiliateStatus,
  useRevealPayoutDetails,
} from "../../services/affiliates";
import {
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
  PanelStats,
} from "./AdminPanelBits";
import {
  InlineReason,
  PanelMessage,
  formatCount,
  formatDay,
  formatTime,
  money,
} from "./adminBits";
import {
  AFFILIATE_STATUS_TONES,
  AdminStatusPill,
  PAYOUT_METHOD_LABELS,
} from "./adminTones";

const AUDIT_LABELS: Record<string, string> = {
  "affiliate.approved": "Approved",
  "affiliate.rejected": "Rejected",
  "affiliate.suspended": "Suspended",
  "affiliate.reinstated": "Reinstated",
  "affiliate.invited": "Invited",
  "payout_details.viewed": "Payout details viewed",
  "commission.approved": "Commission approved early",
  "commission.rejected": "Commission rejected",
  "commission.adjusted": "Adjustment added",
  "payout.created": "Payout made",
  "payout.marked_paid": "Payout marked paid",
  "attribution.changed": "Sale credited elsewhere",
  "payout.rejected": "Payout rejected",
  "payout.failed": "Payout marked failed",
};

const bone = "animate-pulse rounded bg-(--border)";

/**
 * One affiliate in the side panel: who they are (the hero), their money
 * and activity, their own words, payout details (the full ones on request,
 * each view recorded) and the history; the status actions at the foot.
 */
export function AffiliateDetailBody({ id }: { id: string }) {
  const { can } = useCapabilities();
  const detail = useAdminAffiliate(id);
  const audit = useAffiliateAudit(id);
  const change = useChangeAffiliateStatus();
  const reveal = useRevealPayoutDetails();
  const [asking, setAsking] = useState<"reject" | "suspend" | null>(null);
  const [details, setDetails] = useState<AdminPayoutDetailsResponse | null>(
    null,
  );
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const affiliate = detail.data;
  const canManage = can("affiliate.manage");

  const act = (action: AffiliateStatusAction, reason?: string) => {
    setDone(null);
    change.mutate(
      { id, action, reason },
      {
        onSuccess: () => {
          setAsking(null);
          setDone(
            action === "approve"
              ? "Approved. They can share their link now."
              : action === "reinstate"
                ? "Reinstated. Their link earns again."
                : action === "suspend"
                  ? "Suspended. Their link stopped earning."
                  : "Done. They'll see the reason.",
          );
        },
      },
    );
  };

  if (detail.isError) {
    return (
      <PanelSections>
        <PanelMessage tone="error">
          This affiliate could not be loaded. {detail.error.message}
        </PanelMessage>
      </PanelSections>
    );
  }
  if (!affiliate) {
    return (
      <div aria-busy="true" aria-label="Loading affiliate">
        <PanelHero>
          <div className="flex items-center gap-3 pt-2">
            <div className={`${bone} size-12 rounded-full`} />
            <div className="flex-1 space-y-2">
              <div className={`${bone} h-4 w-32`} />
              <div className={`${bone} h-3 w-44`} />
            </div>
          </div>
        </PanelHero>
        <PanelSections>
          {[0, 1].map((box) => (
            <div key={box} className={`${bone} h-32 rounded-2xl`} />
          ))}
        </PanelSections>
      </div>
    );
  }

  const who = affiliate.name ?? affiliate.invitedEmail ?? affiliate.code;
  const isInvitation = Boolean(affiliate.invitedEmail) && !affiliate.name;
  const actions: ReactNode[] = [];
  if (canManage && !asking) {
    if (affiliate.status === "pending" && !isInvitation) {
      actions.push(
        <button
          key="approve"
          type="button"
          className={panelPrimaryButton}
          disabled={change.isPending}
          onClick={() => act("approve")}
        >
          <Check size={15} weight="bold" aria-hidden="true" />
          Approve
        </button>,
      );
    }
    if (affiliate.status === "pending") {
      actions.push(
        <button
          key="reject"
          type="button"
          className={panelDangerButton}
          onClick={() => setAsking("reject")}
        >
          {isInvitation ? "Withdraw invitation" : "Reject"}
        </button>,
      );
    }
    if (affiliate.status === "approved") {
      actions.push(
        <button
          key="suspend"
          type="button"
          className={panelDangerButton}
          onClick={() => setAsking("suspend")}
        >
          Suspend affiliate
        </button>,
      );
    }
    if (affiliate.status === "suspended") {
      actions.push(
        <button
          key="reinstate"
          type="button"
          className={panelPrimaryButton}
          disabled={change.isPending}
          onClick={() => act("reinstate")}
        >
          Reinstate
        </button>,
      );
    }
  }

  return (
    <>
      <PanelHero>
        <div className="flex items-center gap-3">
          <StudentAvatar name={who} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 min-w-0 truncate text-lg leading-tight font-bold tracking-tight text-(--text)">
                {affiliate.name ?? "Invitation"}
              </h2>
              <AdminStatusPill
                status={AFFILIATE_STATUS_TONES[affiliate.status]}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-(--muted)">
              <span className="max-w-full truncate text-sm">
                {affiliate.email ?? affiliate.invitedEmail ?? "–"}
              </span>
              <span aria-hidden="true">·</span>
              <CodeChip code={affiliate.code} />
              <button
                type="button"
                aria-label="Copy code"
                title="Copy code"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(affiliate.code)
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                }
                className="grid size-7 place-items-center rounded-md hover:bg-(--hover) hover:text-(--text)"
              >
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
              </button>
              <span aria-hidden="true">·</span>
              <span>Joined {formatDay(affiliate.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatCount(affiliate.sales)}{" "}
                {affiliate.sales === 1 ? "sale" : "sales"}
              </span>
            </div>
          </div>
        </div>
      </PanelHero>

      <PanelSections>
        {asking && (
          <InlineReason
            title={
              asking === "suspend"
                ? "Suspend this affiliate"
                : isInvitation
                  ? "Withdraw the invitation"
                  : "Reject the application"
            }
            description={
              asking === "suspend"
                ? "Their link and coupon stop earning at once, and pending commissions are held for review. They'll see the reason."
                : "They'll see the reason."
            }
            confirmLabel={asking === "suspend" ? "Suspend" : "Reject"}
            pending={change.isPending}
            error={change.error?.message}
            onConfirm={(reason) => act(asking, reason)}
            onCancel={() => setAsking(null)}
          />
        )}
        {done && <PanelMessage tone="done">{done}</PanelMessage>}
        {change.error && !asking && (
          <PanelMessage tone="error">{change.error.message}</PanelMessage>
        )}

        {affiliate.statusReason && (
          <PanelSection title="Reason given" icon={Info} tone="warning">
            <p className="m-0 text-sm whitespace-pre-wrap text-(--text)">
              {affiliate.statusReason}
            </p>
            {affiliate.decidedAt && (
              <p className="m-0 mt-1 text-xs text-(--muted)">
                {formatDay(affiliate.decidedAt)}
              </p>
            )}
          </PanelSection>
        )}

        <PanelSection title="Money" icon={Wallet}>
          <PanelStats
            stats={[
              {
                label: "Owed now",
                value: money(affiliate.balances.available),
                note: "ready to pay",
                highlight: true,
              },
              {
                label: "Pending",
                value: money(affiliate.balances.pending),
                note: "in the refund period",
              },
              {
                label: "In a payout",
                value: money(affiliate.balances.inPayout),
                note: "asked, not paid",
              },
              {
                label: "Paid so far",
                value: money(affiliate.balances.paid),
                note: `of ${money(affiliate.earned)} earned`,
              },
            ]}
          />
        </PanelSection>

        <PanelSection title="Activity" icon={ChartBar}>
          <PanelRows>
            <PanelRow label="Clicks">{formatCount(affiliate.clicks)}</PanelRow>
            <PanelRow label="Sales">{formatCount(affiliate.sales)}</PanelRow>
            {affiliate.flagged > 0 && (
              <PanelRow label="Held for review">
                <span className="text-amber-600 dark:text-amber-400">
                  {formatCount(affiliate.flagged)}
                </span>
              </PanelRow>
            )}
            <PanelRow label="Buyer coupon">
              {affiliate.coupon
                ? `${affiliate.coupon.code}${affiliate.coupon.active ? "" : " (off)"}`
                : "None"}
            </PanelRow>
            <PanelRow label="Terms accepted">
              {formatDay(affiliate.termsAcceptedAt)}
            </PanelRow>
            <PanelRow label="Email on each sale">
              {affiliate.notifyOnCommission ? "On" : "Off"}
            </PanelRow>
          </PanelRows>
        </PanelSection>

        {affiliate.applicationNote && (
          <PanelSection title="How they'll promote you" icon={Megaphone}>
            {/* Their own words: plain text, never HTML. */}
            <p className="m-0 text-sm leading-6 whitespace-pre-wrap text-(--text)">
              {affiliate.applicationNote}
            </p>
          </PanelSection>
        )}

        <PanelSection title="Payout details" icon={Bank}>
          {affiliate.payoutDetails ? (
            <div className="flex flex-col gap-3">
              <PanelRows>
                <PanelRow label="Method">
                  {PAYOUT_METHOD_LABELS[affiliate.payoutDetails.method]}
                </PanelRow>
                <PanelRow label="Account">
                  {details?.upiId ??
                    details?.accountNumber ??
                    affiliate.payoutDetails.hint}
                </PanelRow>
                {details?.holderName && (
                  <PanelRow label="Holder">{details.holderName}</PanelRow>
                )}
                {details?.ifsc && (
                  <PanelRow label="IFSC">
                    <span className="font-mono text-xs select-all">
                      {details.ifsc}
                    </span>
                  </PanelRow>
                )}
                <PanelRow label="PAN">
                  {details
                    ? (details.pan ?? "Not given")
                    : affiliate.payoutDetails.panLast4
                      ? `••••${affiliate.payoutDetails.panLast4}`
                      : "Not given"}
                </PanelRow>
              </PanelRows>
              {can("affiliate.payout") && !details && (
                <div>
                  <button
                    type="button"
                    className={`${panelSecondaryButton} h-10! w-full`}
                    disabled={reveal.isPending}
                    onClick={() => reveal.mutate(id, { onSuccess: setDetails })}
                  >
                    <Eye size={16} aria-hidden="true" />
                    {reveal.isPending ? "Opening…" : "Show full details"}
                  </button>
                  <p className="m-0 mt-1.5 text-center text-xs text-(--muted)">
                    Each view is recorded in the history.
                  </p>
                </div>
              )}
              {reveal.error && (
                <PanelMessage tone="error">{reveal.error.message}</PanelMessage>
              )}
            </div>
          ) : (
            <p className="m-0 text-sm text-(--muted)">
              They haven&apos;t added payout details yet.
            </p>
          )}
        </PanelSection>

        <PanelSection title="History" icon={ClockCounterClockwise}>
          {audit.isPending ? (
            <div className={`${bone} h-3 w-40`} />
          ) : audit.data?.items.length ? (
            <ol className="relative m-0 list-none space-y-3 p-0 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-(--border)">
              {audit.data.items.map((entry) => (
                <li key={entry.id} className="relative flex gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 size-[7px] shrink-0 rounded-full bg-(--accent) ring-2 ring-(--card-surface)"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-(--text)">
                      {AUDIT_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="block text-xs text-(--muted)">
                      {entry.actorName ? `${entry.actorName} · ` : ""}
                      {formatDay(entry.createdAt)} {formatTime(entry.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-sm text-(--muted)">Nothing yet.</p>
          )}
        </PanelSection>
      </PanelSections>

      {actions.length > 0 && <PanelActions>{actions}</PanelActions>}
    </>
  );
}
