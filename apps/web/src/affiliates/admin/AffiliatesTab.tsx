import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import type { AffiliateStatus } from "@veolms/contracts";
import { useState } from "react";

import { useAdminAffiliates } from "../../services/affiliates";
import {
  EmptyState,
  ListSkeleton,
  LoadError,
  SearchField,
} from "../../team/TeamBits";
import {
  AffiliateStatusChip,
  FilterPills,
  MoreButton,
  formatDay,
  money,
} from "./adminBits";
import { AffiliateDetailPanel } from "./AffiliateDetailPanel";

type StatusFilter = AffiliateStatus | "all";
const STATUS_OPTIONS: readonly { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "suspended", label: "Suspended" },
  { id: "rejected", label: "Rejected" },
];

/** Every affiliate, applicant and invitation, with their totals. */
export function AffiliatesTab() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useAdminAffiliates({
    status: status === "all" ? undefined : status,
    q: search.trim() || undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
        <div className="w-full max-w-xs">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Code, name or email"
            label="Search affiliates"
          />
        </div>
      </div>

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError ? (
        <LoadError
          icon={Users}
          title="Couldn't load affiliates"
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            search || status !== "all" ? "No one matches" : "No affiliates yet"
          }
        >
          {search || status !== "all"
            ? "Try another filter."
            : "Share the join page, or invite someone by email."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-(--surface) shadow-[inset_0_0_0_1px_var(--border)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-(--muted)">
                <th className="px-4 py-3 font-semibold">Affiliate</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Clicks</th>
                <th className="px-4 py-3 text-right font-semibold">Sales</th>
                <th className="px-4 py-3 text-right font-semibold">Earned</th>
                <th className="px-4 py-3 text-right font-semibold">Owed</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => setOpenId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenId(row.id);
                    }
                  }}
                  className="cursor-pointer border-t border-(--border) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-(--text)">
                      {row.code}
                    </div>
                    <div className="text-xs text-(--muted)">
                      {row.name ??
                        (row.invitedEmail
                          ? `Invited: ${row.invitedEmail}`
                          : "–")}
                      {row.email ? ` · ${row.email}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <AffiliateStatusChip status={row.status} />
                      {row.flagged > 0 ? (
                        <span className="text-xs font-semibold text-amber-500">
                          {row.flagged} held
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{row.clicks}</td>
                  <td className="px-4 py-3 text-right">{row.sales}</td>
                  <td className="px-4 py-3 text-right">{money(row.earned)}</td>
                  <td className="px-4 py-3 text-right">
                    {money(row.available)}
                  </td>
                  <td className="px-4 py-3 text-(--muted)">
                    {formatDay(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MoreButton
        hasMore={Boolean(list.hasNextPage)}
        loading={list.isFetchingNextPage}
        onMore={() => void list.fetchNextPage()}
      />
      {openId ? (
        <AffiliateDetailPanel id={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}
