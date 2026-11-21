import { useCallback, useEffect, useMemo } from "react";
import {
  ADMIN_AFFILIATE_SORTS,
  AFFILIATE_STATUSES,
  type AdminAffiliateRow,
  type AdminAffiliateSort,
  type AffiliateStatus,
} from "@veolms/contracts";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";

import { usePageSearchShortcut } from "../../hooks/usePageSearchShortcut";
import { DateRangeControl } from "../../orders/filters/DateRangeControl";
import { MultiSelectFilter } from "../../orders/filters/MultiSelectFilter";
import { StudentAvatar } from "../../orders/StudentAvatar";
import { useCapabilities } from "../../services/authorization";
import {
  affiliatesAdminService,
  useAdminAffiliates,
} from "../../services/affiliates";
import type { ThemedSelectOption } from "../../ThemedSelect";
import { AdminDataTable, type AdminColumn } from "./AdminDataTable";
import {
  AdminFilterRow,
  AdminSearchBox,
  AdminSelectFilter,
  AdminSummaryTiles,
  AdminTabHeader,
  adminFilterWidth,
  panelPrimaryButton,
} from "./AdminListBits";
import { AdminSidePanel, AdminWithPanel, usePanelStep } from "./AdminSidePanel";
import { formatCount, formatDay, money } from "./adminBits";
import {
  AFFILIATE_STATUS_TONES,
  AdminStatusPill,
  StatusDot,
} from "./adminTones";
import { AffiliateDetailBody } from "./AffiliateDetailPanel";
import { includedValues, multiLabel, useAdminListUrl } from "./useAdminListUrl";

const SORT_LABELS: Record<AdminAffiliateSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  earned: "Most earned",
  owed: "Most owed",
  sales: "Most sales",
  clicks: "Most clicks",
};
const SORT_OPTIONS: readonly ThemedSelectOption<AdminAffiliateSort>[] =
  ADMIN_AFFILIATE_SORTS.map((sort) => [sort, SORT_LABELS[sort]] as const);

type ShowFilter = "all" | "owed" | "held";
const SHOW_OPTIONS: readonly ThemedSelectOption<ShowFilter>[] = [
  ["all", "Everyone"],
  ["owed", "Owed money"],
  ["held", "With held commissions"],
];

const STATUS_LABELS = Object.fromEntries(
  AFFILIATE_STATUSES.map((status) => [
    status,
    AFFILIATE_STATUS_TONES[status].label,
  ]),
);

const personName = (row: AdminAffiliateRow) =>
  row.name ?? row.invitedEmail ?? row.code;

/**
 * Every affiliate, applicant and invitation: filtered by status, by who is
 * owed or held, by when they joined, and searched by code, name or email.
 * A row opens beside the list with its actions.
 */
export function AffiliatesTab({ onInvite }: { onInvite: () => void }) {
  const { can } = useCapabilities();
  const url = useAdminListUrl({ defaultRange: "all" });
  const statuses = url.list("statuses", AFFILIATE_STATUSES);
  const show: ShowFilter =
    url.value("owed") === "true"
      ? "owed"
      : url.value("flagged") === "true"
        ? "held"
        : "all";
  const sortValue = url.value("sort");
  const sort: AdminAffiliateSort = (
    ADMIN_AFFILIATE_SORTS as readonly string[]
  ).includes(sortValue ?? "")
    ? (sortValue as AdminAffiliateSort)
    : "newest";

  const filters = {
    statuses: statuses.join(","),
    q: url.search,
    owed: show === "owed" ? "true" : undefined,
    flagged: show === "held" ? "true" : undefined,
    ...url.days,
    sort,
  } as const;
  const list = useAdminAffiliates({
    ...filters,
    page: url.page,
    pageSize: url.pageSize,
  });
  const data = list.data;
  const rows = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;

  // A page past the end (rows went, or a stale link) moves to the last one.
  const { page, setPage } = url;
  useEffect(() => {
    if (data && data.total > 0 && page > data.pageCount)
      setPage(data.pageCount);
  }, [data, page, setPage]);

  usePageSearchShortcut("affiliates-search-input");

  const setStatuses = useCallback(
    (next: readonly AffiliateStatus[]) =>
      url.set({
        statuses: next.length === AFFILIATE_STATUSES.length ? null : next,
      }),
    [url],
  );

  const counts = data?.counts;
  const statusGroups = useMemo(
    () => [
      {
        id: "statuses",
        options: AFFILIATE_STATUSES.map((status) => ({
          id: status,
          label: counts
            ? `${STATUS_LABELS[status]} (${formatCount(counts[status])})`
            : STATUS_LABELS[status]!,
          leading: <StatusDot tone={AFFILIATE_STATUS_TONES[status].tone} />,
        })),
      },
    ],
    [counts],
  );

  const tiles = counts
    ? AFFILIATE_STATUSES.map((status) => ({
        id: status,
        title: STATUS_LABELS[status]!,
        value: formatCount(counts[status]),
        note:
          status === "pending"
            ? "waiting for review"
            : status === "approved"
              ? "earning now"
              : status === "suspended"
                ? "links paused"
                : "turned down",
        active: statuses.length === 1 && statuses[0] === status,
        onSelect: () =>
          setStatuses(
            statuses.length === 1 && statuses[0] === status ? [] : [status],
          ),
      }))
    : null;

  const columns: readonly AdminColumn<AdminAffiliateRow>[] = [
    {
      id: "affiliate",
      header: "Affiliate",
      className: "w-[30%]",
      skeleton: "w-40",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <StudentAvatar name={personName(row)} size="md" />
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold text-(--text)">
              {row.name ?? "Invited"}
            </p>
            <p className="m-0 truncate font-mono text-xs text-(--muted)">
              {row.email ?? row.invitedEmail ?? "–"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "code",
      header: "Code",
      className: "w-[8.5rem]",
      cell: (row) => (
        <span className="inline-block max-w-full truncate rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 font-mono text-xs font-semibold text-(--accent)">
          {row.code}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      className: "w-[9.5rem]",
      skeleton: "w-20",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <AdminStatusPill status={AFFILIATE_STATUS_TONES[row.status]} />
          {row.flagged > 0 && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {row.flagged} held
            </span>
          )}
        </div>
      ),
    },
    {
      id: "clicks",
      header: "Clicks",
      align: "right",
      className: "hidden w-[5.5rem] @5xl:table-cell",
      skeleton: "w-8",
      cell: (row) => (
        <span className="text-sm text-(--text-secondary)">
          {formatCount(row.clicks)}
        </span>
      ),
    },
    {
      id: "sales",
      header: "Sales",
      align: "right",
      className: "w-[5.5rem]",
      skeleton: "w-8",
      cell: (row) => (
        <span className="text-sm text-(--text-secondary)">
          {formatCount(row.sales)}
        </span>
      ),
    },
    {
      id: "earned",
      header: "Earned",
      align: "right",
      className: "w-[8rem]",
      cell: (row) => (
        <span className="text-sm font-bold text-(--text)">
          {money(row.earned)}
        </span>
      ),
    },
    {
      id: "owed",
      header: "Owed",
      align: "right",
      className: "w-[8rem]",
      cell: (row) => (
        <span
          className={`text-sm font-semibold ${row.available.amountMinor > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-(--muted)"}`}
        >
          {money(row.available)}
        </span>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      className: "hidden w-[7.5rem] @4xl:table-cell",
      cell: (row) => (
        <span className="text-sm text-(--text-secondary)">
          {formatDay(row.createdAt)}
        </span>
      ),
    },
  ];

  const step = usePanelStep(
    rows,
    url.openId,
    url.setOpenId,
    (url.page - 1) * url.pageSize,
    data?.total ?? 0,
  );

  return (
    <div className="flex flex-col gap-5">
      <AdminTabHeader
        title="Affiliates"
        description="Everyone who shares the academy: applications, invitations and their earnings."
      >
        <DateRangeControl
          range={url.range === "all" ? "30d" : url.range}
          customFrom={url.customFrom}
          customTo={url.customTo}
          onRangeChange={url.setRange}
          onCustomRange={url.setCustomRange}
          allTime={{
            active: url.range === "all",
            onSelect: () => url.setRange("all"),
          }}
        />
        {can("affiliate.manage") && (
          <button
            type="button"
            className={panelPrimaryButton}
            onClick={onInvite}
          >
            <PaperPlaneTilt size={16} weight="bold" aria-hidden="true" />
            Invite
          </button>
        )}
      </AdminTabHeader>

      <AdminWithPanel
        panel={
          <AdminSidePanel
            openId={url.openId}
            onOpenChange={url.setOpenId}
            label="Affiliate"
            storageKey="veolms-affiliates-panel-width"
            step={step}
          >
            {url.openId ? (
              <AffiliateDetailBody key={url.openId} id={url.openId} />
            ) : null}
          </AdminSidePanel>
        }
      >
        <AdminSummaryTiles
          label="Affiliates by status"
          tiles={tiles}
          count={4}
          isLoading={list.isPending}
        />

        <AdminFilterRow
          filters={
            <>
              <MultiSelectFilter
                name="Status"
                noun="statuses"
                buttonLabel={multiLabel(
                  statuses,
                  STATUS_LABELS,
                  ["status", "statuses"],
                  AFFILIATE_STATUSES.length,
                )}
                buttonLeading={
                  statuses.length === 1 ? (
                    <StatusDot
                      tone={AFFILIATE_STATUS_TONES[statuses[0]!].tone}
                    />
                  ) : undefined
                }
                groups={statusGroups}
                value={{ selected: statuses, mode: "include" }}
                defaultValue={{ selected: [], mode: "include" }}
                onChange={({ selected, mode }) =>
                  setStatuses(
                    includedValues(selected, mode, AFFILIATE_STATUSES),
                  )
                }
                triggerClassName={adminFilterWidth}
                contentClassName="w-[19rem]"
              />
              <AdminSelectFilter
                id="affiliates-show"
                label="Show"
                value={show}
                options={SHOW_OPTIONS}
                onChange={(next) =>
                  url.set({
                    owed: next === "owed" ? "true" : null,
                    flagged: next === "held" ? "true" : null,
                  })
                }
                className={adminFilterWidth}
              />
              <AdminSelectFilter
                id="affiliates-sort"
                label="Sort"
                value={sort}
                options={SORT_OPTIONS}
                onChange={(next) =>
                  url.set({ sort: next === "newest" ? null : next })
                }
                className={`${adminFilterWidth} col-span-2 @lg:col-span-1`}
              />
            </>
          }
          search={
            <AdminSearchBox
              id="affiliates-search-input"
              value={url.searchText}
              onChange={url.setSearchText}
              placeholder="Search by code, name or email"
            />
          }
        />

        <AdminDataTable
          label="Affiliates"
          nouns={["affiliate", "affiliates"]}
          rows={rows}
          columns={columns}
          card={(row) => (
            <>
              <div className="flex w-full items-start gap-3">
                <StudentAvatar name={personName(row)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-(--text)">
                    {row.name ?? "Invited"}{" "}
                    <span className="font-mono text-xs font-semibold text-(--accent)">
                      {row.code}
                    </span>
                  </p>
                  <p className="m-0 truncate text-xs text-(--muted)">
                    {row.email ?? row.invitedEmail ?? "–"}
                  </p>
                </div>
                <AdminStatusPill status={AFFILIATE_STATUS_TONES[row.status]} />
              </div>
              <p className="m-0 flex w-full flex-wrap gap-x-3 text-xs text-(--muted) tabular-nums">
                <span>{formatCount(row.sales)} sales</span>
                <span>Earned {money(row.earned)}</span>
                <span>Owed {money(row.available)}</span>
                {row.flagged > 0 && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {row.flagged} held
                  </span>
                )}
              </p>
            </>
          )}
          total={data?.total ?? 0}
          page={url.page}
          pageCount={pageCount}
          pageSize={url.pageSize}
          onPageChange={url.setPage}
          onPageSizeChange={url.setPageSize}
          isLoading={list.isPending}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          selectedId={url.openId}
          onOpen={url.setOpenId}
          exportUrl={affiliatesAdminService.reportExportUrl(
            "affiliates",
            filters,
          )}
          isFiltered={url.isFiltered}
          onResetFilters={url.reset}
          empty={{
            title: "No affiliates yet",
            text: "Share the join page, or invite someone by email.",
          }}
        />
      </AdminWithPanel>
    </div>
  );
}
