import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { formatRupees } from "./couponHelpers";
import type { CouponTabFilter } from "./couponHelpers";

export interface CouponSummaryMetrics {
  totalCoupons: number;
  totalRedemptions: number;
  totalDiscountGiven: number;
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

function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail?: string;
  tone?: "default" | "success" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group rounded-[12px] sm:rounded-[16px] border bg-(--card-surface-raised,var(--surface)) p-2.5 sm:p-5 text-left transition-all duration-200 hover:shadow-(--card-hover-shadow) ${
        active
          ? "border-(--accent) ring-2 ring-(--accent)/20"
          : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
      } ${clickable ? "cursor-pointer" : "cursor-default"}`}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <p className="truncate text-[0.7rem] sm:text-xs font-semibold tracking-wide text-(--muted) group-hover:text-(--text) transition-colors">
          {label}
        </p>
        <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent) group-hover:scale-105 transition-transform">
          {icon}
        </span>
      </div>
      <p
        className={`mt-1.5 sm:mt-2.5 text-xl sm:text-[1.75rem] font-bold tracking-tight ${
          tone === "success"
            ? "text-emerald-500"
            : tone === "danger"
              ? "text-rose-500"
              : "text-(--text)"
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 sm:mt-1 truncate text-[0.68rem] sm:text-xs text-(--muted)">
          {detail}
        </p>
      ) : null}
    </button>
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

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4">
      <StatCard
        icon={<Tag size={18} weight="bold" />}
        label="Total coupons"
        value={metrics.totalCoupons.toLocaleString("en-IN")}
        detail={`${metrics.draftCoupons} inactive · ${metrics.scheduledCoupons ?? 0} scheduled`}
        active={activeTab === "all"}
        onClick={() => onFilterTab?.("all")}
      />
      <StatCard
        icon={<CheckCircle size={18} weight="bold" />}
        label="Active now"
        value={metrics.activeCoupons.toLocaleString("en-IN")}
        detail={activeShare}
        tone="success"
        active={activeTab === "active"}
        onClick={() => onFilterTab?.("active")}
      />
      <StatCard
        icon={<Users size={18} weight="bold" />}
        label="Redemptions"
        value={metrics.totalRedemptions.toLocaleString("en-IN")}
        detail="Completed checkouts"
      />
      <StatCard
        icon={<CurrencyInr size={18} weight="bold" />}
        label="Discount given"
        value={formatRupees(metrics.totalDiscountGiven)}
        detail="Across redeemed orders"
      />
    </div>
  );
}
