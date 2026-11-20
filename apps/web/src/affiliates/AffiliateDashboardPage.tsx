import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { HourglassMediumIcon as Hourglass } from "@phosphor-icons/react/HourglassMedium";
import type { AffiliateMeResponse } from "@veolms/contracts";
import { Link } from "react-router";

import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { useCurrentUser } from "../services/auth";
import { useAffiliateMe, useUpdateAffiliateMe } from "../services/affiliates";
import {
  EmptyState,
  LoadError,
  secondaryButtonClassName,
} from "../team/TeamBits";
import { AffiliateBalances } from "./AffiliateBalances";
import {
  AffiliateCommissionHistory,
  AffiliatePayoutHistory,
} from "./AffiliateHistory";
import { AffiliateLinkCard } from "./AffiliateLinkCard";
import { AffiliatePayoutPanel } from "./AffiliatePayoutPanel";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * /affiliate: the affiliate's dashboard. What shows depends on their status:
 * a pending application waits, a rejected one says why and when they may
 * apply again, a suspended affiliate sees their balances but no link, and an
 * approved one gets the whole page.
 */
export function AffiliateDashboardPage() {
  const { data: user, isPending: userPending } = useCurrentUser();
  const me = useAffiliateMe({ enabled: Boolean(user) });

  return (
    <main
      className="flex w-full min-w-0 flex-col gap-6 font-sans"
      aria-labelledby="affiliate-title"
    >
      <PageHeading
        id="affiliate-title"
        title="Affiliate"
        description="Your link, your earnings and your payouts."
      />
      {userPending || (user && me.isPending) ? (
        <ElevatedCard
          padded
          className="h-48 animate-pulse"
          aria-hidden="true"
        />
      ) : !user ? (
        <EmptyState
          icon={Handshake}
          title="Sign in to see your affiliate dashboard"
        >
          <Link
            className="font-semibold text-(--accent)"
            to="/login?returnTo=/affiliate"
          >
            Sign in
          </Link>
        </EmptyState>
      ) : me.error?.status === 404 ? (
        <EmptyState icon={Handshake} title="You're not an affiliate yet">
          <Link className="font-semibold text-(--accent)" to="/affiliates/join">
            See how the program works
          </Link>
        </EmptyState>
      ) : me.isError || !me.data ? (
        <LoadError
          icon={Handshake}
          title="Couldn't load your dashboard"
          onRetry={() => void me.refetch()}
        />
      ) : (
        <Dashboard me={me.data} />
      )}
    </main>
  );
}

function Dashboard({ me }: { me: AffiliateMeResponse }) {
  if (me.status === "pending") {
    return (
      <EmptyState icon={Hourglass} title="Your application is with the academy">
        <p>
          You&apos;ll get an email once it&apos;s reviewed. Your code will be{" "}
          <span className="font-semibold text-(--text)">{me.code}</span>.
        </p>
      </EmptyState>
    );
  }
  if (me.status === "rejected") {
    const canReapply =
      !me.reapplyAfter || new Date(me.reapplyAfter) <= new Date();
    return (
      <EmptyState icon={Handshake} title="Your application wasn't accepted">
        {me.statusReason ? <p>{me.statusReason}</p> : null}
        {canReapply ? (
          <Link className="font-semibold text-(--accent)" to="/affiliates/join">
            Apply again
          </Link>
        ) : me.reapplyAfter ? (
          <p>
            You can apply again from{" "}
            {dateFormat.format(new Date(me.reapplyAfter))}.
          </p>
        ) : null}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {me.status === "suspended" ? (
        <ElevatedCard
          padded
          className="flex flex-col gap-1 border border-amber-500/30"
        >
          <p className="m-0 font-semibold text-(--text)">
            Your affiliate account is suspended
          </p>
          <p className="m-0 text-sm text-(--muted)">
            Your link no longer earns commissions.{" "}
            {me.statusReason ?? "Contact the academy to find out more."}
          </p>
        </ElevatedCard>
      ) : (
        <AffiliateLinkCard code={me.code} link={me.link} />
      )}
      <AffiliateBalances me={me} />
      {me.status === "approved" ? <AffiliatePayoutPanel me={me} /> : null}
      <AffiliatePayoutHistory />
      <AffiliateCommissionHistory />
      <NotifyToggle on={me.notifyOnCommission} />
    </div>
  );
}

function NotifyToggle({ on }: { on: boolean }) {
  const update = useUpdateAffiliateMe();
  return (
    <ElevatedCard
      padded
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div>
        <p className="m-0 text-sm font-semibold text-(--text)">
          Email me for each commission
        </p>
        <p className="m-0 text-xs text-(--muted)">
          Payout and account emails are always sent.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={update.isPending}
        className={secondaryButtonClassName}
        onClick={() => update.mutate({ notifyOnCommission: !on })}
      >
        {on ? "On" : "Off"}
      </button>
    </ElevatedCard>
  );
}
