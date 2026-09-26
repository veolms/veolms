import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  TagIcon as Tag,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import {
  useCourseQuizPricing,
  useSetQuizCoursePricing,
} from "../services/quizzes";
import { Button } from "../components/Button";

function getCurrencySymbol(code: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || (code === "INR" ? "₹" : "$")
    );
  } catch {
    return code === "INR" ? "₹" : code === "USD" ? "$" : code;
  }
}

export interface CourseQuizPricingCardProps {
  courseId: string | null;
  courseCurrency?: string;
  onNavigateTab?: (tab: string) => void;
}

export function CourseQuizPricingCard({
  courseId,
  courseCurrency = "INR",
}: CourseQuizPricingCardProps) {
  const pricingQuery = useCourseQuizPricing(courseId);
  const savedPricing = pricingQuery.data;
  const saveMutation = useSetQuizCoursePricing();

  const initialPricingType = savedPricing?.pricingType === "paid" ? "paid" : "free";
  const initialPrice = savedPricing && savedPricing.price > 0
    ? String(savedPricing.price)
    : "";
  const initialSalePrice = savedPricing?.salePrice && savedPricing.salePrice > 0
    ? String(savedPricing.salePrice)
    : "";

  const [pricingType, setPricingType] = useState<"free" | "paid">(initialPricingType);
  const [priceInput, setPriceInput] = useState(initialPrice);
  const [salePriceInput, setSalePriceInput] = useState(initialSalePrice);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const hasUserEditedRef = useRef(false);

  // Sync with server data when it loads if user hasn't typed locally
  useEffect(() => {
    if (hasUserEditedRef.current) return;
    if (savedPricing) {
      setPricingType(savedPricing.pricingType === "paid" ? "paid" : "free");
      setPriceInput(savedPricing.price > 0 ? String(savedPricing.price) : "");
      setSalePriceInput(
        savedPricing.salePrice && savedPricing.salePrice > 0
          ? String(savedPricing.salePrice)
          : "",
      );
    }
  }, [savedPricing]);

  // Validation
  const validationError = useMemo(() => {
    if (pricingType !== "paid") return null;
    const numPrice = Number(priceInput);
    if (!priceInput.trim() || isNaN(numPrice) || numPrice <= 0 || !Number.isInteger(numPrice)) {
      return "Price must be a whole number greater than 0.";
    }
    if (salePriceInput.trim()) {
      const numSale = Number(salePriceInput);
      if (isNaN(numSale) || numSale <= 0 || !Number.isInteger(numSale)) {
        return "Sale price must be a positive whole number.";
      }
      if (numSale >= numPrice) {
        return "Sale price must be strictly lower than regular price.";
      }
    }
    return null;
  }, [pricingType, priceInput, salePriceInput]);

  const performSave = useCallback(
    async (
      nextType: "free" | "paid",
      nextPrice: string,
      nextSale: string,
    ) => {
      if (!courseId) return;

      if (nextType === "paid") {
        const numPrice = Number(nextPrice);
        if (!nextPrice.trim() || isNaN(numPrice) || numPrice <= 0 || !Number.isInteger(numPrice)) {
          return;
        }
        if (nextSale.trim()) {
          const numSale = Number(nextSale);
          if (isNaN(numSale) || numSale <= 0 || numSale >= numPrice || !Number.isInteger(numSale)) {
            return;
          }
        }
      }

      setSaveStatus("saving");
      setErrorMessage(null);

      try {
        const payload = {
          pricingType: nextType,
          price: nextType === "paid" ? Number(nextPrice) : 0,
          salePrice:
            nextType === "paid" && nextSale.trim()
              ? Number(nextSale)
              : null,
        };

        // One course-level price covers every quiz in the course.
        await saveMutation.mutateAsync({ courseId, payload });

        setSaveStatus("saved");
        window.setTimeout(() => setSaveStatus("idle"), 2500);
      } catch (err: unknown) {
        setSaveStatus("error");
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to save quiz pricing";
        setErrorMessage(msg);
      }
    },
    [courseId, saveMutation],
  );

  const scheduleSave = useCallback(
    (nextType: "free" | "paid", nextPrice: string, nextSale: string) => {
      hasUserEditedRef.current = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void performSave(nextType, nextPrice, nextSale);
      }, 700);
    },
    [performSave],
  );

  const numPrice = Number(priceInput);
  const numSale = Number(salePriceInput);
  const hasDiscount =
    pricingType === "paid" &&
    !isNaN(numPrice) &&
    !isNaN(numSale) &&
    numPrice > 0 &&
    numSale > 0 &&
    numSale < numPrice;
  const discountPercent = hasDiscount
    ? Math.round(((numPrice - numSale) / numPrice) * 100)
    : 0;

  if (pricingQuery.isError) {
    return (
      <div className="flex flex-col border border-red-500/20 rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200">
        <div className="flex items-center justify-between mb-4.5">
          <div>
            <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
              3. Course quiz pricing
            </h3>
            <p className="m-0 text-(--muted) text-[0.83rem]">
              Set the overall price for quizzes in this course. Paying once gives learners access to all quizzes attached to this course.
            </p>
          </div>
        </div>
        <p className="text-sm text-red-400 mb-3">
          Unable to load quiz pricing. {pricingQuery.error?.message ?? "Please try again."}
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => void pricingQuery.refetch()}
            className="w-fit"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4.5">
        <div>
          <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
            3. Course quiz pricing
          </h3>
          <p className="m-0 text-(--muted) text-[0.83rem]">
            Set the overall price for quizzes in this course. Paying once gives learners access to all quizzes attached to this course.
          </p>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center gap-1.5 text-xs font-medium shrink-0">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1 text-(--accent)">
              <CircleNotch size={13} className="animate-spin" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <CheckCircle size={14} weight="fill" />
              <span>Saved</span>
            </span>
          )}
          {saveStatus === "error" && (
            <span className="inline-flex items-center gap-1 text-rose-500">
              <WarningCircle size={14} weight="fill" />
              <span>Save error</span>
            </span>
          )}
        </div>
      </div>

      {!courseId ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-5 text-center text-xs text-(--muted)">
          Save course basics before configuring quiz pricing.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Main Pricing Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Free Option */}
            <label
              className={`flex items-start gap-3 rounded-[12px] border p-3.5 px-4 cursor-pointer transition-all select-none ${
                pricingType === "free"
                  ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]"
              }`}
            >
              <input
                type="radio"
                name="course-overall-quiz-pricing"
                value="free"
                checked={pricingType === "free"}
                onChange={() => {
                  hasUserEditedRef.current = true;
                  setPricingType("free");
                  void performSave("free", priceInput, salePriceInput);
                }}
                className="size-4.5 mt-0.5 accent-(--accent) cursor-pointer shrink-0"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-(--text)">
                  Free (Included in Course)
                </span>
                <span className="text-xs text-(--muted) leading-relaxed">
                  All quizzes in this course are included for free when learners enroll in the course.
                </span>
              </div>
            </label>

            {/* Paid Option */}
            <label
              className={`flex items-start gap-3 rounded-[12px] border p-3.5 px-4 cursor-pointer transition-all select-none ${
                pricingType === "paid"
                  ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]"
              }`}
            >
              <input
                type="radio"
                name="course-overall-quiz-pricing"
                value="paid"
                checked={pricingType === "paid"}
                onChange={() => {
                  hasUserEditedRef.current = true;
                  setPricingType("paid");
                  const defaultPrice = priceInput.trim() ? priceInput : "499";
                  setPriceInput(defaultPrice);
                  void performSave("paid", defaultPrice, salePriceInput);
                }}
                className="size-4.5 mt-0.5 accent-(--accent) cursor-pointer shrink-0"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-(--text)">
                  Paid (Course Quiz Pass)
                </span>
                <span className="text-xs text-(--muted) leading-relaxed">
                  Learners can purchase standalone quiz access to unlock and take all quizzes attached to this course.
                </span>
              </div>
            </label>
          </div>

          {/* Paid Price Fields */}
          {pricingType === "paid" && (
            <div className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_35%,var(--surface))] p-4 space-y-3 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Regular Price */}
                <div>
                  <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                    Course Quiz Pass Price ({courseCurrency}) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-semibold text-(--muted) pointer-events-none">
                      {getCurrencySymbol(courseCurrency)}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={priceInput}
                      placeholder="499"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setPriceInput(val);
                        scheduleSave(pricingType, val, salePriceInput);
                      }}
                      onBlur={() => {
                        void performSave(pricingType, priceInput, salePriceInput);
                      }}
                      className="w-full h-9.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] pl-7 pr-3 text-xs sm:text-sm font-semibold text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent)"
                    />
                  </div>
                  <p className="m-0 mt-1 text-[0.74rem] text-(--muted)">
                    Price learners pay to unlock all quizzes in this course.
                  </p>
                </div>

                {/* Sale Price */}
                <div>
                  <label className="block text-xs font-semibold text-(--text-secondary) mb-1.5">
                    Sale Price ({courseCurrency}){" "}
                    <span className="text-(--muted) font-normal">(optional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-semibold text-(--muted) pointer-events-none">
                      {getCurrencySymbol(courseCurrency)}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={salePriceInput}
                      placeholder="299"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setSalePriceInput(val);
                        scheduleSave(pricingType, priceInput, val);
                      }}
                      onBlur={() => {
                        void performSave(pricingType, priceInput, salePriceInput);
                      }}
                      className="w-full h-9.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] pl-7 pr-3 text-xs sm:text-sm font-semibold text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent)"
                    />
                  </div>
                  <p className="m-0 mt-1 text-[0.74rem] text-(--muted)">
                    Discounted price to show special offer.
                  </p>
                </div>
              </div>

              {/* Discount / Error Feedback */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                {hasDiscount ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Tag size={13} weight="bold" />
                    {discountPercent}% OFF
                  </span>
                ) : null}

                {validationError ? (
                  <p className="m-0 text-xs font-medium text-rose-500">
                    {validationError}
                  </p>
                ) : errorMessage ? (
                  <p className="m-0 text-xs font-medium text-rose-500">
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
