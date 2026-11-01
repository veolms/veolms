import { config } from "../../../config.ts";

/**
 * The automatic price for buyers outside India: a course's rupee prices at
 * the day's exchange rate, rounded up to the next whole dollar less a cent
 * ($5.99, $64.99), so it never comes to less than the rupee price. $1.99 at
 * the least. The marked price is worked out the same way; with no discount
 * in rupees there is none in dollars either.
 */
export function automaticInternationalPrice(input: {
  /** What the course sells for, in whole rupees. */
  salePrice: number;
  /** Its marked price, in whole rupees (equal to `salePrice` for no discount). */
  price: number;
  inrPerUsd: number;
}): { currency: "USD"; priceMinor: number; salePriceMinor: number } {
  const toCents = (rupees: number) =>
    Math.max(2, Math.ceil(rupees / input.inrPerUsd)) * 100 - 1;
  const salePriceMinor = toCents(input.salePrice);
  const priceMinor =
    input.price > input.salePrice
      ? Math.max(salePriceMinor, toCents(input.price))
      : salePriceMinor;
  return { currency: "USD", priceMinor, salePriceMinor };
}

/** How long a fetched rate is used before it is asked for again. */
const RATE_KEPT_MS = 6 * 60 * 60 * 1000;
const RATE_REQUEST_TIMEOUT_MS = 5000;

/**
 * Public sources of the day's USD/INR rate, asked in turn. Each gives
 * rupees per dollar, or nothing.
 */
const RATE_SOURCES: ReadonlyArray<{
  url: string;
  read: (body: unknown) => unknown;
}> = [
  {
    // European Central Bank reference rates, through Frankfurter.
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR",
    read: (body) => (body as { rates?: { INR?: unknown } })?.rates?.INR,
  },
  {
    url: "https://open.er-api.com/v6/latest/USD",
    read: (body) => (body as { rates?: { INR?: unknown } })?.rates?.INR,
  },
];

/** A rate outside this range is a broken answer, not a market move. */
function isPlausibleRate(rate: unknown): rate is number {
  return typeof rate === "number" && rate > 40 && rate < 400;
}

export interface ExchangeRates {
  /**
   * Rupees per dollar today: INTERNATIONAL_PRICE_INR_PER_USD when set,
   * otherwise fetched (and kept for a few hours). Null when no source
   * answers and none was fetched before.
   */
  inrPerUsd(): Promise<number | null>;
}

export function createExchangeRates({
  fixedRate = config.INTERNATIONAL_PRICE_INR_PER_USD,
  fetchImpl = fetch,
  now = () => Date.now(),
}: {
  fixedRate?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): ExchangeRates {
  let kept: { rate: number; at: number } | null = null;

  async function fetchRate(): Promise<number | null> {
    for (const source of RATE_SOURCES) {
      try {
        const response = await fetchImpl(source.url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(RATE_REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) continue;
        const rate = source.read(await response.json());
        if (isPlausibleRate(rate)) return rate;
      } catch {
        // The next source.
      }
    }
    return null;
  }

  return {
    async inrPerUsd() {
      if (fixedRate) return fixedRate;
      if (kept && now() - kept.at < RATE_KEPT_MS) return kept.rate;
      const rate = await fetchRate();
      if (rate !== null) {
        kept = { rate, at: now() };
        return rate;
      }
      // An older rate is better than none.
      return kept?.rate ?? null;
    },
  };
}

/** One per process, so the rate is fetched once for every course saved. */
export const exchangeRates: ExchangeRates = createExchangeRates();
