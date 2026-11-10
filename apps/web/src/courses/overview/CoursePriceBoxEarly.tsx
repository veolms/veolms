import { courseCardShimmerClass } from "../courseCardShimmer";
import { CoursePriceDisplay, savingBadgeClasses } from "./CoursePriceBar";
import { CoursePriceBreakdown, discountClasses } from "./CoursePriceBreakdown";
import { priceTextClasses, type PriceSizeVariant } from "./coursePriceView";

const sizes: readonly PriceSizeVariant[] = [
  "normal",
  "medium",
  "large",
  "xlarge",
];

/** A receipt as most paid courses have one, laid out unseen under the shimmer. */
const sampleReceipt = {
  sale: { marked: "₹00,000", discount: "₹0,000", label: "00% off" },
  beforeCoupon: "₹0,000",
  total: "₹0,000",
  totalSizeClassName: priceTextClasses.normal,
};

/** What is paid, at each size; the head shows the one the price needs. */
function EarlyAmount() {
  return sizes.map((size) => (
    <span
      key={size}
      data-course-early-box-size={size}
      className={`hidden leading-none font-[850] whitespace-nowrap text-(--text) ${priceTextClasses[size]} after:content-(--course-early-box-total)`}
    />
  ));
}

/**
 * The price in the course page's price box while the page does not know
 * it: a page is built with no price (see `liveCoursePrices`), and a page
 * opened before its access answer has none either.
 *
 * A shimmer the size of the price it stands for, and, hidden beside it,
 * the same price drawn from custom properties: when this tab kept the
 * course's price (`coursePriceView.earlyPriceBoxWords`), the document's head
 * writes its words and shows it in place of the shimmer before the page's
 * scripts run (`coursePricesEarlyState`), for the visitor's region. The box
 * then looks as it will once the page has the price, and nothing moves when
 * it does.
 *
 * `paid`: a paid course's receipt (`CoursePriceBreakdown`), or a free
 * course's price line (`CoursePriceDisplay`). Keep both looking like those.
 */
export function CoursePriceBoxEarly({ paid }: { paid: boolean }) {
  return paid ? (
    <>
      <div
        aria-hidden="true"
        className="relative min-w-0"
        data-course-early-box="pending-r"
      >
        <div className="invisible">
          <CoursePriceBreakdown breakdown={sampleReceipt} />
        </div>
        <div
          className={`absolute inset-0 rounded-lg ${courseCardShimmerClass}`}
        />
      </div>
      <div
        aria-hidden="true"
        className="hidden min-w-0 flex-col gap-3 @2xl/price:max-w-104"
        data-course-early-box="filled-r"
      >
        <dl
          className="m-0 hidden grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[0.9rem] leading-tight"
          data-course-early-box-part="marked"
        >
          <dt className="text-(--muted)">Price</dt>
          <dd className="m-0 text-right whitespace-nowrap text-(--text) after:content-(--course-early-box-marked)" />
          <dt className="min-w-0 truncate text-(--muted) after:content-(--course-early-box-sale)" />
          <dd
            className={`${discountClasses} after:content-(--course-early-box-saving)`}
          />
        </dl>
        <div
          className="flex items-baseline justify-between gap-4 border-t-0 border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-0"
          data-course-early-box-part="total"
        >
          <span className="text-[0.98rem] font-bold text-(--text)">
            Total payable
          </span>
          <EarlyAmount />
        </div>
      </div>
    </>
  ) : (
    <>
      <div
        aria-hidden="true"
        className="relative min-w-0"
        data-course-early-box="pending-l"
      >
        <div className="invisible">
          <CoursePriceDisplay
            price={{ label: "Free", sizeClassName: priceTextClasses.normal }}
          />
        </div>
        <div
          className={`absolute inset-0 rounded-lg ${courseCardShimmerClass}`}
        />
      </div>
      <div
        aria-hidden="true"
        className="hidden min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5 @2xl/price:shrink-0 @2xl/price:flex-nowrap"
        data-course-early-box="filled-l"
      >
        <EarlyAmount />
        <span
          className="hidden text-[1.1rem] leading-none font-medium whitespace-nowrap text-(--muted) line-through after:content-(--course-early-box-marked)"
          data-course-early-box-part="marked"
        />
        {/* Shown as `contents` by the head: the badge is then a flex item
            of the line, as the real one is. */}
        <span className="hidden" data-course-early-box-part="badge">
          <span
            className={`${savingBadgeClasses} after:content-(--course-early-box-badge)`}
          />
        </span>
      </div>
    </>
  );
}
