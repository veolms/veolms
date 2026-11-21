import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { AffiliateMeResponse } from "@veolms/contracts";
import { BankIcon as Bank } from "@phosphor-icons/react/Bank";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CursorClickIcon as CursorClick } from "@phosphor-icons/react/CursorClick";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { HourglassMediumIcon as Hourglass } from "@phosphor-icons/react/HourglassMedium";
import { PercentIcon as Percent } from "@phosphor-icons/react/Percent";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { WalletIcon as Wallet } from "@phosphor-icons/react/Wallet";
import { WarningIcon as Warning } from "@phosphor-icons/react/Warning";

import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import { DateRangeControl } from "../orders/filters/DateRangeControl";
import { useCurrentUser } from "../services/auth";
import {
  useAffiliateCommissionsPage,
  useAffiliateMe,
  useUpdateAffiliateMe,
} from "../services/affiliates";
import {
  SettingRow,
  SettingsToggle,
  StatusNote,
} from "../settings/SettingsControls";
import { SettingsTabBar } from "../settings/SettingsTabBar";
import {
  EmptyState,
  LoadError,
  secondaryButtonClassName,
} from "../team/TeamBits";
import { AdminStatusPill } from "./admin/adminTones";
import { CodeChip } from "./admin/AdminPanelBits";
import { useAdminListUrl } from "./admin/useAdminListUrl";
import { AffiliateBalances } from "./AffiliateBalances";
import {
  AFFILIATE_DASHBOARD_TAB_DEFINITIONS,
  AFFILIATE_DASHBOARD_TABS,
  isAffiliateDashboardTab,
  type AffiliateDashboardTab,
} from "./affiliateDashboardTabs";
import { formatAffiliateMoney, formatAffiliateRate } from "./affiliateFormat";
import {
  AffiliateCommissionHistory,
  AffiliatePayoutHistory,
  VIEW_STATE_TONES,
  commissionTitle,
  viewState,
} from "./AffiliateHistory";
import { AffiliateLinkCard } from "./AffiliateLinkCard";
import {
  AffiliatePayoutPanel,
  PayoutDetailsForm,
} from "./AffiliatePayoutPanel";
import "../styles/features/settings/foundation.css";
import "../styles/features/settings/preferences-responsive.css";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

// The rows' controls drop under their text on a phone, as in Platform.
const ROW_CLASS =
  "max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2";

/**
 * /affiliate: the affiliate's dashboard, laid out as the admin's Affiliates
 * page: Overview, Commissions, Payouts and Settings tabs. What shows first
 * depends on their status: a pending application waits, a rejected one
 * says why and when they may apply again, a suspended affiliate keeps
 * their history and balances but loses the link.
 */
export function AffiliateDashboardPage() {
  const { data: user, isPending: userPending } = useCurrentUser();
  const me = useAffiliateMe({ enabled: Boolean(user) });
  const ready =
    me.data && me.data.status !== "pending" && me.data.status !== "rejected";

  if (ready) return <Workspace me={me.data!} />;
  return (
    <div className="settings-page" aria-labelledby="affiliate-title">
      <div className="settings-page__heading mb-4">
        <PageHeading
          id="affiliate-title"
          title="Affiliate"
          description="Your link, your earnings and your payouts."
          copyClassName="settings-page__heading-copy"
        />
      </div>
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
      ) : me.data.status === "pending" ? (
        <StateCard
          icon={Hourglass}
          tone="info"
          title="Your application is with the academy"
        >
          You&apos;ll get an email once it&apos;s reviewed. Your code will be{" "}
          <CodeChip code={me.data.code} />.
        </StateCard>
      ) : (
        <Rejected me={me.data} />
      )}
    </div>
  );
}

function Rejected({ me }: { me: AffiliateMeResponse }) {
  const canReapply =
    !me.reapplyAfter || new Date(me.reapplyAfter) <= new Date();
  return (
    <StateCard
      icon={Handshake}
      tone="neutral"
      title="Your application wasn't accepted"
    >
      {me.statusReason ? (
        <span className="block whitespace-pre-wrap">{me.statusReason}</span>
      ) : null}
      {canReapply ? (
        <Link
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-(--accent) px-4 text-sm font-bold text-(--on-accent) hover:opacity-90"
          to="/affiliates/join"
        >
          Apply again
        </Link>
      ) : me.reapplyAfter ? (
        <span className="mt-2 block">
          You can apply again from{" "}
          {dateFormat.format(new Date(me.reapplyAfter))}.
        </span>
      ) : null}
    </StateCard>
  );
}

function Workspace({ me }: { me: AffiliateMeResponse }) {
  const navigate = useNavigate();
  const params = useParams();
  const tabListRef = useRef<HTMLElement>(null);
  const activeTab: AffiliateDashboardTab = isAffiliateDashboardTab(params.tab)
    ? params.tab
    : "overview";
  const navigateTab = useCallback(
    (id: AffiliateDashboardTab) =>
      void navigate(id === "overview" ? "/affiliate" : `/affiliate/${id}`),
    [navigate],
  );

  return (
    <div className="settings-page" aria-labelledby="affiliate-title">
      <header className="settings-page__topbar contents!">
        <div className="settings-page__heading mb-2 items-end!">
          <PageHeading
            id="affiliate-title"
            title="Affiliate"
            description="Your link, your earnings and your payouts."
            copyClassName="settings-page__heading-copy"
          />
        </div>
        <SettingsTabBar
          tabs={AFFILIATE_DASHBOARD_TAB_DEFINITIONS}
          activeTab={activeTab}
          idPrefix="my-affiliate-tab"
          panelId="my-affiliate-tab-panel"
          label="Affiliate dashboard sections"
          navRef={tabListRef}
          onPrepare={() => undefined}
          onSelect={navigateTab}
        />
      </header>
      <SwipeableTabPanel
        tabs={AFFILIATE_DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={navigateTab}
        tabListRef={tabListRef}
        id="my-affiliate-tab-panel"
        className="settings-tab-content pt-2 pb-10"
        stateAttribute="data-my-affiliate-tab"
        labelledBy={`my-affiliate-tab-${activeTab}`}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab !== activeTab ? null : panelTab === "overview" ? (
            <OverviewTab me={me} onOpenTab={navigateTab} />
          ) : panelTab === "commissions" ? (
            <AffiliateCommissionHistory />
          ) : panelTab === "payouts" ? (
            <AffiliatePayoutHistory
              action={
                <AffiliatePayoutPanel
                  me={me}
                  onEditDetails={() => navigateTab("settings")}
                />
              }
            />
          ) : (
            <SettingsTab me={me} />
          )
        }
      </SwipeableTabPanel>
    </div>
  );
}

function OverviewTab({
  me,
  onOpenTab,
}: {
  me: AffiliateMeResponse;
  onOpenTab: (tab: AffiliateDashboardTab) => void;
}) {
  const url = useAdminListUrl({ defaultRange: "30d" });
  return (
    <div className="flex flex-col gap-5">
      {me.status === "suspended" ? (
        <StateCard
          icon={Warning}
          tone="warning"
          title="Your affiliate account is suspended"
        >
          Your link no longer earns commissions.{" "}
          {me.statusReason ?? "Contact the academy to find out more."}
        </StateCard>
      ) : (
        <AffiliateLinkCard me={me} />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold tracking-tight text-(--text)">
            How it&apos;s going
          </h2>
          <DateRangeControl
            range={url.range === "all" ? "30d" : url.range}
            customFrom={url.customFrom}
            customTo={url.customTo}
            onRangeChange={url.setRange}
            onCustomRange={url.setCustomRange}
          />
        </div>
        <AffiliateBalances range={url.days} />
      </div>

      <div className="@container">
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <AffiliatePayoutPanel
            me={me}
            onEditDetails={() => onOpenTab("settings")}
          />
          <RecentCommissions onSeeAll={() => onOpenTab("commissions")} />
        </div>
      </div>
    </div>
  );
}

/** The latest few commissions, with the way to all of them. */
function RecentCommissions({ onSeeAll }: { onSeeAll: () => void }) {
  const list = useAffiliateCommissionsPage({ page: 1, pageSize: 10 });
  const rows = (list.data?.items ?? []).slice(0, 5);
  return (
    <ElevatedCard
      as="section"
      className="overflow-hidden p-0"
      aria-label="Latest commissions"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="m-0 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase">
          Latest commissions
        </h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-(--accent) hover:bg-(--hover)"
        >
          See all
          <CaretRight size={13} weight="bold" aria-hidden="true" />
        </button>
      </header>
      {list.isPending ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-t border-(--border) px-5 py-3"
            >
              <div className="h-3.5 flex-1 animate-pulse rounded bg-(--border)" />
              <div className="h-3.5 w-14 animate-pulse rounded bg-(--border)" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 border-t border-(--border) px-5 py-8 text-center text-sm text-(--muted)">
          No commissions yet. Share your link to earn your first.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 border-t border-(--border) px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold text-(--text)">
                  {commissionTitle(row)}
                </p>
                <p className="m-0 text-xs text-(--muted)">
                  {shortDate.format(new Date(row.createdAt))}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-bold tabular-nums ${row.amount.amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-(--text)"}`}
              >
                {formatAffiliateMoney(row.amount)}
              </span>
              <AdminStatusPill status={VIEW_STATE_TONES[viewState(row)]} />
            </li>
          ))}
        </ul>
      )}
    </ElevatedCard>
  );
}

function SettingsTab({ me }: { me: AffiliateMeResponse }) {
  const update = useUpdateAffiliateMe();
  const [editing, setEditing] = useState(!me.payoutDetails);
  const { program } = me;
  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Settings</h2>
          <p>
            Where you&apos;re paid, the emails you get, and the program&apos;s
            terms.
          </p>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="my-payout-heading">
        <header className="settings-section__heading mb-3">
          <Bank size={20} weight="duotone" />
          <div>
            <h3 id="my-payout-heading">Where you&apos;re paid</h3>
            <p>
              Stored encrypted and used only to pay you and meet tax rules. Only
              the last digits are ever shown.
            </p>
          </div>
        </header>
        {editing ? (
          <div className="rounded-xl border border-(--border) p-4">
            <PayoutDetailsForm
              onDone={() => setEditing(false)}
              canCancel={Boolean(me.payoutDetails)}
            />
          </div>
        ) : (
          <div className="settings-row-list">
            <SettingRow
              className={ROW_CLASS}
              icon={Bank}
              label={me.payoutDetails?.hint ?? "Not added yet"}
              note={
                me.payoutDetails?.panLast4
                  ? `PAN ••••${me.payoutDetails.panLast4}`
                  : "No PAN: 20% TDS may be deducted once you pass ₹20,000 in a year."
              }
            >
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => setEditing(true)}
              >
                {me.payoutDetails ? "Change" : "Add"}
              </button>
            </SettingRow>
          </div>
        )}
      </section>

      <section className="settings-section" aria-labelledby="my-emails-heading">
        <header className="settings-section__heading mb-3">
          <EnvelopeSimple size={20} weight="duotone" />
          <div>
            <h3 id="my-emails-heading">Emails</h3>
            <p>Payout and account emails are always sent.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={EnvelopeSimple}
            label="Email me for each commission"
            note="A short note each time a sale earns you something."
          >
            <SettingsToggle
              label="Email me for each commission"
              checked={me.notifyOnCommission}
              disabled={update.isPending}
              onChange={(next) => update.mutate({ notifyOnCommission: next })}
            />
          </SettingRow>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="my-terms-heading">
        <header className="settings-section__heading mb-3">
          <FileText size={20} weight="duotone" />
          <div>
            <h3 id="my-terms-heading">The program</h3>
            <p>Set by the academy. Changes apply to new sales.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            className={ROW_CLASS}
            icon={Percent}
            label="You earn"
            note="On the price before tax, after any discount."
          >
            <StatusNote>
              {program.defaultRate
                ? formatAffiliateRate(program.defaultRate)
                : "Set by the academy"}
            </StatusNote>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={CursorClick}
            label="A click counts for"
            note="The last affiliate link a buyer clicked gets the sale."
          >
            <StatusNote>{program.attributionWindowDays} days</StatusNote>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={CalendarCheck}
            label="Commissions wait"
            note="The academy's refund window, before you can withdraw."
          >
            <StatusNote>{program.holdDays} days</StatusNote>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Wallet}
            label="Smallest payout"
            note="You can withdraw once you reach it."
          >
            <StatusNote>{formatAffiliateMoney(program.minPayout)}</StatusNote>
          </SettingRow>
          <SettingRow
            className={ROW_CLASS}
            icon={Tag}
            label="Buyers with your code"
            note="Your code works as a coupon when there's a discount."
          >
            <StatusNote>
              {program.buyerDiscountPercent > 0
                ? `${program.buyerDiscountPercent}% off`
                : "No discount"}
            </StatusNote>
          </SettingRow>
        </div>
        {program.termsText.trim() && (
          <details className="mt-3 rounded-xl border border-(--border) px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-(--text)">
              Terms you accepted
            </summary>
            <p className="m-0 mt-2 text-sm leading-6 whitespace-pre-wrap text-(--text-secondary)">
              {program.termsText}
            </p>
          </details>
        )}
      </section>
    </div>
  );
}

const STATE_TONES = {
  info: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  neutral: "bg-(--surface-strong) text-(--muted)",
} as const;

/** A status the dashboard is in instead of (or above) the usual page. */
function StateCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof Handshake;
  tone: keyof typeof STATE_TONES;
  title: string;
  children: ReactNode;
}) {
  return (
    <ElevatedCard
      as="section"
      className={`flex items-start gap-4 p-5 ${tone === "warning" ? "border border-amber-500/30" : ""}`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${STATE_TONES[tone]}`}
      >
        <Icon size={22} weight="duotone" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="m-0 text-base font-bold text-(--text)">{title}</h2>
        <div className="m-0 mt-1 text-sm leading-6 text-(--text-secondary)">
          {children}
        </div>
      </div>
    </ElevatedCard>
  );
}
