/** The price of a paid course said in full; see `CoursePriceBreakdown`. */
export interface CoursePriceBreakdownData {
  /**
   * On a sale: the marked price, the sale's amount off and its share, and
   * what the discount is called when it is not a sale ("Partial access
   * discount").
   */
  sale?: { marked: string; discount: string; label: string; name?: string };
  /** The price the coupon is taken off (the sale price on a sale). */
  beforeCoupon: string;
  /** The coupon in use: its code and its amount off ("₹500"). */
  coupon?: { code: string; discount: string };
  total: string;
  /** Text size for the total; long amounts take a smaller one. */
  totalSizeClassName: string;
}

const discountClasses =
  "m-0 text-right font-semibold whitespace-nowrap text-[color-mix(in_srgb,var(--success)_72%,var(--text))]";

/**
 * The price of a paid course said in full, as a small receipt: the price,
 * the sale's amount off in green, what is paid. A coupon adds one line of
 * its own and changes the total; nothing else in the bar moves or changes
 * its look. It is the same receipt at every width: on a wide bar it is the
 * left of two columns, with the coupon and the button on the right (see
 * `CoursePriceBar`), and stops at 26rem there so the total stays near its
 * label on a wide screen. (A green "You saved" strip under the total was
 * taken out at the user's request on 2026-10-15.)
 */
export function CoursePriceBreakdown({
  breakdown,
}: {
  breakdown: CoursePriceBreakdownData;
}) {
  const { sale, beforeCoupon, coupon, total, totalSizeClassName } = breakdown;
  const hasLines = Boolean(sale || coupon);

  return (
    <div className="flex min-w-0 flex-col gap-3 @2xl/price:max-w-104">
      {hasLines ? (
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[0.9rem] leading-tight">
          <dt className="text-(--muted)">Price</dt>
          <dd className="m-0 text-right whitespace-nowrap text-(--text)">
            {sale ? sale.marked : beforeCoupon}
          </dd>
          {sale ? (
            <>
              <dt className="min-w-0 truncate text-(--muted)">
                {sale.name ?? "Sale discount"} ({sale.label})
              </dt>
              <dd className={discountClasses}>−{sale.discount}</dd>
            </>
          ) : null}
          {coupon ? (
            <>
              <dt className="min-w-0 truncate text-(--muted)">
                Coupon discount ({coupon.code})
              </dt>
              <dd className={discountClasses}>−{coupon.discount}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <div
        className={`flex items-baseline justify-between gap-4 ${
          hasLines
            ? "border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-3"
            : ""
        }`}
      >
        <span className="text-[0.98rem] font-bold text-(--text)">
          Total payable
        </span>
        <span
          className={`leading-none font-[850] whitespace-nowrap text-(--text) ${totalSizeClassName}`}
        >
          {total}
        </span>
      </div>
    </div>
  );
}
