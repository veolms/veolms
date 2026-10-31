import { Checkbox } from "../../components/Checkbox";
import { CourseQuizPricingCard } from "../CourseQuizPricingCard";
import { CourseLinkedCoursesCard } from "../CourseLinkedCoursesCard";
import { CoursePartialAccessCard } from "../CoursePartialAccessCard";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { ThemedSelect } from "../../ThemedSelect";
import { Switch } from "../../home-page-settings/homePageSettingsControls";
import type { NavigateTo } from "../../routing/navigation";
import { useCapabilities } from "../../services/authorization";
import { type CourseWizardStepId, parseWizardTab } from "./wizardSteps";
import {
  type PricingControlKey,
  PricingControlStatusIndicator,
} from "./statusIndicators";
import { type PricingFormState, getCurrencySymbol } from "./pricingState";

export interface PricingStepPanelProps {
  pricingValidationError: string | null;
  getPricingControlDisplayStatus: (
    controlKey: PricingControlKey,
  ) => "saving" | "saved" | "failed" | null;
  pricing: PricingFormState;
  handleCurrencyChange: (val: string) => Promise<void>;
  currencyOptions: (readonly [
    string,
    string,
    ({ searchKeywords?: string } | undefined)?,
  ])[];
  isSavingPricing: boolean;
  isPricingControlSaving: (controlKey: string) => boolean;
  handleSellingPriceChange: (val: string) => void;
  flushPricingPersistence: () => Promise<void>;
  handleOriginalPriceChange: (val: string) => void;
  handleShowDiscountBadgeChange: (checked: boolean) => void;
  handleLinkedOnlyChange: (checked: boolean) => void;
  currentCourseId: string | null;
  navigateToStep: (destination: CourseWizardStepId) => Promise<void>;
  onNavigatePage: NavigateTo | undefined;
}

export function PricingStepPanel({
  pricingValidationError,
  getPricingControlDisplayStatus,
  pricing,
  handleCurrencyChange,
  currencyOptions,
  isSavingPricing,
  isPricingControlSaving,
  handleSellingPriceChange,
  flushPricingPersistence,
  handleOriginalPriceChange,
  handleShowDiscountBadgeChange,
  handleLinkedOnlyChange,
  currentCourseId,
  navigateToStep,
  onNavigatePage,
}: PricingStepPanelProps) {
  // Quiz pricing is read and saved with quiz.settings.update.
  const setsQuizPricing = useCapabilities().can("quiz.settings.update");
  // prettier-ignore
  return (
    <div className="flex w-full flex-col gap-5">
      {pricingValidationError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[0.84rem] font-semibold text-red-400">
          <WarningCircle
            size={18}
            weight="bold"
            className="shrink-0"
          />
          <span>{pricingValidationError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 max-[768px]:gap-3.5 w-full min-w-0">
        {/* Price details */}
        <div
          className={`flex flex-col border border-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[14px] p-5 pb-6 bg-(--surface) shadow-(--card-shadow) transition-opacity duration-200 `}
        >
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h3 className="m-0 mb-1 text-(--text) text-[1.05rem] font-bold">
                Price details
              </h3>
              <p className="m-0 text-(--muted) text-[0.83rem]">
                Set the price for your course. A price of 0 makes it
                free.
              </p>
            </div>
          </div>

          {/* Linked course only */}
          <div className="flex items-start justify-between gap-4 mb-5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_55%,var(--surface))] px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-(--text) text-[0.88rem] font-semibold">
                  Linked course only
                </span>
                <PricingControlStatusIndicator
                  status={getPricingControlDisplayStatus(
                    "pricingDetails",
                  )}
                  testId="pricing-field-status-linkedOnly"
                />
              </div>
              <p className="m-0 mt-1 text-(--muted) text-[0.8rem]">
                No price and not for sale. Hidden from the course list;
                learners get it only through a course that links it.
              </p>
            </div>
            <Switch
              checked={pricing.linkedOnly}
              onChange={handleLinkedOnlyChange}
              label="Linked course only"
            />
          </div>

          {pricing.linkedOnly ? (
            <div className="flex items-start gap-2.5 text-(--muted) text-[0.82rem]">
              <LinkSimple size={16} weight="bold" className="shrink-0 mt-0.5" />
              <span>
                To give this course to learners, open the course that
                includes it and add it under Linked courses on its
                Pricing tab. Turn this off and enter a price to sell it
                on its own.
              </span>
            </div>
          ) : (
          <div className="flex flex-col gap-1.75">
            {/* Currency Combobox Field */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between">
                <label
                  id="currency-label"
                  className="text-(--text-secondary) text-[0.84rem] font-semibold"
                >
                  Currency{" "}
                  <span className="text-[#ff5252] ml-0.5">*</span>
                </label>
                <PricingControlStatusIndicator
                  status={getPricingControlDisplayStatus(
                    "currency",
                  )}
                  testId="pricing-field-status-currency"
                />
              </div>
              <ThemedSelect
                value={pricing.currency || "INR"}
                onValueChange={handleCurrencyChange}
                options={currencyOptions}
                disabled={
                  isSavingPricing ||
                  isPricingControlSaving("pricingType") ||
                  isPricingControlSaving("currency")
                }
                ariaLabel="Select currency"
                searchable
                searchPlaceholder="Search currencies by name or code..."
                triggerClassName="!w-full !h-11 !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !rounded-[10px] !px-3.5 !py-0 !text-(--text) !bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] !text-[0.88rem] !font-medium disabled:!opacity-60 disabled:!cursor-not-allowed"
              />
              <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                Choose the currency for course pricing.
              </p>
            </div>

            {/* Selling Price Field */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="selling-price"
                  className="text-(--text-secondary) text-[0.84rem] font-semibold"
                >
                  Selling price{" "}
                  <span className="text-[#ff5252] ml-0.5">*</span>
                </label>
                <PricingControlStatusIndicator
                  status={getPricingControlDisplayStatus(
                    "sellingPrice",
                  )}
                  testId="pricing-field-status-sellingPrice"
                />
              </div>
              <div className="relative flex items-center w-full">
                <span className="absolute left-3.5 text-(--muted) text-[0.9rem] font-semibold pointer-events-none">
                  {getCurrencySymbol(pricing.currency || "INR")}
                </span>
                <input
                  id="selling-price"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={
                    isSavingPricing ||
                    isPricingControlSaving("pricingType")
                  }
                  value={pricing.sellingPrice}
                  onChange={(e) =>
                    handleSellingPriceChange(e.target.value)
                  }
                  onBlur={() => {
                    void flushPricingPersistence();
                  }}
                  placeholder="1999"
                  className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                This is the price learners will pay. Enter 0 to make
                the course free.
              </p>
            </div>

            {/* Original Price Field */}
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="original-price"
                  className="text-(--text-secondary) text-[0.84rem] font-semibold"
                >
                  Original price
                </label>
                <PricingControlStatusIndicator
                  status={getPricingControlDisplayStatus(
                    "originalPrice",
                  )}
                  testId="pricing-field-status-originalPrice"
                />
              </div>
              <div className="relative flex items-center w-full">
                <span className="absolute left-3.5 text-(--muted) text-[0.9rem] font-semibold pointer-events-none">
                  {getCurrencySymbol(pricing.currency || "INR")}
                </span>
                <input
                  id="original-price"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={
                    isSavingPricing ||
                    isPricingControlSaving("pricingType")
                  }
                  value={pricing.originalPrice}
                  onChange={(e) =>
                    handleOriginalPriceChange(e.target.value)
                  }
                  onBlur={() => {
                    void flushPricingPersistence();
                  }}
                  placeholder="2999"
                  className="w-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] py-2.5 pr-3.5 pl-8 text-(--text) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-[0.9rem] font-semibold outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <p className="m-0 mt-1 text-(--muted) text-[0.78rem]">
                Optional. Shown struck through beside the selling
                price.
              </p>
            </div>

            {/* Dynamic Discount Calculation Badge */}
            {(() => {
              const sell = parseFloat(
                pricing.sellingPrice.replace(/,/g, ""),
              );
              const orig = parseFloat(
                pricing.originalPrice.replace(/,/g, ""),
              );
              let discountPercent = 0;
              let isValidDiscount = false;

              if (
                !isNaN(sell) &&
                !isNaN(orig) &&
                sell >= 0 &&
                orig > sell
              ) {
                discountPercent = Math.round(
                  ((orig - sell) / orig) * 100,
                );
                isValidDiscount = discountPercent > 0;
              }

              return (
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <div
                    className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border rounded-lg px-2.5 py-1.5 text-[0.80rem] font-bold transition-[border-color,background-color,color] duration-150 ease-out ${
                      isValidDiscount
                        ? "is-active border-green-500/40 text-green-400 bg-green-500/12"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                    }`}
                  >
                    <Tag
                      size={15}
                      weight="bold"
                      className="shrink-0"
                    />
                    <span className="whitespace-nowrap leading-none">
                      {isValidDiscount
                        ? `${discountPercent}% OFF`
                        : "0% OFF"}
                    </span>
                  </div>
                  <span className="text-(--muted) text-[0.8rem] leading-tight">
                    Discount is calculated automatically.
                  </span>
                  <Checkbox
                    id="pricing-show-discount-badge"
                    className="basis-full -ml-2.5"
                    checked={
                      isValidDiscount && pricing.showDiscountBadge
                    }
                    disabled={!isValidDiscount}
                    onCheckedChange={handleShowDiscountBadgeChange}
                    label="Show this discount as a badge on the course card"
                  />
                </div>
              );
            })()}
          </div>
          )}
        </div>
      </div>

      {/* Courses that come free with this one */}
      <CourseLinkedCoursesCard courseId={currentCourseId} />

      {/* Parts of this course sold on their own */}
      <CoursePartialAccessCard courseId={currentCourseId} />

      {/* Card 3: Quiz Pricing */}
      {setsQuizPricing && (
        <CourseQuizPricingCard
          courseId={currentCourseId}
          courseCurrency={pricing.currency || "INR"}
          onNavigateTab={(tab) => {
            const stepId = parseWizardTab(tab);
            if (stepId) void navigateToStep(stepId);
          }}
        />
      )}

      {/* Bottom Card: Coupons Banner */}
      <div className="flex items-center justify-between border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[14px] px-5.5 py-4 bg-(--surface) shadow-(--card-shadow) max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex w-9.5 h-9.5 items-center justify-center rounded-[10px] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shrink-0">
            <Info size={20} weight="bold" />
          </div>
          <div>
            <strong className="block mb-0.5 text-(--text) text-[0.92rem] font-[650]">
              Coupons
            </strong>
            <p className="m-0 text-(--muted) text-[0.82rem]">
              Create and manage coupon codes separately from the
              Coupons section.
            </p>
          </div>
        </div>

        <button
          type="button"
          style={{
            fontSize: "0.80rem",
            fontWeight: 700,
            height: "34px",
            borderRadius: "8px",
            gap: "6px",
            paddingLeft: "18px",
            paddingRight: "18px",
          }}
          className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] max-[768px]:w-full max-[768px]:justify-center"
          onClick={() => {
            if (!onNavigatePage) return;
            if (!currentCourseId) {
              onNavigatePage("/coupons/create");
              return;
            }
            const params = new URLSearchParams({
              courseId: currentCourseId,
            });
            params.set(
              "returnTo",
              `${window.location.pathname}${window.location.search}`,
            );
            onNavigatePage(`/coupons/create?${params.toString()}`);
          }}
        >
          Go to Coupons <ArrowUpRight size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}
