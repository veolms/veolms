import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import type {
  AdminPayoutDetailsResponse,
  AffiliateStatusAction,
} from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useCapabilities } from "../../services/authorization";
import {
  useAdminAffiliate,
  useAffiliateAudit,
  useChangeAffiliateStatus,
  useRevealPayoutDetails,
} from "../../services/affiliates";
import {
  ListSkeleton,
  PanelBody,
  secondaryButtonClassName,
} from "../../team/TeamBits";
import {
  AffiliateStatusChip,
  ReasonPanel,
  formatDay,
  money,
} from "./adminBits";

const AUDIT_LABELS: Record<string, string> = {
  "affiliate.approved": "Approved",
  "affiliate.rejected": "Rejected",
  "affiliate.suspended": "Suspended",
  "affiliate.reinstated": "Reinstated",
  "affiliate.invited": "Invited",
  "payout_details.viewed": "Payout details viewed",
};

/**
 * One affiliate: who they are, their own words, balances and coupon, the
 * status actions, their full payout details on request (audited) and the
 * history of what the team did.
 */
export function AffiliateDetailPanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { can } = useCapabilities();
  const detail = useAdminAffiliate(id);
  const audit = useAffiliateAudit(id);
  const change = useChangeAffiliateStatus();
  const reveal = useRevealPayoutDetails();
  const [asking, setAsking] = useState<"reject" | "suspend" | null>(null);
  const [details, setDetails] = useState<AdminPayoutDetailsResponse | null>(
    null,
  );
  const affiliate = detail.data;
  const canManage = can("affiliate.manage");

  const act = (action: AffiliateStatusAction, reason?: string) =>
    change.mutate({ id, action, reason }, { onSuccess: () => setAsking(null) });

  return (
    <SlideOverPanel
      label="Affiliate"
      title={affiliate ? affiliate.code : "Affiliate"}
      onClose={onClose}
      headerContent={
        affiliate ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-(--muted)">
            <AffiliateStatusChip status={affiliate.status} />
            <span>{affiliate.name ?? affiliate.invitedEmail}</span>
            {affiliate.email ? <span>· {affiliate.email}</span> : null}
          </div>
        ) : null
      }
    >
      <PanelBody>
        {!affiliate ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-5 text-sm">
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {affiliate.status === "pending" &&
                (affiliate.name || affiliate.email) ? (
                  <Button
                    elevation="flat"
                    motion="static"
                    disabled={change.isPending}
                    onClick={() => act("approve")}
                  >
                    Approve
                  </Button>
                ) : null}
                {affiliate.status === "pending" ? (
                  <Button
                    variant="danger"
                    elevation="flat"
                    motion="static"
                    onClick={() => setAsking("reject")}
                  >
                    {affiliate.invitedEmail ? "Withdraw invitation" : "Reject"}
                  </Button>
                ) : null}
                {affiliate.status === "approved" ? (
                  <Button
                    variant="danger"
                    elevation="flat"
                    motion="static"
                    onClick={() => setAsking("suspend")}
                  >
                    Suspend
                  </Button>
                ) : null}
                {affiliate.status === "suspended" ? (
                  <Button
                    elevation="flat"
                    motion="static"
                    disabled={change.isPending}
                    onClick={() => act("reinstate")}
                  >
                    Reinstate
                  </Button>
                ) : null}
              </div>
            ) : null}
            {change.error && !asking ? (
              <p role="alert" className="m-0 text-rose-500">
                {change.error.message}
              </p>
            ) : null}

            {affiliate.statusReason ? (
              <Section title="Reason given">
                <p className="m-0 whitespace-pre-wrap text-(--text)">
                  {affiliate.statusReason}
                </p>
              </Section>
            ) : null}
            {affiliate.applicationNote ? (
              <Section title="How they'll promote the academy">
                {/* Their own words: plain text, never HTML. */}
                <p className="m-0 whitespace-pre-wrap text-(--text)">
                  {affiliate.applicationNote}
                </p>
              </Section>
            ) : null}

            <Section title="Balances">
              <dl className="m-0 grid grid-cols-2 gap-2">
                <Fact
                  label="Pending"
                  value={money(affiliate.balances.pending)}
                />
                <Fact
                  label="Owed"
                  value={money(affiliate.balances.available)}
                />
                <Fact
                  label="In payout"
                  value={money(affiliate.balances.inPayout)}
                />
                <Fact label="Paid" value={money(affiliate.balances.paid)} />
              </dl>
            </Section>

            <Section title="Activity">
              <dl className="m-0 grid grid-cols-2 gap-2">
                <Fact label="Clicks" value={String(affiliate.clicks)} />
                <Fact label="Sales" value={String(affiliate.sales)} />
                <Fact label="Joined" value={formatDay(affiliate.createdAt)} />
                <Fact
                  label="Coupon"
                  value={
                    affiliate.coupon
                      ? `${affiliate.coupon.code}${affiliate.coupon.active ? "" : " (off)"}`
                      : "None"
                  }
                />
              </dl>
            </Section>

            <Section title="Payout details">
              {affiliate.payoutDetails ? (
                <div className="flex flex-col gap-2">
                  <p className="m-0 text-(--text)">
                    {affiliate.payoutDetails.hint}
                    {affiliate.payoutDetails.panLast4
                      ? ` · PAN ••••${affiliate.payoutDetails.panLast4}`
                      : " · no PAN"}
                  </p>
                  {can("affiliate.payout") ? (
                    details ? (
                      <dl className="m-0 grid grid-cols-2 gap-2 rounded-xl bg-(--surface-strong) p-3">
                        {details.upiId ? (
                          <Fact label="UPI id" value={details.upiId} />
                        ) : null}
                        {details.holderName ? (
                          <Fact label="Holder" value={details.holderName} />
                        ) : null}
                        {details.accountNumber ? (
                          <Fact label="Account" value={details.accountNumber} />
                        ) : null}
                        {details.ifsc ? (
                          <Fact label="IFSC" value={details.ifsc} />
                        ) : null}
                        <Fact label="PAN" value={details.pan ?? "–"} />
                      </dl>
                    ) : (
                      <button
                        type="button"
                        className={`${secondaryButtonClassName} self-start`}
                        disabled={reveal.isPending}
                        onClick={() =>
                          reveal.mutate(id, { onSuccess: setDetails })
                        }
                      >
                        <Eye size={16} aria-hidden="true" /> Show full details
                      </button>
                    )
                  ) : null}
                  {reveal.error ? (
                    <p role="alert" className="m-0 text-rose-500">
                      {reveal.error.message}
                    </p>
                  ) : null}
                  {can("affiliate.payout") && !details ? (
                    <p className="m-0 text-xs text-(--muted)">
                      Each view is recorded.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="m-0 text-(--muted)">Not added yet.</p>
              )}
            </Section>

            <Section title="History">
              {audit.data?.items.length ? (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {audit.data.items.map((entry) => (
                    <li key={entry.id} className="text-(--text-secondary)">
                      {AUDIT_LABELS[entry.action] ?? entry.action}
                      {entry.actorName ? ` by ${entry.actorName}` : ""} ·{" "}
                      {formatDay(entry.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-(--muted)">Nothing yet.</p>
              )}
            </Section>
          </div>
        )}
      </PanelBody>

      {asking ? (
        <ReasonPanel
          title={
            asking === "suspend"
              ? "Suspend this affiliate"
              : affiliate?.invitedEmail
                ? "Withdraw the invitation"
                : "Reject the application"
          }
          description={
            asking === "suspend"
              ? "Their links and coupon stop earning at once, and pending commissions are held for review. They'll see the reason."
              : "They'll see the reason."
          }
          confirmLabel={asking === "suspend" ? "Suspend" : "Reject"}
          danger
          pending={change.isPending}
          error={change.error?.message}
          onConfirm={(reason) => act(asking, reason)}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </SlideOverPanel>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-semibold tracking-wide text-(--muted) uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-(--muted)">{label}</dt>
      <dd className="m-0 truncate font-semibold text-(--text)">{value}</dd>
    </div>
  );
}
