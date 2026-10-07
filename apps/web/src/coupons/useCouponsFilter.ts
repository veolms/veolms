import { useEffect, useMemo, useState } from "react";
import { useCouponsList } from "../services/coupons";
import {
  getCouponStatus,
  type CouponSortOption,
  type CouponTabFilter,
} from "./couponHelpers";

export type {
  CouponStatus,
  CouponTabFilter,
  CouponSortOption,
} from "./couponHelpers";
export { getCouponStatus } from "./couponHelpers";

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

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 5000);
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
          const query = searchQuery.toLowerCase().trim();
          const matchCode = coupon.code.toLowerCase().includes(query);
          const matchDesc =
            coupon.description?.toLowerCase().includes(query) ?? false;
          if (!matchCode && !matchDesc) {
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

  useEffect(() => {
    if (
      filteredCoupons.length === 0 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isLoading &&
      !isError
    ) {
      void fetchNextPage();
    }
  }, [
    filteredCoupons.length,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    fetchNextPage,
  ]);

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
