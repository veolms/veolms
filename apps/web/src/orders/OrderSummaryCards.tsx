import { memo } from "react";
import type { OrderStatsResponse } from "@veolms/contracts";
import { ElevatedCard } from "../components/ElevatedCard";
import { formatCurrency, formatNumber } from "./orderHelpers";

export interface OrderSummaryCardsProps {
  stats: OrderStatsResponse | undefined;
  isLoading?: boolean;
  /** Only free enrollments are listed: their own figures. */
  freeOnly: boolean;
}

interface Tile {
  id: string;
  title: string;
  value: string;
  note: string;
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function paidTiles(stats: OrderStatsResponse): Tile[] {
  const money = (amount: number) => formatCurrency(amount, stats.currency);
  return [
    {
      id: "net-revenue",
      title: "Net revenue",
      value: money(stats.netRevenue),
      note: plural(stats.totalOrders, "successful order", "successful orders"),
    },
    {
      id: "success-rate",
      title: "Success rate",
      value: percent(stats.successfulAttempts, stats.attempts),
      note: `${formatNumber(stats.successfulAttempts)} of ${plural(stats.attempts, "attempt", "attempts")}`,
    },
    {
      id: "unique-buyers",
      title: "Unique buyers",
      value: formatNumber(stats.uniqueBuyers),
      note: plural(stats.repeatBuyers, "repeat purchase", "repeat purchases"),
    },
    {
      id: "avg-order",
      title: "Avg. order value",
      value:
        stats.totalOrders > 0
          ? money(Math.round(stats.netRevenue / stats.totalOrders))
          : "—",
      note: `${money(stats.discountTotal)} given in coupons`,
    },
    {
      id: "refunded",
      title: "Refunded",
      value: money(stats.refundedAmount),
      note: plural(stats.refundedOrders, "order", "orders"),
    },
  ];
}

function freeTiles(stats: OrderStatsResponse): Tile[] {
  const free = stats.free;
  const enrollments = free?.enrollments ?? 0;
  return [
    {
      id: "free-enrollments",
      title: "Free enrollments",
      value: formatNumber(enrollments),
      note: "in this period",
    },
    {
      id: "unique-learners",
      title: "Unique learners",
      value: formatNumber(free?.uniqueLearners ?? 0),
      note: "enrolled at least once",
    },
    {
      id: "most-enrolled",
      title: "Most enrolled",
      value: free?.mostEnrolled?.title ?? "—",
      note: free?.mostEnrolled
        ? plural(free.mostEnrolled.enrollments, "enrollment", "enrollments")
        : "no enrollments yet",
    },
    {
      id: "also-paid",
      title: "Also bought a paid course",
      value: formatNumber(free?.alsoBoughtPaid ?? 0),
      note: `${percent(free?.alsoBoughtPaid ?? 0, free?.uniqueLearners ?? 0)} of learners`,
    },
  ];
}

const SKELETON_TILES = (count: number): Tile[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `loading-${index}`,
    title: "",
    value: "",
    note: "",
  }));

/**
 * The figures for the orders the filters select: five for paid orders, four
 * for a view of free enrollments. Sized by the room the list has (the order
 * panel narrows it), not by the window, and wrapped rather than scrolled.
 */
export const OrderSummaryCards = memo(function OrderSummaryCards({
  stats,
  isLoading = false,
  freeOnly,
}: OrderSummaryCardsProps) {
  const tiles =
    !stats || isLoading
      ? SKELETON_TILES(freeOnly ? 4 : 5)
      : freeOnly
        ? freeTiles(stats)
        : paidTiles(stats);

  return (
    <div className="@container">
      <section
        aria-label="Order summary"
        aria-busy={isLoading || undefined}
        // One row as soon as there is room for it (the list beside an open
        // order included): tiles narrow and their text steps down instead.
        className={`grid grid-cols-2 gap-2.5 @2xl:gap-3 ${freeOnly ? "@xl:grid-cols-4" : "@2xl:grid-cols-5"}`}
      >
        {tiles.map((tile, index) => (
          <ElevatedCard
            as="article"
            key={tile.id}
            className={`min-w-0 px-4 py-3.5 @2xl:px-3.5 @2xl:py-3 @5xl:px-5 @5xl:py-4 ${
              // An odd last tile on two columns spans the row.
              !freeOnly && index === tiles.length - 1
                ? "col-span-2 @2xl:col-span-1"
                : ""
            }`}
          >
            {tile.title ? (
              <>
                <p className="m-0 truncate text-xs font-semibold text-(--muted)">
                  {tile.title}
                </p>
                <p
                  className="m-0 mt-1.5 truncate text-xl font-bold tracking-tight text-(--text) tabular-nums @2xl:text-lg @5xl:text-2xl"
                  title={tile.value}
                >
                  {tile.value}
                </p>
                <p className="m-0 mt-1 truncate text-xs text-(--muted)">
                  {tile.note}
                </p>
              </>
            ) : (
              <div aria-hidden="true">
                <div className="h-3 w-20 animate-pulse rounded bg-(--border)" />
                <div className="mt-2.5 h-6 w-24 animate-pulse rounded bg-(--border)" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-(--border)" />
              </div>
            )}
          </ElevatedCard>
        ))}
      </section>
    </div>
  );
});
