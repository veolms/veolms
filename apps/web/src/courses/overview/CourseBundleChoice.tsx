import type { CourseBundleOffer } from "@veolms/contracts";
import { cn } from "../../lib/utils";
import type { CourseOverviewPricingProps } from "./coursePriceView";

const inr = (amount: number) =>
  `₹${Math.round(amount).toLocaleString("en-IN")}`;

/**
 * A chosen bundle as the price card shows a price: what this buyer pays,
 * against what the courses they don't own cost apart, with the saving as
 * its own figure (creator-features/bundles-in-checkout). Rupees only.
 */
export function bundlePricingView(
  offer: CourseBundleOffer,
): CourseOverviewPricingProps {
  const restApart = offer.charge + offer.saving;
  const percent =
    restApart > 0 ? Math.round((offer.saving / restApart) * 100) : 0;
  return {
    price: inr(offer.charge),
    amount: offer.charge,
    currency: offer.currency || "INR",
    ...(offer.saving > 0
      ? {
          originalPrice: inr(restApart),
          originalAmount: restApart,
          discount: `${percent}% OFF`,
          discountName: "Bundle saving",
        }
      : {}),
  };
}

/**
 * At the top of the price card: this course alone, or a bundle with it.
 * "This course" is chosen first; nothing is chosen for the buyer.
 */
export function CourseBundleChoice({
  courseTitle,
  coursePrice,
  offers,
  chosenId,
  onChoose,
  disabled = false,
}: {
  courseTitle: string;
  coursePrice: string;
  offers: readonly CourseBundleOffer[];
  chosenId: string | null;
  onChoose: (bundleId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What to buy"
      className="flex flex-col gap-2"
    >
      <Option
        checked={chosenId === null}
        onSelect={() => onChoose(null)}
        disabled={disabled}
        title="This course"
        price={coursePrice}
        line={courseTitle}
      />
      {offers.map((offer) => {
        const owned = offer.courses.filter((course) => course.owned);
        const others = offer.courses
          .filter((course) => !course.owned && course.title !== courseTitle)
          .map((course) => course.title);
        return (
          <Option
            key={offer.id}
            checked={chosenId === offer.id}
            onSelect={() => onChoose(offer.id)}
            disabled={disabled}
            title={owned.length > 0 ? "Complete the bundle" : offer.title}
            price={inr(offer.charge)}
            line={
              owned.length > 0
                ? `You own ${owned.map((course) => course.title).join(", ")}. Pay only for the rest.`
                : `This course + ${others.join(" + ")}`
            }
            saving={offer.saving > 0 ? `You save ${inr(offer.saving)}` : null}
          />
        );
      })}
    </div>
  );
}

function Option({
  checked,
  onSelect,
  disabled,
  title,
  price,
  line,
  saving = null,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
  title: string;
  price: string;
  line: string;
  saving?: string | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)] gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
        checked
          ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-4.5 items-center justify-center rounded-full border-2",
          checked
            ? "border-(--accent)"
            : "border-[color-mix(in_srgb,var(--text)_35%,transparent)]",
        )}
      >
        {checked ? (
          <span className="size-2 rounded-full bg-(--accent)" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[0.92rem] font-bold text-(--text)">
            {title}
          </span>
          <span className="shrink-0 text-[0.92rem] font-bold tabular-nums text-(--text)">
            {price}
          </span>
        </span>
        <span className="mt-0.5 block text-[0.8rem] leading-snug text-(--muted)">
          {line}
        </span>
        {saving ? (
          <span className="mt-1.5 inline-block rounded-full bg-emerald-500/12 px-2 py-0.5 text-[0.74rem] font-bold text-emerald-600 dark:text-emerald-400">
            {saving}
          </span>
        ) : null}
      </span>
    </button>
  );
}
