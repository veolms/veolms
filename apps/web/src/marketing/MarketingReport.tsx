import { useState } from "react";
import {
  MARKETING_RECIPIENT_FILTERS,
  type MarketingEmail,
  type MarketingRecipientFilter,
} from "@veolms/contracts";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import {
  useMarketingRecipients,
  useMarketingReport,
} from "../services/marketing";
import { surfaceClass } from "../workshops/workshopHelpers";
import {
  formatCount,
  formatRupees,
  formatWhen,
  rateOf,
} from "./marketingHelpers";

const FILTER_LABELS: Record<MarketingRecipientFilter, string> = {
  all: "Everyone",
  opened: "Opened",
  clicked: "Clicked",
  not_opened: "Didn't open",
  unsubscribed: "Unsubscribed",
  failed: "Failed",
  skipped: "Skipped",
};

const STATUS_TEXT = {
  pending: "Waiting",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
} as const;

function Stat({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-3">
      <p className="m-0 text-[12px] font-medium text-(--muted)">{label}</p>
      <p
        className={`m-0 mt-0.5 text-xl font-bold tracking-tight ${accent ? "text-emerald-500" : "text-(--text)"}`}
      >
        {value}
      </p>
      {detail ? (
        <p className="m-0 text-[11.5px] text-(--muted)">{detail}</p>
      ) : null}
    </div>
  );
}

/** An email's results: totals, revenue, and who it went to. */
export function MarketingReport({
  email,
  compact = false,
  action,
}: {
  email: MarketingEmail;
  /** Inside an automation's page: a smaller heading. */
  compact?: boolean;
  /** "Resend to people who didn't open", beside the heading. */
  action?: React.ReactNode;
}) {
  const live = email.status === "sending" || email.status === "active";
  const report = useMarketingReport(email.id, { live });
  const [filter, setFilter] = useState<MarketingRecipientFilter>("all");
  const [page, setPage] = useState(1);
  const recipients = useMarketingRecipients(email.id, filter, page, { live });
  const stats = report.data?.stats ?? email.stats;
  const revenue = report.data?.revenue;
  const pages = recipients.data
    ? Math.max(1, Math.ceil(recipients.data.total / recipients.data.pageSize))
    : 1;
  const progress = stats.recipients
    ? Math.round(((stats.recipients - stats.pending) / stats.recipients) * 100)
    : 0;

  return (
    <section
      className={`${surfaceClass} grid gap-5 p-5 sm:p-6`}
      aria-label="Results"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className={`m-0 font-bold tracking-tight text-(--text) ${compact ? "text-base" : "text-lg"}`}
          >
            Results
          </h2>
          <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">
            {email.status === "sending"
              ? `Sending… ${progress}% done. This page updates by itself.`
              : "Opens are approximate: some mail apps open every email by themselves."}
          </p>
        </div>
        {action}
      </div>

      {email.status === "sending" ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-(--canvas)"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sending progress"
        >
          <div
            className="h-full rounded-full bg-(--accent) transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat
          label="Sent"
          value={formatCount(stats.sent)}
          detail={
            stats.pending
              ? `${formatCount(stats.pending)} waiting`
              : `of ${formatCount(stats.recipients)}`
          }
        />
        <Stat
          label="Opened"
          value={rateOf(stats.opened, stats)}
          detail={`${formatCount(stats.opened)} people`}
        />
        <Stat
          label="Clicked"
          value={rateOf(stats.clicked, stats)}
          detail={`${formatCount(stats.clicked)} people`}
        />
        <Stat
          label="Revenue"
          value={revenue ? formatRupees(revenue.amount, revenue.currency) : "—"}
          detail={
            revenue
              ? `${formatCount(revenue.orders)} ${revenue.orders === 1 ? "order" : "orders"} in 7 days after a click`
              : "Loading"
          }
          accent={Boolean(revenue?.amount)}
        />
        <Stat label="Unsubscribed" value={formatCount(stats.unsubscribed)} />
        <Stat
          label="Not sent"
          value={formatCount(stats.failed + stats.skipped)}
          detail={`${formatCount(stats.failed)} failed · ${formatCount(stats.skipped)} skipped`}
        />
      </div>

      <div className="grid gap-3">
        <div
          role="tablist"
          aria-label="Filter people"
          className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1"
        >
          {MARKETING_RECIPIENT_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={filter === option}
              onClick={() => {
                setFilter(option);
                setPage(1);
              }}
              className={`shrink-0 cursor-pointer rounded-md border-none px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === option
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "bg-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              {FILTER_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[12px] text-(--muted)">
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Opened</th>
                <th className="px-4 py-2.5 font-medium">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {recipients.data?.recipients.length ? (
                recipients.data.recipients.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                  >
                    <td className="max-w-[260px] px-4 py-2.5">
                      <p className="m-0 truncate font-semibold text-(--text)">
                        {row.name}
                      </p>
                      <p className="m-0 truncate text-[12px] text-(--muted)">
                        {row.email}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          row.status === "failed"
                            ? "text-rose-500"
                            : "text-(--text)"
                        }
                      >
                        {row.unsubscribedAt
                          ? "Unsubscribed"
                          : STATUS_TEXT[row.status]}
                      </span>
                      {row.error && row.status !== "pending" ? (
                        <p
                          className="m-0 max-w-[220px] truncate text-[11.5px] text-(--muted)"
                          title={row.error}
                        >
                          {row.error}
                        </p>
                      ) : row.sentAt ? (
                        <p className="m-0 text-[11.5px] text-(--muted)">
                          {formatWhen(row.sentAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-(--muted)">
                      {row.openedAt ? formatWhen(row.openedAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-(--muted)">
                      {row.clickedAt ? formatWhen(row.clickedAt) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-(--muted)"
                  >
                    {recipients.isLoading
                      ? "Loading…"
                      : filter === "all"
                        ? "Nobody yet."
                        : `Nobody in "${FILTER_LABELS[filter]}".`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2 text-[12px] text-(--muted)">
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent text-(--text) disabled:opacity-30"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              aria-label="Previous page"
            >
              <CaretLeft size={14} />
            </button>
            <button
              type="button"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent text-(--text) disabled:opacity-30"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Next page"
            >
              <CaretRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
