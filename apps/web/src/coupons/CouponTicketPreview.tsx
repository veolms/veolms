import { GiftIcon as Gift } from "@phosphor-icons/react/Gift";
import { formatRupees } from "./couponHelpers";

export interface CouponTicketPreviewProps {
  code: string;
  title?: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiresAt?: string | Date;
  restrictedCoursesLabel?: string;
  compact?: boolean;
}

export function CouponTicketPreview({
  code,
  title,
  discountType,
  discountValue,
  expiresAt,
  restrictedCoursesLabel,
  compact = false,
}: CouponTicketPreviewProps) {
  const displayCode = code.trim().toUpperCase() || "YOURCODE";
  const displayTitle = title?.trim() || "Special Offer";
  const discountLabel =
    discountType === "percentage"
      ? `${discountValue || 0}% OFF`
      : `${formatRupees(discountValue || 0)} OFF`;

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const formattedExpiry =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? expiryDate.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Limited time";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[22px] px-5 py-6 text-center text-(--on-accent) bg-(--accent) shadow-[0_18px_40px_color-mix(in_srgb,var(--accent-shadow,var(--accent))_42%,transparent)] ${
        compact ? "px-4 py-5" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-(--on-accent)/15">
          <Gift size={18} weight="fill" />
        </span>
        <h4 className="m-0 truncate text-sm font-semibold tracking-tight">
          {displayTitle}
        </h4>
      </div>

      <div className="mx-auto mb-5 w-full rounded-xl bg-(--on-accent) px-4 py-2.5 font-mono text-lg font-extrabold tracking-[0.14em] text-(--accent)">
        {displayCode}
      </div>

      <div className="relative my-4">
        <span className="absolute -left-7 top-1/2 size-5 -translate-y-1/2 rounded-full bg-(--card-surface,var(--surface))" />
        <span className="block border-t border-dashed border-(--on-accent)/25" />
        <span className="absolute -right-7 top-1/2 size-5 -translate-y-1/2 rounded-full bg-(--card-surface,var(--surface))" />
      </div>

      <p className="m-0 text-[2rem] font-extrabold leading-none tracking-tight">
        {discountLabel}
      </p>
      <p className="m-0 mt-1.5 text-sm text-(--on-accent)/75">
        {restrictedCoursesLabel || "on all courses"}
      </p>
      <div className="mt-4 inline-flex rounded-full bg-(--on-accent)/15 px-3.5 py-1 text-[11px] font-semibold text-(--on-accent)">
        Valid till {formattedExpiry}
      </div>
    </div>
  );
}
