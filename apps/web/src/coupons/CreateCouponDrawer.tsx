import { useEffect, useState } from "react";
import type { Coupon, CreateCouponRequest, UpdateCouponRequest } from "@veolms/contracts";
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

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState<number | "">(20);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<string>("");
  const [minOrderAmount, setMinOrderAmount] = useState<string>("");

  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

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
    if (!isOpen) return;

    if (couponToEdit) {
      const { title: unpackedTitle, description: unpackedDesc } = unpackCouponCopy(
        couponToEdit.description,
      );
      setCode(couponToEdit.code);
      setTitle(unpackedTitle || `${couponToEdit.code} Offer`);
      setDescription(unpackedDesc);
      setDiscountType(couponToEdit.discountType);
      setDiscountValue(couponToEdit.discountValue);
      setMaxDiscountAmount(
        couponToEdit.maxDiscountAmount ? String(couponToEdit.maxDiscountAmount) : "",
      );
      setMinOrderAmount(couponToEdit.minOrderAmount ? String(couponToEdit.minOrderAmount) : "");

      const editDefaultStart = toLocalDateTimeValue(new Date(), "start");
      const editDefaultEnd = toLocalDateTimeValue(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        "end",
      );

      setStartsAt(isoToLocalDateTimeValue(couponToEdit.startsAt) || editDefaultStart);
      setExpiresAt(isoToLocalDateTimeValue(couponToEdit.expiresAt) || editDefaultEnd);

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
      const newDefaultStart = toLocalDateTimeValue(new Date(), "start");
      const newDefaultEnd = toLocalDateTimeValue(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        "end",
      );

      setCode("DIWALI50");
      setTitle("Diwali Special Offer");
      setDescription("Flat 50% off on all courses this Diwali!");
      setDiscountType("percentage");
      setDiscountValue(50);
      setMaxDiscountAmount("");
      setMinOrderAmount("");
      setStartsAt(newDefaultStart);
      setExpiresAt(newDefaultEnd);
      setHasUsageLimit(true);
      setUsageLimit(2000);
      setHasPerUserLimit(true);
      setPerUserLimit(1);
      setIsActive(true);
      setErrorMessage(null);
    }
  }, [couponToEdit, isOpen]);

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

    if (!startDateObj || !endDateObj || startDateObj >= endDateObj) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative my-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-(--muted) hover:text-(--text) md:text-sm"
          >
            <ArrowLeft size={16} weight="bold" /> Back to Coupons
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-(--text) md:text-2xl">
              {isEditMode ? "Edit Coupon" : "Create Coupon"}
            </h2>
            <p className="mt-1 text-xs text-(--muted) md:text-sm">
              Set up a discount coupon and preview how it will look for your learners.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400 md:text-sm">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            {/* Left Form: 7 or 8 columns */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4.5 lg:col-span-7">
              {/* Row 1: Code & Title */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Coupon Code */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-(--text)">
                    Coupon Code <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-3 py-2 focus-within:border-amber-400">
                    <input
                      type="text"
                      value={code}
                      disabled={isEditMode}
                      onChange={(e) =>
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
                      }
                      placeholder="e.g. DIWALI50"
                      maxLength={30}
                      required
                      className="w-full border-0 bg-transparent font-mono text-xs font-bold text-amber-300 uppercase placeholder-(--muted) outline-none disabled:opacity-60 md:text-sm"
                    />
                    {!isEditMode && (
                      <button
                        type="button"
                        onClick={handleRandomizeCode}
                        title="Generate random code"
                        className="cursor-pointer p-1 text-(--muted) transition-colors hover:text-amber-400"
                      >
                        <DiceFive size={18} weight="bold" />
                      </button>
                    )}
                  </div>
                  <span className="mt-1 block text-[11px] text-(--muted)">
                    Use uppercase letters, numbers only
                  </span>
                </div>

                {/* Title */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-(--text)">
                    Title <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-3 py-2 focus-within:border-amber-400">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Diwali Special Offer"
                      required
                      className="w-full border-0 bg-transparent text-xs font-medium text-(--text) placeholder-(--muted) outline-none md:text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-(--text)">Description</label>
                  <span className="text-[11px] text-(--muted)">{description.length}/200</span>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-(--text)">
                    Discount Type <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex h-9.5 items-center rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-3">
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
                  <label className="mb-1.5 block text-xs font-semibold text-(--text)">
                    Discount Value <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-3 py-2 focus-within:border-amber-400">
                    <input
                      type="number"
                      min={1}
                      max={discountType === "percentage" ? 100 : 100000}
                      value={discountValue}
                      onChange={handleDiscountValueChange}
                      placeholder={discountType === "percentage" ? "20" : "500"}
                      required
                      className="w-full border-0 bg-transparent text-xs font-semibold text-(--text) outline-none md:text-sm"
                    />
                    <span className="ml-2 text-xs font-bold text-amber-400">
                      {discountType === "percentage" ? "%" : "₹"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Validity Period */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-(--text)">
                  Validity Period <span className="text-amber-400">*</span>
                </label>
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
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
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="set-usage-limit"
                    checked={hasUsageLimit}
                    onChange={(e) => setHasUsageLimit(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded text-amber-400 accent-amber-400"
                  />
                  <div>
                    <label
                      htmlFor="set-usage-limit"
                      className="block cursor-pointer text-xs font-semibold text-(--text)"
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
                    className="w-24 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-2.5 py-1 text-xs font-semibold text-(--text) outline-none"
                  />
                )}
              </div>

              {/* Limit per User Switch + Input */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="set-per-user-limit"
                    checked={hasPerUserLimit}
                    onChange={(e) => setHasPerUserLimit(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded text-amber-400 accent-amber-400"
                  />
                  <div>
                    <label
                      htmlFor="set-per-user-limit"
                      className="block cursor-pointer text-xs font-semibold text-(--text)"
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
                    className="w-24 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] px-2.5 py-1 text-xs font-semibold text-(--text) outline-none"
                  />
                )}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-3">
                <div>
                  <span className="block text-xs font-semibold text-(--text)">Coupon Status</span>
                  <span className="text-[11px] text-(--muted)">
                    Active coupons can be redeemed immediately during their validity window
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-bold transition-all ${
                    isActive
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                      : "border-zinc-500/30 bg-zinc-500/15 text-zinc-400"
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </button>
              </div>

              {/* Buttons */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="cursor-pointer rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] px-5 py-2.5 text-xs font-bold text-(--muted) transition-all hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text) disabled:opacity-50 md:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-6 py-2.5 text-xs font-bold text-black shadow-md transition-all hover:bg-amber-300 disabled:opacity-50 md:text-sm"
                >
                  {isSubmitting && <CircleNotch size={16} className="animate-spin" />}
                  {isEditMode ? "Save Changes" : "Create Coupon"}
                </button>
              </div>
            </form>

            {/* Right Side: Live Ticket Preview (5 columns) */}
            <div className="flex flex-col items-center lg:col-span-5 lg:items-start">
              <div className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-(--text)">Coupon Preview</h3>
                  <p className="mt-0.5 text-xs text-(--muted)">
                    This is how it will appear to learners.
                  </p>
                </div>

                <div className="flex w-full justify-center">
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
