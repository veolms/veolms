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

export function useCouponsFilter() {
  const {
    data: serverCoupons = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCouponsList();

  const coupons = serverCoupons;

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

  const counts = useMemo(() => {
    let active = 0;
    let scheduled = 0;
    let expired = 0;
    let draft = 0;

    for (const coupon of coupons) {
      const status = getCouponStatus(coupon, now);
      if (status === "active") active += 1;
      else if (status === "scheduled") scheduled += 1;
      else if (status === "expired") expired += 1;
      else draft += 1;
    }

    return {
      all: coupons.length,
      active,
      scheduled,
      expired,
      draft,
    };
  }, [coupons, now]);

  const summaryMetrics = useMemo(() => {
    let totalRedemptions = 0;
    let totalDiscountGiven = 0;

    for (const coupon of coupons) {
      totalRedemptions += coupon.redemptionCount ?? 0;
      totalDiscountGiven += coupon.totalDiscountGiven ?? 0;
    }

    return {
      totalCoupons: coupons.length,
      totalRedemptions,
      totalDiscountGiven,
      activeCoupons: counts.active,
      expiredCoupons: counts.expired,
      draftCoupons: counts.draft,
      scheduledCoupons: counts.scheduled,
    };
  }, [coupons, counts]);

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
  };
}
