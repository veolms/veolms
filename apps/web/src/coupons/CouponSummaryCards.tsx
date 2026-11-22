import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import type { ReactNode } from "react";
import {
  analyticsCardClasses,
  KPI_TONE_CLASSES,
  type KpiTone,
} from "@veolms/analytics-ui";

import { formatPaiseAsRupees } from "./couponHelpers";
import type { CouponTabFilter } from "./couponHelpers";

export interface CouponSummaryMetrics {
  totalCoupons: number;
  totalRedemptions: number;
  /** Admins only: the API leaves it out for every other team member. */
  totalDiscountGiven?: number;
  activeCoupons: number;
  expiredCoupons: number;
  draftCoupons: number;
  scheduledCoupons?: number;
}

export interface CouponSummaryCardsProps {
  metrics: CouponSummaryMetrics;
  activeTab?: CouponTabFilter;
  onFilterTab?: (tab: CouponTabFilter) => void;
}

/**
 * One figure, drawn as the analytics page's KPI tiles are (the design
 * system's card surface, a tone-coloured icon chip, a neutral number), so
 * Coupons reads like the rest of the admin area. A tile that filters the
 * library below is a button, and the current filter is marked.
 */
function CouponStat({
  icon,
  label,
  value,
  detail,
  tone,
  active = false,
  wide = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: KpiTone;
  active?: boolean;
  /** Fills the row on phones (the last of an odd number of tiles). */
  wide?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex items-start justify-between gap-1.5 sm:gap-2">
        <span className="text-[0.7rem] font-semibold leading-snug tracking-wide text-(--muted) sm:text-xs">
          {label}
        </span>
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-lg sm:size-7 ${KPI_TONE_CLASSES[tone]}`}
        >
          {icon}
        </span>
      </span>
      <span className="mt-1.5 block text-xl font-bold tracking-tight text-(--text) tabular-nums sm:mt-2.5 sm:text-[1.75rem]">
        {value}
      </span>
      {detail ? (
        <span className="mt-0.5 block truncate text-[0.68rem] text-(--muted) sm:mt-1 sm:text-xs">
          {detail}
        </span>
      ) : null}
    </>
  );
  const className = `${analyticsCardClasses} flex flex-col p-2.5 text-left transition-all duration-200 sm:p-5 ${wide ? "col-span-2 lg:col-span-1" : ""} ${
    active
      ? "ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
      : ""
  }`;

  if (onClick) {
    return (
      <button
        type="button"
        data-fixed-radius
        onClick={onClick}
        aria-pressed={active}
        className={`${className} cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_3%,var(--card-surface,var(--surface)))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-fixed-radius className={className}>
      {content}
    </div>
  );
}

export function CouponSummaryCards({
  metrics,
  activeTab,
  onFilterTab,
}: CouponSummaryCardsProps) {
  const activeShare =
    metrics.totalCoupons > 0
      ? `${Math.round((metrics.activeCoupons / metrics.totalCoupons) * 100)}% of library`
      : "No coupons yet";
  const showsDiscount = metrics.totalDiscountGiven !== undefined;

  return (
    <div
      className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${
        showsDiscount ? "xl:grid-cols-4" : "lg:grid-cols-3"
      }`}
    >
      <CouponStat
        icon={<Tag size={16} weight="bold" />}
        label="Total coupons"
        value={metrics.totalCoupons.toLocaleString("en-IN")}
        detail={`${metrics.draftCoupons} inactive · ${metrics.scheduledCoupons ?? 0} scheduled`}
        tone="accent"
        active={activeTab === "all"}
        onClick={onFilterTab ? () => onFilterTab("all") : undefined}
      />
      <CouponStat
        icon={<CheckCircle size={16} weight="bold" />}
        label="Active now"
        value={metrics.activeCoupons.toLocaleString("en-IN")}
        detail={activeShare}
        tone="emerald"
        active={activeTab === "active"}
        onClick={onFilterTab ? () => onFilterTab("active") : undefined}
      />
      <CouponStat
        icon={<Users size={16} weight="bold" />}
        label="Redemptions"
        value={metrics.totalRedemptions.toLocaleString("en-IN")}
        detail="Completed checkouts"
        tone="blue"
        wide={!showsDiscount}
      />
      {showsDiscount ? (
        <CouponStat
          icon={<CurrencyInr size={16} weight="bold" />}
          label="Discount given"
          value={formatPaiseAsRupees(metrics.totalDiscountGiven ?? 0)}
          detail="Across redeemed orders"
          tone="amber"
        />
      ) : null}
    </div>
  );
}
