import type { OrderStatus } from "@veolms/contracts";

export const surfaceClass =
  "rounded-[14px] sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,var(--surface-depth-shadow))";

export const insetClass =
  "rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) shadow-(--card-shadow,var(--surface-depth-shadow))";

export const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

/**
 * Formats an amount in paise (smallest currency unit) to standard currency string (e.g. ₹1,24,500 or ₹2,999).
 */
export function formatCurrency(
  amountInSmallestUnit: number,
  currency: string = "INR",
): string {
  const value = Math.round(amountInSmallestUnit / 100);
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats raw number with thousand separators (e.g. 512, 1,234).
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Returns formatted date and time for table display.
 */
export function formatOrderDate(dateValue: string | Date | null | undefined): {
  dateStr: string;
  timeStr: string;
} {
  if (!dateValue) return { dateStr: "—", timeStr: "" };
  const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(d.getTime())) return { dateStr: "—", timeStr: "" };

  return {
    dateStr: dateFormatter.format(d),
    timeStr: timeFormatter.format(d),
  };
}

/**
 * Formats detailed placement timestamp (e.g. Placed on Jun 4, 2025 at 10:24 AM).
 */
export function formatFullPlacedDate(
  dateValue: string | Date | null | undefined,
): string {
  if (!dateValue) return "—";
  const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(d.getTime())) return "—";

  return `Placed on ${dateFormatter.format(d)} at ${timeFormatter.format(d)}`;
}

export interface StatusStyle {
  label: string;
  dotColor: string;
  pillClass: string;
}

export function getOrderStatusStyle(status: OrderStatus | string): StatusStyle {
  switch (status) {
    case "paid":
      return {
        label: "Completed",
        dotColor: "bg-emerald-400",
        pillClass:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
      };
    case "payment_processing":
      return {
        label: "In Progress",
        dotColor: "bg-sky-400",
        pillClass:
          "border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]",
      };
    case "pending":
      return {
        label: "Processing",
        dotColor: "bg-amber-400",
        pillClass:
          "border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
      };
    case "refunded":
    case "partially_refunded":
      return {
        label: "Refunded",
        dotColor: "bg-rose-400",
        pillClass:
          "border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
      };
    case "payment_failed":
      return {
        label: "Failed",
        dotColor: "bg-rose-400",
        pillClass: "border-rose-500/30 bg-rose-500/10 text-rose-400",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        dotColor: "bg-zinc-400",
        pillClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
      };
    case "expired":
      return {
        label: "Expired",
        dotColor: "bg-zinc-400",
        pillClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
      };
    default:
      return {
        label: String(status),
        dotColor: "bg-zinc-400",
        pillClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
      };
  }
}

export interface BrandBadge {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor?: string;
}

/**
 * Returns distinct visual technology badge properties based on course title or slug.
 */
export function getCourseBrandBadge(title: string = ""): BrandBadge {
  const lower = title.toLowerCase();

  if (lower.includes("typescript")) {
    return { label: "TS", bgColor: "#2563eb", textColor: "#ffffff" };
  }
  if (lower.includes("javascript")) {
    return { label: "JS", bgColor: "#eab308", textColor: "#000000" };
  }
  if (lower.includes("node") || lower.includes("backend")) {
    return { label: "node", bgColor: "#0d1b1e", textColor: "#4ade80", borderColor: "rgba(74, 222, 128, 0.2)" };
  }
  if (lower.includes("next")) {
    return { label: "N", bgColor: "#000000", textColor: "#ffffff", borderColor: "rgba(255, 255, 255, 0.25)" };
  }
  if (lower.includes("react")) {
    return { label: "⚛", bgColor: "#087ea4", textColor: "#ffffff" };
  }
  if (lower.includes("python")) {
    return { label: "🐍", bgColor: "#1e293b", textColor: "#ffd43b", borderColor: "rgba(255, 212, 59, 0.3)" };
  }
  if (lower.includes("data analysis") || lower.includes("analytics")) {
    return { label: "📊", bgColor: "#d97706", textColor: "#ffffff" };
  }
  if (lower.includes("ui") || lower.includes("ux") || lower.includes("design") || lower.includes("figma")) {
    return { label: "❖", bgColor: "#1e1e1e", textColor: "#f24e1e", borderColor: "rgba(242, 78, 30, 0.3)" };
  }
  if (lower.includes("sql") || lower.includes("postgres") || lower.includes("database")) {
    return { label: "PG", bgColor: "#0284c7", textColor: "#ffffff" };
  }

  // Fallback: 2-letter uppercase initials
  const initials = title
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return {
    label: initials || "CO",
    bgColor: "color-mix(in srgb, var(--accent) 80%, black)",
    textColor: "var(--on-accent, #ffffff)",
  };
}

export function getStudentInitials(name?: string | null, username?: string | null): string {
  const source = name || username || "S";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
