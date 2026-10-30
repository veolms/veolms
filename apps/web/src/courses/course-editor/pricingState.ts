// Pricing State Model & Normalization
export type PricingType = "free" | "paid";

export interface PricingFormState {
  pricingType: PricingType;
  sellingPrice: string;
  originalPrice: string;
  currency: string;
  /** Show the discount as a badge on the course's cards. Off by default. */
  showDiscountBadge: boolean;
  /**
   * Had only through another course's link: no price, not sold, not listed.
   * The price fields are kept out of the save while it is on.
   */
  linkedOnly: boolean;
}

export type PricingState = PricingFormState;

export const initialPricingState: PricingFormState = {
  pricingType: "paid",
  sellingPrice: "",
  originalPrice: "",
  currency: "INR",
  showDiscountBadge: false,
  linkedOnly: false,
};

/**
 * A course has one price. Selling it for zero is what makes it free: there
 * is no separate free/paid choice, so the type always follows the price.
 */
export const derivePricingType = (sellingPrice: string): PricingType =>
  parseFloat(sellingPrice.replace(/,/g, "").trim()) === 0 ? "free" : "paid";

export const normalizePricingState = (
  raw?: Partial<PricingFormState> | null,
): PricingFormState => {
  const sellingPrice = raw?.sellingPrice ? String(raw.sellingPrice).trim() : "";
  return {
    pricingType: derivePricingType(sellingPrice),
    sellingPrice,
    originalPrice: raw?.originalPrice ? String(raw.originalPrice).trim() : "",
    currency: raw?.currency ? String(raw.currency).trim() : "INR",
    showDiscountBadge: raw?.showDiscountBadge === true,
    linkedOnly: raw?.linkedOnly === true,
  };
};

/**
 * The badge needs a discount to announce: it only counts while the course
 * has an original price above what it sells for (which is zero when free).
 */
export const hasDiscountBadge = (state: PricingFormState): boolean =>
  state.showDiscountBadge && state.originalPrice.trim() !== "";

export const isPricingEqual = (
  a: PricingFormState,
  b: PricingFormState,
): boolean => {
  const normA = normalizePricingState(a);
  const normB = normalizePricingState(b);

  if (normA.currency !== normB.currency) return false;
  if (normA.linkedOnly !== normB.linkedOnly) return false;
  // A linked-only course has no price to compare.
  if (normA.linkedOnly) return true;

  return (
    normA.sellingPrice === normB.sellingPrice &&
    normA.originalPrice === normB.originalPrice &&
    hasDiscountBadge(normA) === hasDiscountBadge(normB)
  );
};

export function getCurrencyOptions(): Array<
  readonly [string, string, { searchKeywords?: string }?]
> {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    const codes =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("currency")
        : [
            "USD",
            "EUR",
            "GBP",
            "INR",
            "AUD",
            "CAD",
            "JPY",
            "CNY",
            "SGD",
            "NZD",
            "CHF",
            "AED",
          ];

    const list: Array<{ code: string; name: string; label: string }> = [];
    for (const code of codes) {
      try {
        const name = displayNames.of(code) || code;
        list.push({
          code,
          name,
          label: `${name} (${code})`,
        });
      } catch {
        list.push({
          code,
          name: code,
          label: `${code} (${code})`,
        });
      }
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    return list.map((item) => [
      item.code,
      item.label,
      { searchKeywords: `${item.code} ${item.name}` },
    ]);
  } catch {
    return [
      ["USD", "US Dollar (USD)", { searchKeywords: "USD US Dollar" }],
      ["EUR", "Euro (EUR)", { searchKeywords: "EUR Euro" }],
      ["GBP", "British Pound (GBP)", { searchKeywords: "GBP British Pound" }],
      ["INR", "Indian Rupee (INR)", { searchKeywords: "INR Indian Rupee" }],
    ];
  }
}

export function getCurrencySymbol(currencyCode: string): string {
  if (!currencyCode) return "₹";
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const symbolPart = parts.find((p) => p.type === "currency");
    return symbolPart ? symbolPart.value : currencyCode;
  } catch {
    const map: Record<string, string> = {
      INR: "₹",
      USD: "$",
      EUR: "€",
      GBP: "£",
      JPY: "¥",
      AUD: "A$",
      CAD: "CA$",
    };
    return map[currencyCode.toUpperCase()] || currencyCode;
  }
}

export function validatePricing(pricing: PricingState): {
  isValid: boolean;
  error: string | null;
} {
  // A linked-only course has no price.
  if (pricing.linkedOnly) return { isValid: true, error: null };

  const rawSell = pricing.sellingPrice.replace(/,/g, "").trim();
  const sellNum = parseFloat(rawSell);

  // Zero is a valid price: it makes the course free.
  if (!rawSell || isNaN(sellNum) || sellNum < 0) {
    return {
      isValid: false,
      error: "Please enter a selling price. Enter 0 to make the course free.",
    };
  }

  const rawOrig = pricing.originalPrice.replace(/,/g, "").trim();
  if (rawOrig) {
    const origNum = parseFloat(rawOrig);
    if (isNaN(origNum) || origNum <= 0) {
      return {
        isValid: false,
        error: "Original price must be a valid number greater than 0.",
      };
    }
    if (sellNum > origNum) {
      return {
        isValid: false,
        error: "Sale price cannot be greater than original price.",
      };
    }
  }

  return { isValid: true, error: null };
}

/**
 * A course always stores both prices: `salePrice`, what a learner pays, and
 * `price`, the marked price it is struck through from. With no original
 * price in the form the two are the same (no discount); a selling price of
 * zero makes the course free.
 */
export function buildPricingPayload(state: PricingFormState) {
  if (state.linkedOnly) {
    return {
      pricingType: "free" as const,
      price: 0,
      salePrice: 0,
      currency: state.currency || "INR",
      showDiscountBadge: false,
      linkedOnly: true,
    };
  }

  const rawSell = state.sellingPrice.replace(/,/g, "").trim();
  const rawOrig = state.originalPrice.replace(/,/g, "").trim();
  const sellNum = Math.round(parseFloat(rawSell));
  const origNum = rawOrig ? Math.round(parseFloat(rawOrig)) : null;

  const salePrice = isNaN(sellNum) ? 0 : sellNum;
  const price = origNum && origNum > salePrice ? origNum : salePrice;

  return {
    pricingType: salePrice === 0 ? ("free" as const) : ("paid" as const),
    price,
    salePrice,
    currency: state.currency || "INR",
    // A badge needs a discount to announce.
    showDiscountBadge: price > salePrice && state.showDiscountBadge,
    linkedOnly: false,
  };
}

/**
 * The form for a stored price. The original price is shown only when it is
 * above the selling price: equal ones mean no discount, and older rows that
 * stored the selling price alone are read the same way.
 */
export function pricingFormFromServer(pricing: {
  price: number;
  salePrice?: number | null;
  currency?: string | null;
  showDiscountBadge?: boolean | null;
  linkedOnly?: boolean | null;
}): PricingFormState {
  // A linked-only course's stored zeros are not a price: the fields start
  // empty, so turning it off asks for one before anything is saved.
  if (pricing.linkedOnly === true) {
    return normalizePricingState({
      currency: pricing.currency || "INR",
      linkedOnly: true,
    });
  }
  const salePrice = pricing.salePrice ?? pricing.price;
  return normalizePricingState({
    sellingPrice: String(salePrice),
    originalPrice: pricing.price > salePrice ? String(pricing.price) : "",
    currency: pricing.currency || "INR",
    showDiscountBadge: pricing.showDiscountBadge === true,
  });
}
