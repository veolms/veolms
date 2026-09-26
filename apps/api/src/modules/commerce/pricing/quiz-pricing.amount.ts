export interface QuizPricingRow {
  pricing_type: "free" | "paid";
  price: number;
  sale_price: number | null;
}

export interface QuizCharge {
  isPaid: boolean;
  catalogPrice: number;
  salePrice: number | null;
  effectivePrice: number;
}

/**
 * Resolves what a quiz costs in a course. Whole major currency units.
 * A missing row means the quiz is free. A sale price only counts when it is
 * strictly lower than the catalog price.
 */
export function resolveQuizCharge(
  row: QuizPricingRow | null | undefined,
): QuizCharge {
  if (!row || row.pricing_type !== "paid" || row.price <= 0) {
    return {
      isPaid: false,
      catalogPrice: 0,
      salePrice: null,
      effectivePrice: 0,
    };
  }
  const salePrice =
    row.sale_price !== null &&
    row.sale_price > 0 &&
    row.sale_price < row.price
      ? row.sale_price
      : null;
  return {
    isPaid: true,
    catalogPrice: row.price,
    salePrice,
    effectivePrice: salePrice ?? row.price,
  };
}

