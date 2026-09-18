import { useEffect, useState } from "react";
import type {
  Coupon,
  CreateCouponRequest,
  UpdateCouponRequest,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { DiceFiveIcon as DiceFive } from "@phosphor-icons/react/DiceFive";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { XIcon as X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { QuizRichTextField } from "../quizzes/QuizRichTextField";
import { CouponTicketPreview } from "./CouponTicketPreview";
import {
  isoToLocalDateTimeValue,
  packCouponCopy,
  parseLocalDateTime,
  sanitizeNumberInput,
  toLocalDateTimeValue,
  unpackCouponCopy,
} from "./couponHelpers";

export interface CreateCouponDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  couponToEdit?: Coupon | null;
  onSubmitCreate: (payload: CreateCouponRequest) => Promise<void>;
  onSubmitUpdate: (id: string, payload: UpdateCouponRequest) => Promise<void>;
  isSubmitting?: boolean;
}

const discountTypeOptions: readonly [string, string][] = [
  ["percentage", "Percentage Discount (%)"],
  ["fixed", "Fixed Amount Discount (₹)"],
];

function generateRandomCode(): string {
  const prefixes = ["PROMO", "SPECIAL", "SUPER", "SAVE", "FLASH", "MEGA"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)] ?? "PROMO";
  const num = Math.floor(10 + Math.random() * 89);
  return `${prefix}${num}`;
}

export function CreateCouponDrawer({
  isOpen,
  onClose,
  couponToEdit,
  onSubmitCreate,
  onSubmitUpdate,
  isSubmitting = false,
}: CreateCouponDrawerProps) {
  const isEditMode = Boolean(couponToEdit);

  const defaultStart = toLocalDateTimeValue(new Date(), "start");
  const defaultEnd = toLocalDateTimeValue(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    "end",
  );

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState<number | "">(20);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<string>("");
  const [minOrderAmount, setMinOrderAmount] = useState<string>("");

  const [startsAt, setStartsAt] = useState(defaultStart);
  const [expiresAt, setExpiresAt] = useState(defaultEnd);

  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [usageLimit, setUsageLimit] = useState<number | "">(500);

  const [hasPerUserLimit, setHasPerUserLimit] = useState(true);
  const [perUserLimit, setPerUserLimit] = useState<number | "">(1);

  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDiscountTypeChange = (val: string) => {
    const nextType = val as "percentage" | "fixed";
    setDiscountType(nextType);
    if (nextType === "percentage" && typeof discountValue === "number" && discountValue > 100) {
      setDiscountValue(100);
    }
  };

  const handleDiscountValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(e.target.value, {
      max: discountType === "percentage" ? 100 : 100000,
    });
    setDiscountValue(sanitized);
  };

  const handleUsageLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(e.target.value, {
      max: 1000000,
    });
    setUsageLimit(sanitized);
  };

  const handlePerUserLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(e.target.value, {
      max: 100000,
    });
    setPerUserLimit(sanitized);
  };

  useEffect(() => {
    if (couponToEdit) {
      const { title: unpackedTitle, description: unpackedDesc } =
        unpackCouponCopy(couponToEdit.description);
      setCode(couponToEdit.code);
      setTitle(unpackedTitle || `${couponToEdit.code} Offer`);
      setDescription(unpackedDesc);
      setDiscountType(couponToEdit.discountType);
      setDiscountValue(couponToEdit.discountValue);
      setMaxDiscountAmount(
        couponToEdit.maxDiscountAmount ? String(couponToEdit.maxDiscountAmount) : "",
      );
      setMinOrderAmount(
        couponToEdit.minOrderAmount ? String(couponToEdit.minOrderAmount) : "",
      );

      setStartsAt(
        isoToLocalDateTimeValue(couponToEdit.startsAt) || defaultStart,
      );
      setExpiresAt(
        isoToLocalDateTimeValue(couponToEdit.expiresAt) || defaultEnd,
      );

      if (couponToEdit.globalUsageLimit) {
        setHasUsageLimit(true);
        setUsageLimit(couponToEdit.globalUsageLimit);
      } else {
        setHasUsageLimit(false);
        setUsageLimit(500);
      }

      setHasPerUserLimit(Boolean(couponToEdit.perUserLimit));
      setPerUserLimit(couponToEdit.perUserLimit ?? 1);
      setIsActive(couponToEdit.isActive ?? true);
      setErrorMessage(null);
    } else {
      // Defaults for new coupon
      setCode("DIWALI50");
      setTitle("Diwali Special Offer");
      setDescription("Flat 50% off on all courses this Diwali!");
      setDiscountType("percentage");
      setDiscountValue(50);
      setMaxDiscountAmount("");
      setMinOrderAmount("");
      setStartsAt(defaultStart);
      setExpiresAt(defaultEnd);
      setHasUsageLimit(true);
      setUsageLimit(2000);
      setHasPerUserLimit(true);
      setPerUserLimit(1);
      setIsActive(true);
      setErrorMessage(null);
    }
  }, [couponToEdit, defaultEnd, defaultStart, isOpen]);

  if (!isOpen) return null;

  const handleRandomizeCode = () => {
    setCode(generateRandomCode());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage("Coupon code is required.");
      return;
    }

    const numericDiscountValue = Number(discountValue) || 0;
    if (!discountValue || numericDiscountValue <= 0) {
      setErrorMessage("Discount value must be greater than 0.");
      return;
    }

    if (discountType === "percentage" && numericDiscountValue > 100) {
      setErrorMessage("Percentage discount cannot exceed 100%.");
      return;
    }

    const startDateObj = parseLocalDateTime(startsAt);
    const endDateObj = parseLocalDateTime(expiresAt);

    if (
      !startDateObj ||
      !endDateObj ||
      startDateObj >= endDateObj
    ) {
      setErrorMessage("Expiry date must be after start date.");
      return;
    }

    const packedDescription = packCouponCopy(title, description);

    try {
      if (isEditMode && couponToEdit) {
        await onSubmitUpdate(couponToEdit.id, {
          description: packedDescription,
          discountType,
          discountValue: numericDiscountValue,
          maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
          minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0,
          startsAt: startDateObj.toISOString(),
          expiresAt: endDateObj.toISOString(),
          globalUsageLimit: hasUsageLimit && usageLimit ? Number(usageLimit) : null,
          perUserLimit: hasPerUserLimit && perUserLimit ? Number(perUserLimit) : 1,
          isActive,
        });
      } else {
        await onSubmitCreate({
          code: cleanCode,
          description: packedDescription,
          discountType,
          discountValue: numericDiscountValue,
          maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
          minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0,
          startsAt: startDateObj.toISOString(),
          expiresAt: endDateObj.toISOString(),
          globalUsageLimit: hasUsageLimit && usageLimit ? Number(usageLimit) : undefined,
          perUserLimit: hasPerUserLimit && perUserLimit ? Number(perUserLimit) : 1,
          isActive,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String(err.message)
          : "Failed to save coupon. Please try again.";
      setErrorMessage(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-3xl bg-(--surface) border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-2xl overflow-hidden my-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-(--muted) hover:text-(--text) cursor-pointer"
          >
            <ArrowLeft size={16} weight="bold" /> Back to Coupons
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] cursor-pointer"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-(--text)">
              {isEditMode ? "Edit Coupon" : "Create Coupon"}
            </h2>
            <p className="text-xs md:text-sm text-(--muted) mt-1">
              Set up a discount coupon and preview how it will look for your
              learners.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs md:text-sm">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Form: 7 or 8 columns */}
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-7 flex flex-col gap-4.5"
            >
              {/* Row 1: Code & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Coupon Code */}
                <div>
                  <label className="block text-xs font-semibold text-(--text) mb-1.5">
                    Coupon Code <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-amber-400 px-3 py-2">
                    <input
                      type="text"
                      value={code}
                      disabled={isEditMode}
                      onChange={(e) =>
                        setCode(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                        )
                      }
                      placeholder="e.g. DIWALI50"
                      maxLength={30}
                      required
                      className="w-full bg-transparent border-0 text-xs md:text-sm font-mono font-bold text-amber-300 outline-none uppercase placeholder-(--muted) disabled:opacity-60"
                    />
                    {!isEditMode && (
                      <button
                        type="button"
                        onClick={handleRandomizeCode}
                        title="Generate random code"
                        className="p-1 text-(--muted) hover:text-amber-400 transition-colors cursor-pointer"
                      >
                        <DiceFive size={18} weight="bold" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-(--muted) mt-1 block">
                    Use uppercase letters, numbers only
                  </span>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-(--text) mb-1.5">
                    Title <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-amber-400 px-3 py-2">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Diwali Special Offer"
                      required
                      className="w-full bg-transparent border-0 text-xs md:text-sm font-medium text-(--text) outline-none placeholder-(--muted)"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-(--text)">
                    Description
                  </label>
                  <span className="text-[11px] text-(--muted)">
                    {description.length}/200
                  </span>
                </div>
                <QuizRichTextField
                  label="Coupon description"
                  value={description}
                  onChange={(val) => setDescription(val.slice(0, 200))}
                  placeholder="Flat 50% off on all courses this Diwali!"
                  documentId={`drawer-coupon-${couponToEdit?.id ?? "new"}-description`}
                  minHeight="min-h-20"
                />
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-(--text) mb-1.5">
                    Discount Type <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex h-9.5 items-center rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                    <ThemedSelect
                      id="create-coupon-type"
                      value={discountType}
                      onValueChange={handleDiscountTypeChange}
                      options={discountTypeOptions}
                      ariaLabel="Discount type"
                      triggerClassName="h-9.5! p-0! bg-transparent! shadow-none! border-0! text-xs font-semibold text-(--text) hover:bg-transparent! focus:outline-none! flex items-center justify-between w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-(--text) mb-1.5">
                    Discount Value <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus-within:border-amber-400 px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={discountType === "percentage" ? 100 : 100000}
                      value={discountValue}
                      onChange={handleDiscountValueChange}
                      placeholder={discountType === "percentage" ? "20" : "500"}
                      required
                      className="w-full bg-transparent border-0 text-xs md:text-sm font-semibold text-(--text) outline-none"
                    />
                    <span className="text-xs font-bold text-amber-400 ml-2">
                      {discountType === "percentage" ? "%" : "₹"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Validity Period */}
              <div>
                <label className="block text-xs font-semibold text-(--text) mb-1.5">
                  Validity Period <span className="text-amber-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-(--muted)">
                      Starts at
                    </span>
                    <ThemedDateTimePicker
                      id="drawer-coupon-starts-at"
                      value={startsAt}
                      onChange={setStartsAt}
                      ariaLabel="Starts at"
                      placeholder="dd/mm/yyyy --:--"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-(--muted)">
                      Expires at
                    </span>
                    <ThemedDateTimePicker
                      id="drawer-coupon-expires-at"
                      value={expiresAt}
                      onChange={setExpiresAt}
                      ariaLabel="Expires at"
                      placeholder="dd/mm/yyyy --:--"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Usage Limit Switch + Input */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="set-usage-limit"
                    checked={hasUsageLimit}
                    onChange={(e) => setHasUsageLimit(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-400 accent-amber-400 cursor-pointer"
                  />
                  <div>
                    <label
                      htmlFor="set-usage-limit"
                      className="block text-xs font-semibold text-(--text) cursor-pointer"
                    >
                      Set usage limit (optional)
                    </label>
                    <span className="text-[11px] text-(--muted)">
                      Maximum number of times this coupon can be redeemed
                    </span>
                  </div>
                </div>
                {hasUsageLimit && (
                  <input
                    type="number"
                    min={1}
                    value={usageLimit}
                    onChange={handleUsageLimitChange}
                    placeholder="500"
                    className="w-24 rounded-lg bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-2.5 py-1 text-xs text-(--text) font-semibold outline-none"
                  />
                )}
              </div>

              {/* Limit per User Switch + Input */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="set-per-user-limit"
                    checked={hasPerUserLimit}
                    onChange={(e) => setHasPerUserLimit(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-400 accent-amber-400 cursor-pointer"
                  />
                  <div>
                    <label
                      htmlFor="set-per-user-limit"
                      className="block text-xs font-semibold text-(--text) cursor-pointer"
                    >
                      Limit per user (optional)
                    </label>
                    <span className="text-[11px] text-(--muted)">
                      Maximum uses per individual learner
                    </span>
                  </div>
                </div>
                {hasPerUserLimit && (
                  <input
                    type="number"
                    min={1}
                    value={perUserLimit}
                    onChange={handlePerUserLimitChange}
                    placeholder="1"
                    className="w-24 rounded-lg bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-2.5 py-1 text-xs text-(--text) font-semibold outline-none"
                  />
                )}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                <div>
                  <span className="block text-xs font-semibold text-(--text)">
                    Coupon Status
                  </span>
                  <span className="text-[11px] text-(--muted)">
                    Active coupons can be redeemed immediately during their
                    validity window
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </button>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs md:text-sm font-bold text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-400 text-black text-xs md:text-sm font-bold hover:bg-amber-300 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && (
                    <CircleNotch size={16} className="animate-spin" />
                  )}
                  {isEditMode ? "Save Changes" : "Create Coupon"}
                </button>
              </div>
            </form>

            {/* Right Side: Live Ticket Preview (5 columns) */}
            <div className="lg:col-span-5 flex flex-col items-center lg:items-start">
              <div className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-(--text)">
                    Coupon Preview
                  </h3>
                  <p className="text-xs text-(--muted) mt-0.5">
                    This is how it will appear to learners.
                  </p>
                </div>

                <div className="flex justify-center w-full">
                  <CouponTicketPreview
                    code={code}
                    title={title}
                    description={description}
                    discountType={discountType}
                    discountValue={Number(discountValue) || 0}
                    expiresAt={expiresAt}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
