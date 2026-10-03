import { useEffect, useRef, useState } from "react";
import type { Coupon } from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { ToggleLeftIcon as ToggleLeft } from "@phosphor-icons/react/ToggleLeft";
import { ToggleRightIcon as ToggleRight } from "@phosphor-icons/react/ToggleRight";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { CouponsTableLoadingRows } from "./CouponsTableLoadingRows";
import {
  couponCampaignTitle,
  couponStatusClass,
  couponStatusLabel,
  formatCouponDate,
  formatCouponDiscount,
  getCouponStatus,
} from "./couponHelpers";

export interface CouponsTableProps {
  coupons: Coupon[];
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  onEditCoupon: (coupon: Coupon) => void;
  onToggleStatus: (coupon: Coupon) => void;
  onCreateNew: () => void;
  setNotice?: (message: string) => void;
}

export function CouponsTable({
  coupons,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onEditCoupon,
  onToggleStatus,
  onCreateNew,
  setNotice,
}: CouponsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );

    const current = observerTarget.current;
    if (current) {
      observer.observe(current);
    }

    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCopyCode = async (coupon: Coupon) => {
    await navigator.clipboard.writeText(coupon.code);
    setCopiedId(coupon.id);
    setNotice?.(`Copied ${coupon.code}.`);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return <CouponsTableLoadingRows />;
  }

  if (coupons.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="grid place-items-center p-6 text-center sm:p-12">
          {isFetchingNextPage ? (
            <div
              className="grid min-h-40 place-items-center"
              role="status"
              aria-label="Searching coupons"
            >
              <LoadingSpinnerIcon size={22} />
            </div>
          ) : (
            <>
              <span className="flex size-10 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent) sm:size-11">
                <Tag size={22} weight="bold" />
              </span>
              <h3 className="mt-2.5 text-sm font-semibold sm:mt-3">No coupons found</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
                {hasNextPage
                  ? "More matching coupons may be available."
                  : "Create a coupon to start offering discounts, or adjust the filters to see more of your library."}
              </p>
            </>
          )}
          {!hasNextPage && !isFetchingNextPage ? (
            <div className="mt-3.5 sm:mt-4">
              <Button onClick={onCreateNew}>Create coupon</Button>
            </div>
          ) : null}
        </div>

        {hasNextPage ? (
          <div
            ref={observerTarget}
            className="flex flex-col items-center justify-center border-t border-(--border) p-4 sm:p-6"
          >
            {!isFetchingNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage?.()}
                className="cursor-pointer rounded-xl border border-(--border) bg-(--card-surface) px-4 py-2 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                Load more coupons
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="divide-y divide-(--border) overflow-hidden rounded-b-[inherit]">
      {coupons.map((coupon) => {
        const status = getCouponStatus(coupon);
        const redemptionCount = coupon.redemptionCount ?? 0;
        const usageLimit = coupon.globalUsageLimit;
        const hasUsageLimit = usageLimit != null && usageLimit > 0;
        const usagePercent = hasUsageLimit
          ? Math.min(100, Math.round((redemptionCount / usageLimit) * 100))
          : 0;

        return (
          <div
            key={coupon.id}
            className="flex flex-col gap-3 px-3 py-2.5 transition-colors hover:bg-(--hover) sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4"
          >
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent) sm:size-10">
                <Tag size={18} weight="bold" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold sm:text-base">{coupon.code}</p>
                <p className="mt-0.5 truncate text-[0.72rem] text-(--muted) sm:mt-1 sm:text-xs">
                  {couponCampaignTitle(coupon)} · {formatCouponDiscount(coupon)} ·{" "}
                  {formatCouponDate(coupon.startsAt, true)} –{" "}
                  {formatCouponDate(coupon.expiresAt, true)}
                </p>
                {hasUsageLimit ? (
                  <div className="mt-2 flex items-center gap-2.5">
                    <div
                      role="progressbar"
                      aria-valuenow={redemptionCount}
                      aria-valuemin={0}
                      aria-valuemax={usageLimit}
                      aria-label={`Coupon limit usage: ${redemptionCount} of ${usageLimit} uses (${usagePercent}%)`}
                      className="relative h-1.5 w-28 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] sm:w-36"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          usagePercent >= 100 ? "bg-rose-500" : "bg-(--accent)"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    <span className="text-[0.7rem] font-medium text-(--muted) sm:text-[0.75rem]">
                      {redemptionCount.toLocaleString("en-IN")} /{" "}
                      {usageLimit.toLocaleString("en-IN")} used ({usagePercent}
                      %)
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:justify-end sm:gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold tracking-[0.08em] uppercase sm:py-1 sm:text-[0.68rem] ${couponStatusClass(status)}`}
              >
                {couponStatusLabel(status)}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(coupon)}
                title="Copy code"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] text-(--text) shadow-[var(--card-compact-shadow)] hover:bg-(--hover) sm:size-9"
              >
                {copiedId === coupon.id ? (
                  <Check size={15} weight="bold" className="text-emerald-500" />
                ) : (
                  <Copy size={15} weight="bold" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onToggleStatus(coupon)}
                title={coupon.isActive ? "Deactivate" : "Activate"}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] text-(--text) shadow-[var(--card-compact-shadow)] hover:bg-(--hover) sm:size-9"
              >
                {coupon.isActive ? (
                  <ToggleRight size={16} weight="bold" className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={16} weight="bold" className="text-(--muted)" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onEditCoupon(coupon)}
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] px-2.5 text-xs font-semibold text-(--text) shadow-[var(--card-compact-shadow)] transition-all hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-(--hover) sm:h-9 sm:rounded-[9px] sm:px-3.5"
              >
                <span>Open</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        );
      })}

      {hasNextPage ? (
        <div
          ref={observerTarget}
          className="flex flex-col items-center justify-center border-t border-(--border) p-4 sm:p-6"
        >
          {isFetchingNextPage ? (
            <div
              className="flex justify-center py-2"
              role="status"
              aria-label="Loading more coupons"
            >
              <LoadingSpinnerIcon size={18} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fetchNextPage?.()}
              className="cursor-pointer rounded-xl border border-(--border) bg-(--card-surface) px-4 py-2 text-xs font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              Load more coupons
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
