import type { PricingRegion } from "@veolms/contracts";
import { useSyncExternalStore } from "react";

/**
 * Which of a course's prices this visitor sees: the rupee price in India
 * (and wherever the country is not known), the price for buyers outside
 * India everywhere else. Only the server can say, from the country the
 * request comes from (`GET /checkout/pricing-region`), so nothing is
 * guessed:
 *
 * - The document's head (see root.tsx) puts the answer it last had on the
 *   root as `data-price-region` before the first paint, and asks the server
 *   again at once, before the page's scripts have loaded.
 * - Until there is an answer (a first visit), a course with both prices
 *   shows a shimmer where its price goes (`CoursePriceSwitch`). Styles
 *   keyed on the attribute pick what shows, so the price appears as soon as
 *   the answer does, hydrated or not.
 * - Checkout is charged by the server's own reading of the country, so a
 *   visitor who has moved since sees the right amount before paying.
 */

export const PRICE_REGION_STORAGE_KEY = "veolms-price-region:v1";
export const PRICE_REGION_ROOT_ATTRIBUTE = "data-price-region";
const HEAD_START_GLOBAL = "__veoPriceRegion";

function startFromHead(config: {
  apiBase: string;
  storageKey: string;
  global: string;
}) {
  try {
    const root = document.documentElement;
    const isRegion = (value: unknown) =>
      value === "domestic" || value === "international";
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(config.storageKey);
    } catch {
      // Nothing remembered: the price waits for the answer.
    }
    if (isRegion(remembered)) root.dataset.priceRegion = remembered!;
    const settle = (region: string) => {
      root.dataset.priceRegion = region;
      try {
        localStorage.setItem(config.storageKey, region);
      } catch {
        // Asked again on the next visit.
      }
      return region;
    };
    // Cookies go only to the site's own address (the fetch default): an API
    // on another origin gets none, as it needs none, but one served under
    // the site (dev.veolms.org's /api, behind Cloudflare Access) is reached
    // only with the visitor's sign-in cookie. Without it the request never
    // reached the API there, and every visitor got the rupee price.
    (window as unknown as Record<string, unknown>)[config.global] = fetch(
      config.apiBase.replace(/\/+$/, "") + "/checkout/pricing-region",
      { credentials: "same-origin", headers: { Accept: "application/json" } },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (body) => {
          const region = body && body.data && body.data.region;
          if (isRegion(region)) return settle(region);
          throw new Error("No region");
        },
        () => {
          throw new Error("No region");
        },
      )
      .catch(() => {
        // No answer at all: the rupee price, which is also what the server
        // charges a buyer whose country it cannot tell. A remembered
        // answer stays.
        if (isRegion(root.dataset.priceRegion)) {
          return root.dataset.priceRegion;
        }
        root.dataset.priceRegion = "domestic";
        return "domestic";
      });
  } catch {
    document.documentElement.dataset.priceRegion = "domestic";
  }
}

/** Runs from the document's head (see root.tsx), before the page's code. */
export const getPriceRegionBootstrapScript = (apiBase: string) =>
  `(${startFromHead.toString()})(${JSON.stringify({
    apiBase,
    storageKey: PRICE_REGION_STORAGE_KEY,
    global: HEAD_START_GLOBAL,
  })});`;

function readPriceRegion(): PricingRegion | null {
  const value = document.documentElement.getAttribute(
    PRICE_REGION_ROOT_ATTRIBUTE,
  );
  return value === "domestic" || value === "international" ? value : null;
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [PRICE_REGION_ROOT_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

/**
 * The visitor's region once known, null before (and while a prerendered
 * page hydrates). For code that acts on it, such as which amount a
 * checkout shows; what is drawn uses the attribute's styles instead.
 */
export function usePriceRegion(): PricingRegion | null {
  return useSyncExternalStore(subscribe, readPriceRegion, () => null);
}
