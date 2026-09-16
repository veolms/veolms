import { useState } from "react";
import type { Coupon } from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { ToggleLeftIcon as ToggleLeft } from "@phosphor-icons/react/ToggleLeft";
import { ToggleRightIcon as ToggleRight } from "@phosphor-icons/react/ToggleRight";
import { Button } from "../components/Button";
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
  canDelete?: boolean;
  onEditCoupon: (coupon: Coupon) => void;
  onDeleteCoupon: (coupon: Coupon) => void;
  onToggleStatus: (coupon: Coupon) => void;
  onCreateNew: () => void;
  setNotice?: (message: string) => void;
}

function LoadingRows() {
  return (
    <div className="grid gap-2.5 sm:gap-3 px-3 py-3 sm:px-7 sm:py-5">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </div>
  );
}

export function CouponsTable({
  coupons,
  isLoading,
  canDelete = true,
  onEditCoupon,
  onDeleteCoupon,
  onToggleStatus,
  onCreateNew,
  setNotice,
}: CouponsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = async (coupon: Coupon) => {
    await navigator.clipboard.writeText(coupon.code);
    setCopiedId(coupon.id);
    setNotice?.(`Copied ${coupon.code}.`);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return <LoadingRows />;
  }

  if (coupons.length === 0) {
    return (
      <div className="grid place-items-center p-6 sm:p-12 text-center">
        <span className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <Tag size={22} weight="bold" />
        </span>
        <h3 className="mt-2.5 sm:mt-3 text-sm font-semibold">No coupons found</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
          Create a coupon to start offering discounts, or adjust the filters to
          see more of your library.
        </p>
        <div className="mt-3.5 sm:mt-4">
          <Button onClick={onCreateNew}>Create coupon</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-(--border)">
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
            className="flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4 hover:bg-(--hover)"
          >
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                <Tag size={18} weight="bold" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm sm:text-base">
                  {coupon.code}
                </p>
                <p className="mt-0.5 sm:mt-1 truncate text-[0.72rem] sm:text-xs text-(--muted)">
                  {couponCampaignTitle(coupon)} · {formatCouponDiscount(coupon)} · {formatCouponDate(coupon.startsAt, true)} – {formatCouponDate(coupon.expiresAt, true)}
                </p>
                {hasUsageLimit ? (
                  <div className="mt-2 flex items-center gap-2.5">
                    <div
                      role="progressbar"
                      aria-valuenow={redemptionCount}
                      aria-valuemin={0}
                      aria-valuemax={usageLimit}
                      aria-label={`Coupon limit usage: ${redemptionCount} of ${usageLimit} uses (${usagePercent}%)`}
                      className="relative h-1.5 w-28 sm:w-36 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          usagePercent >= 100 ? "bg-rose-500" : "bg-(--accent)"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    <span className="text-[0.7rem] sm:text-[0.75rem] font-medium text-(--muted)">
                      {redemptionCount.toLocaleString("en-IN")} / {usageLimit.toLocaleString("en-IN")} used ({usagePercent}%)
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3 sm:shrink-0">
              <span
                className={`rounded-full px-2.5 py-0.5 sm:py-1 text-[0.65rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.08em] ${couponStatusClass(status)}`}
              >
                {couponStatusLabel(status)}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(coupon)}
                title="Copy code"
                className="inline-flex size-8 sm:size-9 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] text-(--text) shadow-[var(--card-compact-shadow)] hover:bg-(--hover) cursor-pointer"
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
                className="inline-flex size-8 sm:size-9 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] text-(--text) shadow-[var(--card-compact-shadow)] hover:bg-(--hover) cursor-pointer"
              >
                {coupon.isActive ? (
                  <ToggleRight size={16} weight="bold" className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={16} weight="bold" className="text-(--muted)" />
                )}
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => onDeleteCoupon(coupon)}
                  title="Delete coupon"
                  className="inline-flex size-8 sm:size-9 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] text-rose-500 shadow-[var(--card-compact-shadow)] hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash size={15} weight="bold" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onEditCoupon(coupon)}
                className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-[8px] sm:rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] px-2.5 sm:px-3.5 text-xs font-semibold text-(--text) shadow-[var(--card-compact-shadow)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-(--hover) transition-all cursor-pointer"
              >
                <span>Open</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
