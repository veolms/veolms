import type { ReactNode } from "react";

/**
 * A price drawn for both regions (see `priceRegion.ts`): the rupee one, the
 * one for buyers outside India, and a shimmer while it is not known yet
 * which this visitor sees. Styles keyed on the root's `data-price-region`
 * show exactly one, before the page's scripts have run as after, so a
 * prerendered page never shows one price and then the other.
 *
 * Each part sets its own display (`display` below) so it lays out as the
 * single price did. The selectors are written out in full because Tailwind
 * only generates classes it finds as text.
 */
export function CoursePriceSwitch({
  domestic,
  international,
  pending,
  display = "flex",
}: {
  domestic: ReactNode;
  international: ReactNode;
  /** What stands in until the region is known: a shimmer of the price's size. */
  pending: ReactNode;
  display?: "flex" | "block" | "inline" | "inline-flex";
}) {
  return (
    <>
      <PriceRegionPart show="pending" display={display}>
        {pending}
      </PriceRegionPart>
      <PriceRegionPart show="domestic" display={display}>
        {domestic}
      </PriceRegionPart>
      <PriceRegionPart show="international" display={display}>
        {international}
      </PriceRegionPart>
    </>
  );
}

const PART_CLASSES: Record<
  "pending" | "domestic" | "international",
  Record<"flex" | "block" | "inline" | "inline-flex", string>
> = {
  pending: {
    flex: "flex [:root[data-price-region]_&]:hidden",
    block: "block [:root[data-price-region]_&]:hidden",
    inline: "inline [:root[data-price-region]_&]:hidden",
    "inline-flex": "inline-flex [:root[data-price-region]_&]:hidden",
  },
  domestic: {
    flex: "hidden [:root[data-price-region=domestic]_&]:flex",
    block: "hidden [:root[data-price-region=domestic]_&]:block",
    inline: "hidden [:root[data-price-region=domestic]_&]:inline",
    "inline-flex": "hidden [:root[data-price-region=domestic]_&]:inline-flex",
  },
  international: {
    flex: "hidden [:root[data-price-region=international]_&]:flex",
    block: "hidden [:root[data-price-region=international]_&]:block",
    inline: "hidden [:root[data-price-region=international]_&]:inline",
    "inline-flex":
      "hidden [:root[data-price-region=international]_&]:inline-flex",
  },
};

/**
 * The classes that show an element only for one region (or only while the
 * region is unknown), for a caller that draws the part itself.
 */
export function priceRegionClass(
  show: "pending" | "domestic" | "international",
  display: "flex" | "block" | "inline" | "inline-flex" = "flex",
) {
  return PART_CLASSES[show][display];
}

function PriceRegionPart({
  show,
  display,
  children,
}: {
  show: "pending" | "domestic" | "international";
  display: "flex" | "block" | "inline" | "inline-flex";
  children: ReactNode;
}) {
  const Tag =
    display === "inline" || display === "inline-flex" ? "span" : "div";
  return (
    <Tag
      className={PART_CLASSES[show][display]}
      aria-hidden={show === "pending" ? true : undefined}
      data-price-region-part={show}
    >
      {children}
    </Tag>
  );
}
