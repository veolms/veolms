import type { Coupon } from "@veolms/contracts";

export type CouponStatus = "active" | "scheduled" | "expired" | "draft";
export type CouponTabFilter = "all" | CouponStatus;
export type CouponSortOption =
  | "newest"
  | "oldest"
  | "discount_high"
  | "expiring_soon";

export const surfaceClass =
  "rounded-[14px] sm:rounded-[22px] overflow-hidden border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,var(--surface-depth-shadow))";

export const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

export function getCouponStatus(
  coupon: Coupon,
  referenceTime: number = Date.now(),
): CouponStatus {
  if (!coupon.isActive) {
    return "draft";
  }
  const now = referenceTime;
  const startsAt = new Date(coupon.startsAt).getTime();
  const expiresAt = new Date(coupon.expiresAt).getTime();

  if (startsAt > now) {
    return "scheduled";
  }
  if (expiresAt < now) {
    return "expired";
  }
  return "active";
}

export function couponStatusLabel(status: CouponStatus) {
  if (status === "active") return "Active";
  if (status === "scheduled") return "Scheduled";
  if (status === "expired") return "Expired";
  return "Inactive";
}

export function couponStatusClass(status: CouponStatus) {
  if (status === "active") {
    return "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20";
  }
  if (status === "scheduled") {
    return "bg-(--accent)/12 text-(--accent) border border-(--accent)/20";
  }
  if (status === "expired") {
    return "bg-rose-500/12 text-rose-500 border border-rose-500/20";
  }
  return "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]";
}

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number) {
  return paise / 100;
}

export function formatRupees(amount: number) {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })}`;
}

export function formatPaiseAsRupees(paise: number) {
  return formatRupees(paiseToRupees(paise));
}

export function formatCouponDiscount(coupon: {
  discountType: Coupon["discountType"];
  discountValue: number;
}) {
  if (coupon.discountType === "percentage") {
    return `${coupon.discountValue}% off`;
  }
  return `${formatRupees(coupon.discountValue)} off`;
}

export function formatCouponDate(value: string | Date, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function toCouponMoneyPayload(input: {
  discountType: Coupon["discountType"];
  discountValue: number;
  minOrderAmountRupees?: number;
  maxDiscountAmountRupees?: number | null;
}) {
  const minOrderAmount = Math.max(0, input.minOrderAmountRupees ?? 0);
  const maxDiscountAmount =
    input.maxDiscountAmountRupees != null && input.maxDiscountAmountRupees > 0
      ? input.maxDiscountAmountRupees
      : undefined;

  return {
    discountValue: Math.round(input.discountValue),
    minOrderAmount,
    maxDiscountAmount,
  };
}

export function couponMoneyToForm(coupon: Coupon) {
  return {
    discountValue: coupon.discountValue,
    minOrderAmountRupees: coupon.minOrderAmount ?? 0,
    maxDiscountAmountRupees: coupon.maxDiscountAmount ?? "",
  };
}

export function packCouponCopy(title: string, description: string): string | undefined {
  const nextTitle = title.trim();
  const nextDescription = description.trim();
  if (nextTitle && nextDescription) return `${nextTitle}. ${nextDescription}`;
  return nextTitle || nextDescription || undefined;
}

export function unpackCouponCopy(raw?: string | null): { title: string; description: string } {
  if (!raw?.trim()) return { title: "", description: "" };
  const splitAt = raw.indexOf(". ");
  if (splitAt === -1) return { title: raw, description: "" };
  return {
    title: raw.slice(0, splitAt),
    description: raw.slice(splitAt + 2),
  };
}

export function couponCampaignTitle(coupon: Coupon) {
  const description = coupon.description?.trim();
  if (!description) {
    return `${coupon.code} offer`;
  }
  return description.split(".")[0] || description;
}

export function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toLocalDateTimeValue(
  date: Date = new Date(),
  time: "start" | "end" | "now" = "now",
) {
  let hour = date.getHours();
  let minute = date.getMinutes();
  if (time === "start") {
    hour = 0;
    minute = 0;
  } else if (time === "end") {
    hour = 23;
    minute = 59;
  }
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}T${padTimePart(hour)}:${padTimePart(minute)}`;
}

export function isoToLocalDateTimeValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}T${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

export function parseLocalDateTime(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const [datePart, timePart] = str.split("T");
  if (!datePart) return null;
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let hour = 0;
  let minute = 0;
  if (timePart) {
    const [hourStr, minStr] = timePart.split(":");
    const h = Number(hourStr);
    const m = Number(minStr);
    if (!Number.isNaN(h)) hour = h;
    if (!Number.isNaN(m)) minute = m;
  }

  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}
