import type { InternationalCoursePrice } from "@veolms/contracts";
import { formatMoney, toMajorUnits } from "@veolms/contracts/commerce/money";
import type { RegionalPriceView } from "./CoursePriceBar";
import { formatPriceWithCurrency } from "./coursePriceFormat";

/*
 * A course's price as the course page's price box words it, from the price
 * the API gives. Kept apart from the page so that the tab's kept prices
 * (`liveCoursePrices`) can word the box the same way for the next load's
 * first paint (see `coursePricesEarlyState`).
 */

export type PriceSizeVariant = "normal" | "medium" | "large" | "xlarge";

export function getPriceSizeVariant(priceStr: string): PriceSizeVariant {
  if (!priceStr || priceStr.toLowerCase() === "free") return "normal";
  const digitsOnly = priceStr.replace(/\D/g, "");
  const digitCount = digitsOnly.length;
  if (digitCount >= 8) return "xlarge";
  if (digitCount >= 6) return "large";
  if (digitCount === 5) return "medium";
  return "normal";
}

export const priceTextClasses: Record<PriceSizeVariant, string> = {
  normal: "text-[2.15rem] max-[640px]:text-[1.95rem] tracking-[-0.03em]",
  medium: "text-[1.95rem] max-[640px]:text-[1.75rem] tracking-[-0.025em]",
  large: "text-[1.75rem] max-[640px]:text-[1.55rem] tracking-[-0.02em]",
  xlarge: "text-[1.55rem] max-[640px]:text-[1.4rem] tracking-[-0.015em]",
};

export function isCourseSaleActive(
  salePrice: number | null | undefined,
  regularPrice: number,
  saleStartsAt?: string | null,
  saleEndsAt?: string | null,
): boolean {
  if (salePrice == null || salePrice <= 0 || salePrice >= regularPrice) {
    return false;
  }
  const now = new Date().getTime();
  if (saleStartsAt) {
    const starts = new Date(saleStartsAt).getTime();
    if (!isNaN(starts) && starts > now) {
      return false;
    }
  }
  if (saleEndsAt) {
    const ends = new Date(saleEndsAt).getTime();
    if (!isNaN(ends) && ends < now) {
      return false;
    }
  }
  return true;
}

export interface CourseOverviewPricingProps {
  price?: string;
  originalPrice?: string;
  discount?: string;
  /** Catalog charge in major currency units. */
  amount?: number;
  /** The marked price in major units, when `originalPrice` is shown. */
  originalAmount?: number;
  currency?: string;
  /** What the price box calls the discount, when it is not a sale. */
  discountName?: string;
  /**
   * The same at the course's price for buyers outside India, when it has
   * one: its amounts are major units with cents (43.99). Which of the two
   * a visitor sees is their region's (see `priceRegion.ts`).
   */
  international?: CourseOverviewPricingProps;
}

export function isFreeCoursePricing(
  pricing?: CourseOverviewPricingProps | null,
): boolean {
  if (!pricing) return true;
  if (typeof pricing.amount === "number") return pricing.amount <= 0;
  if (!pricing.price) return true;
  const p = pricing.price.trim().toLowerCase();
  if (p === "free" || p === "0") return true;
  return /^(?:[$₹€£]\s*0+(?:\.0+)?|0+(?:\.0+)?)$/.test(p);
}

export function toOverviewPricingProps(
  pr?: {
    pricingType: "free" | "paid";
    price: number;
    currency?: string;
    salePrice?: number | null;
    international?: InternationalCoursePrice | null;
  } | null,
): CourseOverviewPricingProps {
  const domestic = toDomesticOverviewPricingProps(pr);
  const international =
    pr?.pricingType === "paid" && pr.international
      ? toInternationalOverviewPricingProps(pr.international)
      : undefined;
  return international ? { ...domestic, international } : domestic;
}

/** A course's price for buyers outside India, as the price box shows it. */
function toInternationalOverviewPricingProps({
  currency,
  priceMinor,
  salePriceMinor,
}: InternationalCoursePrice): CourseOverviewPricingProps {
  const amount = toMajorUnits(salePriceMinor, currency);
  if (priceMinor <= salePriceMinor) {
    return {
      price: formatMoney(salePriceMinor, { currency }),
      amount,
      currency,
    };
  }
  return {
    price: formatMoney(salePriceMinor, { currency }),
    originalPrice: formatMoney(priceMinor, { currency }),
    discount: `${Math.round(((priceMinor - salePriceMinor) / priceMinor) * 100)}% OFF`,
    amount,
    originalAmount: toMajorUnits(priceMinor, currency),
    currency,
  };
}

function toDomesticOverviewPricingProps(
  pr?: {
    pricingType: "free" | "paid";
    price: number;
    currency?: string;
    salePrice?: number | null;
  } | null,
): CourseOverviewPricingProps {
  const currency = pr?.currency || "INR";
  if (!pr || pr.pricingType === "free") {
    // A free course that names what it would otherwise cost shows that
    // price struck through beside a price of zero.
    if (pr && pr.price > 0) {
      return {
        price: formatPriceWithCurrency(0, currency),
        originalPrice: formatPriceWithCurrency(pr.price, currency),
        discount: "Free",
        amount: 0,
        currency,
      };
    }
    return { price: "Free", amount: 0, currency };
  }

  const activeSale = isCourseSaleActive(pr.salePrice, pr.price);
  if (activeSale && pr.salePrice != null) {
    const discountPct = Math.round(
      ((pr.price - pr.salePrice) / pr.price) * 100,
    );
    return {
      price: formatPriceWithCurrency(pr.salePrice, currency),
      originalPrice: formatPriceWithCurrency(pr.price, currency),
      discount: `${discountPct}% OFF`,
      amount: pr.salePrice,
      originalAmount: pr.price,
      currency,
    };
  }

  return {
    price: formatPriceWithCurrency(pr.price, currency),
    amount: pr.price,
    currency,
  };
}

/**
 * A paid course's own price as the price box shows it with no coupon and
 * no amount of the buyer's own: the line and the full breakdown. The same
 * figures the purchase section works out for that case.
 */
export function coursePriceView(
  pricing: CourseOverviewPricingProps,
): RegionalPriceView {
  const label = pricing.price ?? "Free";
  const currency = pricing.currency ?? "INR";
  const amount = pricing.amount ?? 0;
  const sizeClassName = priceTextClasses[getPriceSizeVariant(label)];
  return {
    price: {
      label,
      sizeClassName,
      struckThrough: pricing.originalPrice,
      badge: pricing.discount,
    },
    priceBreakdown: {
      sale:
        pricing.originalPrice && pricing.discount && pricing.originalAmount
          ? {
              marked: pricing.originalPrice,
              discount: formatPriceWithCurrency(
                pricing.originalAmount - amount,
                currency,
              ),
              label: pricing.discount.replace(/\s*off$/i, "").trim() + " off",
              name: pricing.discountName,
            }
          : undefined,
      beforeCoupon: formatPriceWithCurrency(amount, currency),
      total: label,
      totalSizeClassName: sizeClassName,
    },
  };
}

/**
 * What the course page's price box says for a course's own price (no
 * coupon, no amount of the buyer's own), as text: kept with the tab's
 * prices so the next load's head can write it into the built page's box
 * before the page's scripts run (see `coursePricesEarlyState`).
 *
 * - `k`: "r" for a paid course's receipt (`CoursePriceBreakdown`), "l" for
 *   a free course's price line (`CoursePriceDisplay`).
 * - `t`: what is paid, and `z` the size it is written at.
 * - Receipt: `m` the marked price, `s` the sale's amount off with its minus
 *   sign and `l` the sale's line ("Sale discount (50% off)"), all empty
 *   when there is no sale.
 * - Line: `m` the price struck through and `x` the badge, empty if none.
 */
export interface EarlyPriceBoxWords {
  k: "r" | "l";
  t: string;
  z: PriceSizeVariant;
  m: string;
  s: string;
  l: string;
  x: string;
}

export function earlyPriceBoxWords(
  pricing: CourseOverviewPricingProps,
  paid: boolean,
): EarlyPriceBoxWords {
  const view = coursePriceView(pricing);
  const size = getPriceSizeVariant(view.price.label);
  if (!paid) {
    return {
      k: "l",
      t: view.price.label,
      z: size,
      m: view.price.struckThrough ?? "",
      s: "",
      l: "",
      x: view.price.badge ?? "",
    };
  }
  const sale = view.priceBreakdown?.sale;
  return {
    k: "r",
    t: view.priceBreakdown?.total ?? view.price.label,
    z: size,
    m: sale?.marked ?? "",
    s: sale ? `−${sale.discount}` : "",
    l: sale ? `${sale.name ?? "Sale discount"} (${sale.label})` : "",
    x: "",
  };
}
