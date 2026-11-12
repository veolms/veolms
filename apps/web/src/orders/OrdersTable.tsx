import { memo, useMemo } from "react";
import type { AdminOrder, OrderCourseOption } from "@veolms/contracts";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/FunnelSimple";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { ElevatedCard } from "../components/ElevatedCard";
import { formatNumber } from "./orderHelpers";
import { OrderListCard, OrderTableRow } from "./OrdersTableRows";

export interface OrdersTableProps {
  orders: readonly AdminOrder[];
  courses: readonly OrderCourseOption[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  freeOnly: boolean;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  exportUrl: string;
  onResetFilters: () => void;
  loadError: "forbidden" | "failed" | null;
  onRetry: () => void;
}

const headCell =
  "px-3 py-3 text-left text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";

/**
 * A page of the orders the filters select: a table where there is room for
 * one, a list of cards where there is not (a phone, or the list beside an
 * open order). Ten to a page, with the range shown, Export CSV, and the
 * page buttons at the foot.
 */
export const OrdersTable = memo(function OrdersTable(props: OrdersTableProps) {
  const {
    orders,
    courses,
    total,
    page,
    pageCount,
    pageSize,
    onPageChange,
    isLoading,
    isFetching,
    freeOnly,
    selectedOrderId,
    onSelectOrder,
    exportUrl,
    onResetFilters,
    loadError,
    onRetry,
  } = props;
  const courseLookup = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  if (loadError) {
    return (
      <ElevatedCard as="div" role="alert" className="p-8 text-center sm:p-12">
        <WarningCircle
          size={32}
          weight="duotone"
          className="mx-auto mb-3 text-rose-500"
          aria-hidden="true"
        />
        <h2 className="m-0 text-base font-bold text-(--text)">
          {loadError === "forbidden"
            ? "You don't have access to orders."
            : "Orders could not be loaded."}
        </h2>
        {loadError === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) hover:opacity-90"
          >
            <ArrowCounterClockwise size={15} aria-hidden="true" />
            Try again
          </button>
        )}
      </ElevatedCard>
    );
  }

  if (!isLoading && orders.length === 0) {
    return (
      <ElevatedCard as="div" role="status" className="p-8 text-center sm:p-12">
        <FunnelSimple
          size={32}
          weight="duotone"
          className="mx-auto mb-3 text-(--muted)"
          aria-hidden="true"
        />
        <h2 className="m-0 text-base font-bold text-(--text)">
          Nothing matches these filters
        </h2>
        <p className="m-0 mt-1 text-sm text-(--muted)">
          Try a longer date range or fewer filters.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-(--border) px-4 text-sm font-semibold text-(--text) hover:bg-(--hover)"
        >
          <ArrowCounterClockwise size={15} aria-hidden="true" />
          Reset filters
        </button>
      </ElevatedCard>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, first + orders.length - 1);
  const rowProps = (order: AdminOrder) => ({
    order,
    courses: courseLookup,
    selected: order.id === selectedOrderId,
    freeOnly,
    onOpen: onSelectOrder,
  });

  return (
    <ElevatedCard
      as="section"
      aria-label="Orders"
      className="@container overflow-hidden p-0"
    >
      <div
        aria-busy={isLoading || isFetching || undefined}
        className={
          isFetching && !isLoading ? "opacity-70 transition-opacity" : ""
        }
      >
        {isLoading ? (
          <div className="space-y-px" aria-label="Loading orders">
            {Array.from({ length: 6 }, (_, row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-t border-(--border) px-4 py-3.5 first:border-t-0"
              >
                <div className="size-9 animate-pulse rounded-full bg-(--border)" />
                <div className="h-4 flex-1 animate-pulse rounded bg-(--border)" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <table className="hidden w-full table-fixed border-collapse @3xl:table">
              <colgroup>
                <col className="w-[26%]" />
                <col />
                {!freeOnly && <col className="w-[8.5rem]" />}
                <col className="w-[7rem]" />
                <col className="w-[10rem]" />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={`${headCell} pl-4`}>
                    Learner
                  </th>
                  <th scope="col" className={headCell}>
                    Course
                  </th>
                  {!freeOnly && (
                    <th scope="col" className={headCell}>
                      Amount
                    </th>
                  )}
                  {!freeOnly && (
                    <th
                      scope="col"
                      className={`${headCell} hidden @5xl:table-cell`}
                    >
                      Method
                    </th>
                  )}
                  <th scope="col" className={headCell}>
                    {freeOnly ? "Enrolled" : "Date"}
                  </th>
                  <th scope="col" className={headCell}>
                    Status
                  </th>
                  <th scope="col" className="w-10">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <OrderTableRow key={order.id} {...rowProps(order)} />
                ))}
              </tbody>
            </table>
            <ul className="m-0 list-none divide-y divide-(--border) p-0 @3xl:hidden">
              {orders.map((order) => (
                <OrderListCard key={order.id} {...rowProps(order)} />
              ))}
            </ul>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--border) px-4 py-3">
        <p
          className="m-0 text-sm text-(--muted) tabular-nums"
          aria-live="polite"
        >
          {isLoading
            ? "Loading…"
            : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)} ${total === 1 ? "order" : "orders"}`}
        </p>
        <a
          href={exportUrl}
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-(--accent) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <DownloadSimple size={15} weight="bold" aria-hidden="true" />
          Export CSV
        </a>
        <nav aria-label="Pages" className="ml-auto flex items-center gap-2">
          <span className="text-sm text-(--muted) tabular-nums">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            className="grid size-9 place-items-center rounded-lg border border-(--border) text-(--text) hover:bg-(--hover) disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount || isLoading}
            onClick={() => onPageChange(page + 1)}
            className="grid size-9 place-items-center rounded-lg border border-(--border) text-(--text) hover:bg-(--hover) disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <CaretRight size={14} weight="bold" aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </ElevatedCard>
  );
});
