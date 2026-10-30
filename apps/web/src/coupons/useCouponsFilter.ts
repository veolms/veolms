import { useEffect, useMemo, useState } from "react";
import { useCouponsList } from "../services/coupons";
import {
  getCouponStatus,
  type CouponSortOption,
  type CouponTabFilter,
} from "./couponHelpers";
import { fuzzyMatches } from "../lib/fuzzySearch";

export type {
  CouponStatus,
  CouponTabFilter,
  CouponSortOption,
} from "./couponHelpers";
export { getCouponStatus } from "./couponHelpers";

/** How often coupon statuses are re-read against the clock. */
const STATUS_CLOCK_INTERVAL_MS = 60_000;

export function useCouponsFilter(options?: {
  courseId?: string | null;
  enabled?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCouponsList({ courseId: options?.courseId, limit: 10, enabled });

  const coupons = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // "Now" decides each coupon's status (scheduled, active, expired), and
  // those turn over on the minute. Ticking every five seconds re-filtered
  // and re-sorted the whole list, and redrew the table, twelve times as
  // often as anything could change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, STATUS_CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<CouponTabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<CouponSortOption>("newest");
  const [discountTypeFilter, setDiscountTypeFilter] = useState<
    "all" | "percentage" | "fixed"
  >("all");

  // The library-wide summary arrives with the first page only.
  const serverSummary = data?.pages[0]?.summary;

  const counts = useMemo(
    () => ({
      all: serverSummary?.totalCount ?? 0,
      active: serverSummary?.activeCount ?? 0,
      scheduled: serverSummary?.scheduledCount ?? 0,
      expired: serverSummary?.expiredCount ?? 0,
      draft: serverSummary?.inactiveCount ?? 0,
    }),
    [serverSummary],
  );

  const summaryMetrics = useMemo(
    () => ({
      totalCoupons: serverSummary?.totalCount ?? 0,
      totalRedemptions: serverSummary?.totalRedemptions ?? 0,
      totalDiscountGiven: serverSummary?.totalDiscountGiven ?? 0,
      activeCoupons: serverSummary?.activeCount ?? 0,
      expiredCoupons: serverSummary?.expiredCount ?? 0,
      draftCoupons: serverSummary?.inactiveCount ?? 0,
      scheduledCoupons: serverSummary?.scheduledCount ?? 0,
    }),
    [serverSummary],
  );

  const filteredCoupons = useMemo(() => {
    return coupons
      .filter((coupon) => {
        const status = getCouponStatus(coupon, now);

        if (activeTab !== "all" && status !== activeTab) {
          return false;
        }

        if (
          discountTypeFilter !== "all" &&
          coupon.discountType !== discountTypeFilter
        ) {
          return false;
        }

        if (searchQuery.trim()) {
          if (!fuzzyMatches(searchQuery, coupon.code, coupon.description)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        if (sortBy === "oldest") {
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
        if (sortBy === "discount_high") {
          return b.discountValue - a.discountValue;
        }
        return (
          new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        );
      });
  }, [coupons, now, activeTab, discountTypeFilter, searchQuery, sortBy]);

  // Nothing here asks for the next page on its own. When a search or filter
  // matched none of the coupons loaded so far, an effect used to fetch the
  // next page, and the next, until something matched or the library ran
  // out: a search with no match downloaded every coupon there is, and each
  // of those pages then refetched on the list's timer. The table offers
  // "Load more" instead.

  return {
    coupons: filteredCoupons,
    rawCoupons: coupons,
    counts,
    summaryMetrics,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    discountTypeFilter,
    setDiscountTypeFilter,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
