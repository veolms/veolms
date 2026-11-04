/**
 * Kept by `liveCoursePrices.ts` beside the prices: each one as the course
 * cards word it, for each region, so the head script below needs no
 * formatting of its own.
 */
export const COURSE_PRICE_LINES_STORAGE_KEY = "veolms-course-price-lines:v1";

/** Set on <html> by the head script when it drew kept prices. */
const EARLY_ATTRIBUTE = "data-course-prices-early";

interface EarlyPriceKeys {
  storageKey: string;
  attribute: string;
  styleId: string;
}

/**
 * Runs in the document head, before a built page is drawn. It is embedded
 * as text, so it reads nothing from outside itself but `keys`.
 *
 * A built course card has a shimmer where its price goes and, hidden
 * beside it, the price's parts with their words left to a style
 * (`data-course-early-price`, see `CourseCardEarlyPrice`). With prices
 * kept by this tab, this style fills in each card's words for the
 * visitor's region (`data-price-region`, set by `priceRegion.ts`) and
 * shows them in place of the shimmer: a reload draws the prices it last
 * had. Without a region or a kept price the shimmer stays.
 */
function applyEarlyCoursePrices(keys: EarlyPriceKeys) {
  try {
    const lines = JSON.parse(sessionStorage.getItem(keys.storageKey) || "null");
    if (!lines || typeof lines !== "object") return;
    const text = (value: unknown) =>
      '"' +
      String(value == null ? "" : value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, " ") +
      '"';
    let rules = "";
    for (const id of Object.keys(lines)) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      const entry = lines[id];
      if (!entry || !entry.d || typeof entry.d.p !== "string") continue;
      // A course with no price for buyers outside India costs them rupees.
      const byRegion: [string, { p: string; o: string; x: string }][] = [
        ["domestic", entry.d],
        ["international", entry.i || entry.d],
      ];
      for (const [region, line] of byRegion) {
        const scope =
          ":root[" +
          keys.attribute +
          "][data-price-region=" +
          region +
          '] [data-course-card-id="' +
          id +
          '"]';
        rules +=
          scope +
          "{--course-early-price:" +
          text(line.p) +
          ";--course-early-original:" +
          text(line.o) +
          ";--course-early-discount:" +
          text(line.x) +
          "}" +
          scope +
          " [data-course-early-price=pending]{display:none!important}" +
          scope +
          " [data-course-early-price=line]{display:flex!important}" +
          (line.o
            ? scope +
              " [data-course-early-price-part=original]{display:inline!important}"
            : "") +
          (line.x
            ? scope +
              " [data-course-early-price-part=discount]{display:inline-flex!important}"
            : "");
      }
    }
    if (!rules) return;
    const style = document.createElement("style");
    style.id = keys.styleId;
    style.textContent = rules;
    document.head.appendChild(style);
    document.documentElement.setAttribute(keys.attribute, "");
  } catch {
    // The shimmers stay until the page has the prices.
  }
}

export const getCoursePricesEarlyBootstrapScript = () =>
  `(${applyEarlyCoursePrices.toString()})(${JSON.stringify({
    storageKey: COURSE_PRICE_LINES_STORAGE_KEY,
    attribute: EARLY_ATTRIBUTE,
    styleId: "course-prices-early-state",
  } satisfies EarlyPriceKeys)});`;
