import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { CreateCouponRequest, UpdateCouponRequest } from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DiceFiveIcon as DiceFive } from "@phosphor-icons/react/DiceFive";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import { Button } from "../components/Button";
import { ThemedSelect } from "../ThemedSelect";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { useMyCourses } from "../services/courses";
import {
  useCouponById,
  useCreateCoupon,
  useUpdateCoupon,
} from "../services/coupons";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import { QuizRichTextField } from "../quizzes/QuizRichTextField";
import { CouponTicketPreview } from "./CouponTicketPreview";
import {
  couponMoneyToForm,
  inputClass,
  isoToLocalDateTimeValue,
  packCouponCopy,
  parseLocalDateTime,
  sanitizeNumberInput,
  surfaceClass,
  toCouponMoneyPayload,
  toLocalDateTimeValue,
  unpackCouponCopy,
} from "./couponHelpers";

export interface CouponBuilderPageProps {
  couponId?: string | null;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const discountTypeOptions: readonly [string, string][] = [
  ["percentage", "Percentage Discount"],
  ["fixed", "Fixed Amount Discount"],
];

function generateRandomCode(): string {
  const prefixes = ["PROMO", "SPECIAL", "SUPER", "SAVE", "FLASH", "MEGA", "LEARN"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)] ?? "PROMO";
  return `${prefix}${Math.floor(10 + Math.random() * 89)}`;
}

function isSafeReturnPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

function RequiredMark() {
  return <span className="text-(--accent)"> *</span>;
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-(--text)">
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  );
}

const fieldClass = `${inputClass} h-11 rounded-xl`;

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
        checked ? "bg-(--accent)" : "bg-[color-mix(in_srgb,var(--text)_22%,transparent)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function CouponBuilderPage({
  couponId,
  onNavigatePage,
  setNotice,
}: CouponBuilderPageProps) {
  const isEditMode = Boolean(couponId && couponId !== "create");
  const [searchParams] = useSearchParams();
  const presetCourseId = searchParams.get("courseId");
  const returnTo = searchParams.get("returnTo");
  const afterSavePath = isSafeReturnPath(returnTo) ? returnTo : "/coupons";
  const { data: existingCoupon, isLoading: isLoadingCoupon } = useCouponById(
    isEditMode ? couponId : null,
  );
  const { data: myCourses } = useMyCourses();
  const courses = myCourses?.courses ?? [];
  const createMutation = useCreateCoupon();
  const updateMutation = useUpdateCoupon();

  const defaultStart = useMemo(() => toLocalDateTimeValue(new Date(), "start"), []);
  const defaultEnd = useMemo(
    () =>
      toLocalDateTimeValue(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        "end",
      ),
    [],
  );

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [discountValue, setDiscountValue] = useState<number | "">(20);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [expiresAt, setExpiresAt] = useState(defaultEnd);
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [usageLimit, setUsageLimit] = useState<number | "">(2000);
  const [hasPerUserLimit, setHasPerUserLimit] = useState(true);
  const [perUserLimit, setPerUserLimit] = useState<number | "">(1);
  const [restrictedCourseIds, setRestrictedCourseIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDiscountTypeChange = (value: string) => {
    const nextType = value as "percentage" | "fixed";
    setDiscountType(nextType);
    if (nextType === "percentage" && typeof discountValue === "number" && discountValue > 100) {
      setDiscountValue(100);
    }
  };

  const handleDiscountValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(event.target.value, {
      max: discountType === "percentage" ? 100 : 100000,
    });
    setDiscountValue(sanitized);
  };

  const handleUsageLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(event.target.value, {
      max: 1000000,
    });
    setUsageLimit(sanitized);
  };

  const handlePerUserLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeNumberInput(event.target.value, {
      max: 100000,
    });
    setPerUserLimit(sanitized);
  };

  useEffect(() => {
    if (isEditMode && existingCoupon) {
      const money = couponMoneyToForm(existingCoupon);
      const copy = unpackCouponCopy(existingCoupon.description);
      setCode(existingCoupon.code);
      setTitle(copy.title);
      setDescription(copy.description);
      setDiscountType(existingCoupon.discountType);
      setDiscountValue(money.discountValue);
      setStartsAt(isoToLocalDateTimeValue(existingCoupon.startsAt) || defaultStart);
      setExpiresAt(isoToLocalDateTimeValue(existingCoupon.expiresAt) || defaultEnd);
      setHasUsageLimit(Boolean(existingCoupon.globalUsageLimit));
      setUsageLimit(existingCoupon.globalUsageLimit ?? 2000);
      setHasPerUserLimit(Boolean(existingCoupon.perUserLimit));
      setPerUserLimit(existingCoupon.perUserLimit ?? 1);
      setRestrictedCourseIds(existingCoupon.restrictedCourseIds ?? []);
      setErrorMessage(null);
      return;
    }

    if (!isEditMode) {
      setCode(generateRandomCode());
      setTitle("");
      setDescription("");
      setDiscountType("percentage");
      setDiscountValue(20);
      setStartsAt(defaultStart);
      setExpiresAt(defaultEnd);
      setHasUsageLimit(false);
      setUsageLimit(2000);
      setHasPerUserLimit(true);
      setPerUserLimit(1);
      setRestrictedCourseIds(presetCourseId ? [presetCourseId] : []);
      setErrorMessage(null);
    }
  }, [defaultEnd, defaultStart, existingCoupon, isEditMode, presetCourseId]);

  const restrictedCoursesLabel = useMemo(() => {
    if (restrictedCourseIds.length === 0) return "on all courses";
    if (restrictedCourseIds.length === 1) {
      const course = courses.find((item) => item.id === restrictedCourseIds[0]);
      return course ? `on ${course.title}` : "on 1 selected course";
    }
    return `on ${restrictedCourseIds.length} selected courses`;
  }, [courses, restrictedCourseIds]);

  const availableCourseOptions = useMemo(
    () =>
      courses
        .filter((course) => !restrictedCourseIds.includes(course.id))
        .map((course) => [course.id, course.title] as const),
    [courses, restrictedCourseIds],
  );

  const addRestrictedCourse = (courseId: string) => {
    if (!courseId) return;
    setRestrictedCourseIds((current) =>
      current.includes(courseId) ? current : [...current, courseId],
    );
  };

  const removeRestrictedCourse = (courseId: string) => {
    setRestrictedCourseIds((current) => current.filter((id) => id !== courseId));
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setErrorMessage(null);

    const cleanCode = code.trim().toUpperCase();
    const cleanTitle = title.trim();
    if (!cleanCode) {
      setErrorMessage("Coupon code is required.");
      return;
    }
    if (!cleanTitle) {
      setErrorMessage("Title is required.");
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

    if (!startsAt || !expiresAt) {
      setErrorMessage("Start and expiry dates are required.");
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

    const money = toCouponMoneyPayload({
      discountType,
      discountValue: numericDiscountValue,
    });
    const packedDescription = packCouponCopy(cleanTitle, description);

    try {
      if (isEditMode) {
        if (!existingCoupon) {
          setErrorMessage("Could not load coupon details to update.");
          return;
        }
        const payload: UpdateCouponRequest = {
          description: packedDescription,
          discountType,
          discountValue: money.discountValue,
          minOrderAmount: money.minOrderAmount,
          startsAt: startDateObj.toISOString(),
          expiresAt: endDateObj.toISOString(),
          globalUsageLimit: hasUsageLimit && usageLimit ? Number(usageLimit) : null,
          perUserLimit: hasPerUserLimit && perUserLimit ? Number(perUserLimit) : 1,
          isActive: existingCoupon.isActive,
          restrictedCourseIds:
            restrictedCourseIds.length > 0 ? restrictedCourseIds : null,
        };
        await updateMutation.mutateAsync({ id: existingCoupon.id, payload });
        setNotice?.(`${existingCoupon.code} updated.`);
      } else {
        const payload: CreateCouponRequest = {
          code: cleanCode,
          description: packedDescription,
          discountType,
          discountValue: money.discountValue,
          minOrderAmount: money.minOrderAmount,
          startsAt: startDateObj.toISOString(),
          expiresAt: endDateObj.toISOString(),
          globalUsageLimit: hasUsageLimit && usageLimit ? Number(usageLimit) : undefined,
          perUserLimit: hasPerUserLimit && perUserLimit ? Number(perUserLimit) : 1,
          isActive: true,
          restrictedCourseIds:
            restrictedCourseIds.length > 0 ? restrictedCourseIds : undefined,
        };
        await createMutation.mutateAsync(payload);
        setNotice?.(`${cleanCode} created.`);
      }
      onNavigatePage?.(afterSavePath);
    } catch (err) {
      setErrorMessage(getApiError(err).message);
    }
  };

  if (isEditMode && isLoadingCoupon) {
    return (
      <main data-coupon-surface="" className="mx-auto grid w-full max-w-[1320px] place-items-center py-24">
        <CircleNotch size={28} className="mb-3 animate-spin text-(--accent)" />
        <p className="text-sm text-(--muted)">Loading coupon...</p>
      </main>
    );
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <main
      data-coupon-surface=""
      className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6"
    >
      <header>
        <button
          type="button"
        onClick={() => onNavigatePage?.(afterSavePath)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-(--muted) hover:text-(--text) cursor-pointer"
      >
        <ArrowLeft size={16} weight="bold" />
        {isSafeReturnPath(returnTo) ? "Back to course" : "Back to Coupons"}
        </button>
        <h1 className="m-0 text-[1.75rem] font-semibold tracking-tight text-(--text) sm:text-[2rem]">
          {isEditMode ? "Edit Coupon" : "Create Coupon"}
        </h1>
        <p className="mt-1 mb-0 text-sm text-(--muted)">
          Set up a new coupon and preview how it will look for your learners.
        </p>
      </header>

      {errorMessage ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          <WarningCircle size={18} weight="bold" className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
        <form
          onSubmit={handleSubmit}
          className={`${surfaceClass} flex min-w-0 flex-col gap-5 p-5 sm:p-6`}
        >
          <div className="grid w-full gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel htmlFor="coupon-code" required>
                Coupon Code
              </FieldLabel>
              <div className={`${fieldClass} flex w-full items-center gap-2`}>
                <input
                  id="coupon-code"
                  type="text"
                  value={code}
                  disabled={isEditMode}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
                  }
                  placeholder="DIWALI50"
                  maxLength={30}
                  required
                  className="w-full min-w-0 border-0 bg-transparent font-semibold uppercase outline-none disabled:opacity-60"
                />
                {isEditMode ? null : (
                  <button
                    type="button"
                    onClick={() => setCode(generateRandomCode())}
                    title="Generate code"
                    className="shrink-0 text-(--muted) hover:text-(--text) cursor-pointer"
                  >
                    <DiceFive size={18} weight="bold" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-(--muted)">
                Use uppercase letters, numbers only
              </p>
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="coupon-title" required>
                Title
              </FieldLabel>
              <input
                id="coupon-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Diwali Special Offer"
                required
                className={`${fieldClass} w-full`}
              />
            </div>
          </div>

          <div className="w-full min-w-0">
            <FieldLabel htmlFor="coupon-description">Description</FieldLabel>
            <QuizRichTextField
              label="Coupon description"
              value={description}
              onChange={(val) => setDescription(val.slice(0, 500))}
              documentId={`coupon-${couponId ?? "new"}-description`}
              placeholder="Flat 50% off on all courses this Diwali!"
              minHeight="min-h-24"
            />
            <p className="mt-1 text-right text-[12px] text-(--muted)">
              {description.length}/500
            </p>
          </div>

          <div className="grid w-full gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel required>Discount Type</FieldLabel>
              <div className={`${fieldClass} flex w-full items-center`}>
                <ThemedSelect
                  id="coupon-discount-type"
                  value={discountType}
                  onValueChange={handleDiscountTypeChange}
                  options={discountTypeOptions}
                  ariaLabel="Discount type"
                  triggerClassName="h-11! p-0! bg-transparent! shadow-none! border-0! text-sm font-medium hover:bg-transparent! flex w-full items-center justify-between"
                />
              </div>
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="coupon-discount-value" required>
                Discount Value
              </FieldLabel>
              <div className={`${fieldClass} flex w-full items-center gap-2`}>
                <input
                  id="coupon-discount-value"
                  type="number"
                  min={1}
                  max={discountType === "percentage" ? 100 : 100000}
                  value={discountValue}
                  onChange={handleDiscountValueChange}
                  placeholder={discountType === "percentage" ? "20" : "500"}
                  required
                  className="w-full border-0 bg-transparent outline-none"
                />
                <span className="text-sm font-semibold text-(--muted)">
                  {discountType === "percentage" ? "%" : "₹"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel required>Validity Period</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Starts at
                </span>
                <ThemedDateTimePicker
                  id="coupon-starts-at"
                  value={startsAt}
                  onChange={setStartsAt}
                  ariaLabel="Starts at"
                  placeholder="dd/mm/yyyy --:--"
                  className="w-full"
                />
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Expires at
                </span>
                <ThemedDateTimePicker
                  id="coupon-expires-at"
                  value={expiresAt}
                  onChange={setExpiresAt}
                  ariaLabel="Expires at"
                  placeholder="dd/mm/yyyy --:--"
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                checked={hasUsageLimit}
                onChange={setHasUsageLimit}
                label="Set usage limit"
              />
              <span className="text-sm text-(--text)">Set usage limit (optional)</span>
              <input
                type="number"
                min={1}
                value={usageLimit}
                disabled={!hasUsageLimit}
                onChange={handleUsageLimitChange}
                placeholder="2000"
                className={`${fieldClass} w-24 disabled:opacity-40`}
              />
              <span className="text-[12px] text-(--muted)">
                Maximum number of times this coupon can be redeemed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                checked={hasPerUserLimit}
                onChange={setHasPerUserLimit}
                label="Limit per user"
              />
              <span className="text-sm text-(--text)">Limit per user (optional)</span>
              <input
                type="number"
                min={1}
                value={perUserLimit}
                disabled={!hasPerUserLimit}
                onChange={handlePerUserLimitChange}
                placeholder="1"
                className={`${fieldClass} w-24 disabled:opacity-40`}
              />
              <span className="text-[12px] text-(--muted)">
                Maximum uses per individual user
              </span>
            </div>
          </div>

          {courses.length > 0 || restrictedCourseIds.length > 0 ? (
            <div>
              <FieldLabel htmlFor="coupon-restrict-courses">
                Restrict to courses
              </FieldLabel>
              <div className={`${fieldClass} flex w-full items-center`}>
                <ThemedSelect
                  id="coupon-restrict-courses"
                  value=""
                  onValueChange={addRestrictedCourse}
                  options={availableCourseOptions}
                  searchable
                  searchPlaceholder="Search courses..."
                  defaultLimit={6}
                  disabled={availableCourseOptions.length === 0}
                  ariaLabel="Search courses"
                  className="w-full"
                  triggerClassName="h-11! p-0! bg-transparent! shadow-none! border-0! text-sm font-medium hover:bg-transparent! flex w-full items-center justify-between"
                />
              </div>
              {restrictedCourseIds.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {restrictedCourseIds.map((courseId) => {
                    const course = courses.find((item) => item.id === courseId);
                    const label = course?.title ?? "Course";
                    return (
                      <span
                        key={courseId}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--accent)/40 bg-(--accent)/12 py-1 pl-3 pr-1.5 text-xs font-semibold text-(--accent)"
                      >
                        <span className="truncate">{label}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${label}`}
                          onClick={() => removeRestrictedCourse(courseId)}
                          className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-(--accent)/20 cursor-pointer"
                        >
                          <X size={11} weight="bold" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] text-(--muted)">
                  Applies to all courses until you add a restriction.
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4">
            <button
              type="button"
              onClick={() => onNavigatePage?.(afterSavePath)}
              className="h-10 rounded-xl px-4 text-sm font-semibold text-(--muted) hover:text-(--text) cursor-pointer"
            >
              Cancel
            </button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <CircleNotch size={16} className="animate-spin" /> : null}
              {isEditMode ? "Save changes" : "Create Coupon"}
            </Button>
          </div>
        </form>

        <aside className={`${surfaceClass} sticky top-4 w-full p-5`}>
          <h2 className="m-0 text-base font-semibold text-(--text)">Coupon Preview</h2>
          <p className="mt-1 mb-4 text-sm text-(--muted)">
            This is how it will appear to learners.
          </p>
          <CouponTicketPreview
            code={code}
            title={title}
            discountType={discountType}
            discountValue={Number(discountValue) || 0}
            expiresAt={expiresAt}
            restrictedCoursesLabel={restrictedCoursesLabel}
          />
        </aside>
      </div>
    </main>
  );
}
