import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Ticket } from "@phosphor-icons/react/Ticket";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../../components/Button";
import {
  CourseCouponControl,
  type CourseCouponControlProps,
} from "./CourseCouponControl";
import {
  CoursePriceBreakdown,
  type CoursePriceBreakdownData,
} from "./CoursePriceBreakdown";
import type {
  CoursePurchaseGuarantee,
  CoursePurchasePerk,
} from "./coursePurchasePerks";
import { overviewCardClasses } from "./overviewStyles";
import { courseCardShimmerClass } from "../courseCardShimmer";
import { priceRegionClass } from "../CoursePriceSwitch";

export interface CoursePriceBarProps {
  /** Left out for someone who manages the course: they have nothing to buy. */
  price?: {
    label: string;
    /** Text size for the label; long amounts take a smaller one. */
    sizeClassName: string;
    struckThrough?: string;
    badge?: string;
    /**
     * A few words after the label, in small type: "with <course> course"
     * for a linked-only course, whose label is "Free".
     */
    note?: ReactNode;
    /**
     * The saving in `badge` is a coupon's (the course has no sale of its
     * own): it carries the same ticket a coupon's second badge does.
     */
    badgeIsCoupon?: boolean;
    /**
     * A coupon's saving on top of the one in `badge` (a course already on
     * sale). Shown after it with a plus sign and a ticket, as a second
     * saving and not a sum of the two.
     */
    couponBadge?: string;
  };
  /**
   * A paid course's price said in full (see `CoursePriceBreakdown`), shown
   * with `price` on a phone, and with a coupon in use beside the button.
   */
  priceBreakdown?: CoursePriceBreakdownData;
  /**
   * For a course that also has a price for buyers outside India, while the
   * box shows the course's own price: both prices, of which the visitor's
   * region shows one, and a shimmer of their size until it is known (see
   * `priceRegion.ts`). `price` and `priceBreakdown` are then the rupee ones.
   */
  regional?: {
    domestic: RegionalPriceView;
    international: RegionalPriceView;
  };
  /** Left out when no coupon can be used on this course. */
  coupon?: CourseCouponControlProps;
  /** A coupon problem to show under the bar. */
  couponError?: string | null;
  action: {
    label: string;
    icon: ReactNode;
    disabled: boolean;
    onClick?: () => void;
    /**
     * Makes the action a link to another page, drawn as one: a quieter
     * outlined box with `eyebrow` over `label` and an arrow, not the filled
     * button that acts on this page. `onClick` then runs for a plain
     * click only, so a new tab still opens the address.
     */
    link?: { href: string; eyebrow: string };
  };
  /** Shown in place of the coupon and the button when enrolment is closed. */
  closedMessage?: string;
  notice?: string | null;
  error?: string | null;
  onDismissError: () => void;
  /** "This course includes", under the button (`getCoursePurchasePerks`). */
  perks: readonly CoursePurchasePerk[];
  /**
   * The courses that come free with this one, first under "This course
   * includes" (see `IncludedCoursesList`).
   */
  includedCourses?: ReactNode;
  /** A small line right under the button: how the payment is made. */
  checkoutNote?: ReactNode;
  /** The green box at the foot of the card, for a course that is paid for. */
  guarantee?: CoursePurchaseGuarantee;
  /** A further row under the price, above the perks. */
  children?: ReactNode;
}

/** The price part of the bar for one region (see `CoursePriceBarProps.regional`). */
export interface RegionalPriceView {
  price: NonNullable<CoursePriceBarProps["price"]>;
  priceBreakdown?: CoursePriceBreakdownData;
}

/** A saving beside the price: the sale's, and a coupon's after it. */
const savingBadgeClasses =
  "inline-flex items-baseline rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-2.5 py-1.5 text-[0.8rem] leading-none font-bold whitespace-nowrap text-[color-mix(in_srgb,var(--success)_72%,var(--text))]";

/** The bar is a box on the page; it measures itself for its own layout. */
export const priceBarSurfaceClasses = `@container/price ${overviewCardClasses}`;
/**
 * For the box inside the bar, not the bar: a container query cannot style
 * the element it measures.
 */
export const priceBarPaddingClasses =
  "px-4 py-4 @2xl/price:px-6 @2xl/price:py-5";

/**
 * The bar's main button (Pay Now, Continue Learning, Edit course), on top
 * of the shared `Button`'s own classes: tall, lit from above with a
 * top-to-bottom shade of the accent, and glowing in it. It dims a little
 * under the pointer; it does not move.
 *
 * Its corners are rounder than an ordinary button's (11px). The roundness
 * preference sets every action button's radius from
 * `--control-radius-action`, with `!important`, so the button gives that
 * variable its own value; the plain `rounded` class is for when no
 * preference is set.
 */
export const priceBarActionClasses =
  "group/action h-14! min-w-32 rounded-[0.6875rem]! px-8! text-[1.05rem]! font-extrabold! tracking-[-0.01em] [--control-radius-action:0.6875rem] bg-linear-to-b! from-[color-mix(in_srgb,var(--accent)_90%,white)] to-[color-mix(in_srgb,var(--accent)_92%,black)] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_38%,transparent)]! hover:brightness-95";

/**
 * The coupon's place in the bar, whichever of its three forms is in it (the
 * "Have a coupon?" link, the field, the coupon in use). The place is the
 * same size for all three, so opening the field moves nothing else.
 *
 * Beside the button it starts at 17.5rem, enough for the field, and takes
 * what the button leaves. Where the two share the line with the price it
 * stops at 20rem and what is in it stands against the button; on a line of
 * their own there is no such limit, and what is in it starts under the
 * price (see `CourseCouponControl`, which reads this box's width to know
 * which: it is 20rem at most beside the price, and more on its own line).
 *
 * The limit is lifted by adding a length to it that is huge on a line of
 * their own and nothing beside the price: `max(0px, (100% - 100cqw + 3rem +
 * 2px) * 9999)`. The two cases are told apart by width alone. On a line of
 * their own the pair is as wide as the bar inside its padding (`100cqw`
 * less the 3rem of `priceBarPaddingClasses` at this width); beside the price
 * it is narrower by the price. `100%` is the pair's width, so this works
 * only on a child of the pair, and neither the pair nor anything between it
 * and the bar may be a container of its own. The 2px is for rounding.
 * (The classes are written out in full: Tailwind reads them from this file
 * as text and does not see one put together from parts.)
 */
const couponSlotClasses =
  "@container/coupon @md/price:min-w-0 @md/price:flex-[1_1_17.5rem] @2xl/price:max-w-[calc(20rem_+_max(0px,(100%_-_100cqw_+_3rem_+_2px)_*_9999))]";

/**
 * The button beside the coupon. It starts at 12.5rem ("Processing…" still
 * fits) and is the first to take whatever room the line has to spare, so it
 * is as wide as it can be before the coupon's place grows; it is the same
 * width whatever is in that place, and so never resized by the field
 * opening.
 *
 * It stops at 38% of a line it shares with the coupon only. Beside the
 * price it stops at 18rem instead; that swap uses the same length as the
 * coupon's place does (nothing beside the price, huge on a line of their
 * own).
 */
const buttonBesideCouponClasses =
  "@md/price:max-w-[max(12.5rem,38%)] @2xl/price:max-w-[max(calc(18rem_-_max(0px,(100%_-_100cqw_+_3rem_+_2px)_*_9999)),min(max(12.5rem,38%),max(0px,(100%_-_100cqw_+_3rem_+_2px)_*_9999)))]";

/**
 * The button with no coupon beside it: 18rem at most beside the price, and
 * the whole of a line it has to itself.
 */
const buttonAloneClasses =
  "@2xl/price:max-w-[calc(18rem_+_max(0px,(100%_-_100cqw_+_3rem_+_2px)_*_9999))]";

/**
 * How much of the bar's one row the coupon and the button ask for. The row
 * keeps them beside the price only if this much is left over; otherwise they
 * take the next line, in every state alike. It is what the widest state
 * needs (the open field at 17.5rem, the gap, the button at 12.5rem), asked
 * for while the field is still closed: the row used to hold until the field
 * was opened and only then break in two.
 *
 * A coupon in use needs less than the field. Without a coupon there is only
 * the button.
 */
const controlsReserveClasses = {
  field: "@2xl/price:flex-[1_1_31rem]",
  applied: "@2xl/price:flex-[1_1_28rem]",
  button: "@2xl/price:flex-[1_1_12.5rem]",
};

/**
 * The bar with the receipt (`CoursePriceBreakdown`): one column on a phone;
 * on a wide bar two, the receipt on the left and a narrow column with the
 * coupon over the button, both its full width. Where the bar has room to
 * spare (56rem) the space between them is the division; on a narrower one,
 * where the receipt runs up to the column, a thin rule stands between them.
 * A coupon then adds a line to the receipt and moves nothing else, as on a
 * phone. Between the two the coupon and the button share a line under the
 * receipt.
 */
const receiptLayoutClasses =
  "flex flex-col gap-3.5 @2xl/price:grid @2xl/price:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)] @2xl/price:items-center @2xl/price:gap-x-8";
const receiptActionsClasses =
  "grid grid-cols-1 gap-2.5 @md/price:flex @md/price:items-center @md/price:gap-4 @2xl/price:grid @2xl/price:grid-rows-[minmax(2.75rem,1fr)_auto] @2xl/price:gap-2.5 @2xl/price:self-stretch @2xl/price:border-l @2xl/price:border-[color-mix(in_srgb,var(--text)_10%,transparent)] @2xl/price:pl-8 @min-[56rem]/price:border-l-0 @min-[56rem]/price:pl-0";
/**
 * The coupon's place in that column: the column's full width (not the 20rem
 * it stops at beside the price) and the height left over above the button,
 * so an applied coupon stands as tall as the receipt beside it.
 */
const receiptCouponSlotClasses = "@2xl/price:h-full @2xl/price:max-w-none!";
/** The button in that narrow column: its full width. */
const receiptButtonClasses =
  "@md/price:max-w-[max(12.5rem,38%)] @2xl/price:w-full @2xl/price:max-w-none";

/** The price as the bar shows it; see `CoursePriceBarProps.price`. */
export type CoursePriceDisplayPrice = NonNullable<CoursePriceBarProps["price"]>;

/**
 * The price row of the bar: what is paid, the marked price struck through,
 * and the savings. Shared with the bar someone who manages the course sees,
 * so the price reads there exactly as a learner sees it.
 */
export function CoursePriceDisplay({
  price,
}: {
  price: CoursePriceDisplayPrice;
}) {
  return (
    // What is paid, in large type, comes first; then the marked
    // price struck through, then the saving in green (the user tried the
    // accent and went back). All of it stands on the large price's
    // baseline, the tags' words too (it was centred on the price's digits
    // until 2026-10-15).
    // With a coupon on top of the saving there is one tag more: on a
    // narrow card the prices come down a little, in step with the
    // card's width, and the two tags become one (below), so the row
    // stays on one line.
    <div
      className={`flex min-w-0 flex-wrap items-baseline gap-y-1.5 @2xl/price:shrink-0 @2xl/price:flex-nowrap ${
        price.couponBadge ? "gap-x-3 @max-[30rem]/price:gap-x-2" : "gap-x-3"
      }`}
    >
      <span
        className={`leading-none font-[850] whitespace-nowrap text-(--text) ${price.sizeClassName} ${
          price.couponBadge
            ? "@max-[30rem]/price:text-[clamp(1.45rem,7.4cqi,1.8rem)]!"
            : ""
        }`}
      >
        {price.label}
      </span>
      {price.note && (
        <span className="min-w-0 text-[0.95rem] leading-snug font-semibold text-(--text-secondary)">
          {price.note}
        </span>
      )}
      {price.struckThrough && (
        <span
          className={`text-[1.1rem] leading-none font-medium whitespace-nowrap text-(--muted) line-through ${
            price.couponBadge
              ? "@max-[30rem]/price:text-[clamp(0.85rem,4.2cqi,1rem)]"
              : ""
          }`}
        >
          {price.struckThrough}
        </span>
      )}
      {price.badge && (
        <span
          className={`${savingBadgeClasses} ${price.badgeIsCoupon ? "gap-1.5" : ""} ${
            price.couponBadge ? "@max-[30rem]/price:hidden" : ""
          }`}
        >
          {price.badgeIsCoupon && (
            <>
              <Ticket
                size={14}
                weight="fill"
                className="-my-1 self-center"
                aria-hidden="true"
              />
              <span className="sr-only">With the coupon, </span>
            </>
          )}
          {price.badge}
        </span>
      )}
      {price.couponBadge && price.badge && (
        // On a narrow card: the saving and the coupon's in one tag,
        // "50% + [coupon] 20% OFF", with "OFF" said once.
        <span
          className={`${savingBadgeClasses} hidden! gap-1 @max-[30rem]/price:inline-flex!`}
        >
          <span className="sr-only">
            {price.badge}, plus, with the coupon, {price.couponBadge}
          </span>
          <span aria-hidden="true" className="inline-flex items-baseline gap-1">
            {price.badge.replace(/\s*off$/i, "")}
            <span className="text-(--muted)">+</span>
            <Ticket size={13} weight="fill" className="-my-1 self-center" />
            {price.couponBadge}
          </span>
        </span>
      )}
      {price.couponBadge && (
        <span
          className={`-ml-1 inline-flex items-baseline gap-2 ${
            price.badge ? "@max-[30rem]/price:hidden" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className="text-[0.95rem] leading-none font-bold text-(--muted)"
          >
            +
          </span>
          <span className={`${savingBadgeClasses} gap-1.5`}>
            <Ticket
              size={14}
              weight="fill"
              className="-my-1 self-center"
              aria-hidden="true"
            />
            <span className="sr-only">plus, with the coupon, </span>
            {price.couponBadge}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The course's price, the coupon and the button that buys or opens it, in one
 * row where the bar has room for all of it with the coupon field open. With
 * less room the coupon and the button take a second line from the start, and
 * on a phone each takes a line.
 */
export function CoursePriceBar({
  price,
  priceBreakdown,
  regional,
  coupon,
  couponError,
  action,
  closedMessage,
  notice,
  error,
  onDismissError,
  perks,
  includedCourses,
  checkoutNote,
  guarantee,
  children,
}: CoursePriceBarProps) {
  const receipt = Boolean(price && priceBreakdown);
  const couponFieldOpen = Boolean(
    coupon && coupon.isOpen && !coupon.applied && !closedMessage,
  );
  return (
    <section
      className={priceBarSurfaceClasses}
      aria-label="Course pricing and enrollment"
      data-fixed-radius
    >
      <div className={`${priceBarPaddingClasses} flex flex-col gap-3.5`}>
        {/* One row once the bar is wide enough for the price and what the
          coupon and the button ask for (`controlsReserveClasses`); if not,
          those two take the next line, whatever the coupon's state. */}
        <div
          className={
            receipt
              ? receiptLayoutClasses
              : "flex flex-col gap-x-6 gap-y-3.5 @2xl/price:flex-row @2xl/price:flex-wrap @2xl/price:items-center @2xl/price:justify-between"
          }
        >
          {regional ? (
            <>
              {/* The rupee price laid out unseen under the shimmer, so the
                  box is the height it will be. */}
              <div
                aria-hidden="true"
                className={`${priceRegionClass("pending", "block")} relative min-w-0`}
              >
                <div className="invisible">
                  <RegionalPrice view={regional.domestic} receipt={receipt} />
                </div>
                <div
                  className={`absolute inset-0 rounded-lg ${courseCardShimmerClass}`}
                />
              </div>
              <div
                className={`${priceRegionClass("domestic", "block")} min-w-0`}
              >
                <RegionalPrice view={regional.domestic} receipt={receipt} />
              </div>
              <div
                className={`${priceRegionClass("international", "block")} min-w-0`}
              >
                <RegionalPrice
                  view={regional.international}
                  receipt={receipt}
                />
              </div>
            </>
          ) : receipt && priceBreakdown ? (
            <CoursePriceBreakdown breakdown={priceBreakdown} />
          ) : price ? (
            <CoursePriceDisplay price={price} />
          ) : null}

          {closedMessage ? (
            <p className="m-0 text-[0.88rem] leading-snug font-medium text-(--text-secondary)">
              {closedMessage}
            </p>
          ) : (
            <div
              className={
                receipt
                  ? receiptActionsClasses
                  : `grid grid-cols-1 gap-2.5 @md/price:flex @md/price:items-center @2xl/price:min-w-0 @2xl/price:justify-end @2xl/price:gap-4 ${
                      controlsReserveClasses[
                        coupon
                          ? coupon.applied
                            ? "applied"
                            : "field"
                          : "button"
                      ]
                    }`
              }
            >
              {coupon ? (
                <div
                  className={`${couponSlotClasses} ${receipt ? receiptCouponSlotClasses : ""}`}
                >
                  <CourseCouponControl
                    {...coupon}
                    error={couponError}
                    stackedOnWide={receipt}
                  />
                </div>
              ) : null}
              {/* With no price beside it and no coupon either, the button
                  takes the whole bar. */}
              {/* It stays put under the pointer: it darkens, its glow
                  grows and its icon fills in. */}
              {action.link ? (
                <PriceBarLinkAction
                  href={action.link.href}
                  eyebrow={action.link.eyebrow}
                  label={action.label}
                  onClick={action.onClick}
                />
              ) : (
                <Button
                  motion="static"
                  className={`${priceBarActionClasses} @md/price:min-w-50 @md/price:flex-[9999_1_12.5rem] ${
                    receipt
                      ? receiptButtonClasses
                      : coupon
                        ? buttonBesideCouponClasses
                        : price
                          ? buttonAloneClasses
                          : ""
                  }`}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.icon}
                  <span className="truncate">{action.label}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {checkoutNote && !closedMessage ? (
          <p className="-mt-1 m-0 flex items-center justify-center gap-1.5 text-center text-[0.8rem] text-(--muted)">
            <LockSimple size={15} className="shrink-0" aria-hidden="true" />
            {checkoutNote}
          </p>
        ) : null}

        {/* A refused code is said beside the field while it is open (see
            `CourseCouponControl`). This line is for what is said with the
            field closed: a coupon that had to be taken off again. */}
        {couponError && !couponFieldOpen && (
          <p role="alert" className="m-0 text-xs font-semibold text-rose-500">
            {couponError}
          </p>
        )}

        {children}

        {/* Payment received, access still being confirmed */}
        {notice && (
          <div
            role="status"
            className="w-full rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-2.5 text-xs font-medium text-(--text)"
          >
            {notice}
          </div>
        )}

        {/* Something went wrong, or the payment was not finished. Said in
            the page's own text colour at a readable size: red type on a red
            tint was hard to read, and most of these are not alarms (the
            commonest is a closed payment window). The amber sign carries
            the "look here". */}
        {error && (
          <div
            role="alert"
            className="flex w-full items-start gap-3 rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] py-3 pr-2.5 pl-3.5 text-[0.88rem] leading-snug text-(--text)"
          >
            <WarningCircle
              size={20}
              weight="fill"
              className="mt-px shrink-0 text-amber-500"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="-my-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
              aria-label="Dismiss message"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        )}

        {/* What comes with the course, as a section of its own under the
            button: a thin rule, a heading, and one line each with a large
            icon in a tinted square, a title and a quieter line under it.
            One column in the narrow card (a phone, or the column beside the
            curriculum), two where the bar is wide. The money-back promise
            closes it, in green. */}
        {perks.length > 0 || includedCourses || guarantee ? (
          <div className="mt-1 flex flex-col gap-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-5">
            {perks.length > 0 || includedCourses ? (
              <>
                <h3 className="m-0 text-[1.05rem] leading-tight font-bold text-(--text)">
                  This course includes
                </h3>
                {includedCourses}
                <ul className="m-0 grid list-none gap-x-6 gap-y-4 p-0 @2xl/price:grid-cols-2">
                  {perks.map(
                    ({ title, detail, icon: PerkIcon, iconWeight, tone }) => (
                      <li
                        key={title}
                        className="flex min-w-0 items-start gap-3.5"
                      >
                        <span
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--perk-tone)_15%,transparent)] text-(--perk-tone)"
                          style={{ "--perk-tone": tone } as CSSProperties}
                        >
                          <PerkIcon
                            size={24}
                            weight={iconWeight ?? "duotone"}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                          <span className="text-[0.95rem] leading-snug font-semibold text-(--text)">
                            {title}
                          </span>
                          {detail ? (
                            <span className="text-[0.84rem] leading-snug text-(--muted)">
                              {detail}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </>
            ) : null}
            {guarantee ? (
              <div className="flex items-start gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_9%,transparent)] px-4 py-3.5">
                <ShieldCheck
                  size={26}
                  weight="duotone"
                  className="mt-0.5 shrink-0 text-[color-mix(in_srgb,var(--success)_80%,var(--text))]"
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[0.95rem] leading-snug font-bold text-[color-mix(in_srgb,var(--success)_80%,var(--text))]">
                    {guarantee.title}
                  </span>
                  <span className="text-[0.84rem] leading-snug text-(--muted)">
                    {guarantee.detail}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The bar's action when it leads to another page (a linked-only course
 * sends its visitor to the course it comes with): a link, outlined rather
 * than filled, with a small line over the course's name and an arrow, so
 * it reads as going somewhere and not as buying here.
 */
function PriceBarLinkAction({
  href,
  eyebrow,
  label,
  onClick,
}: {
  href: string;
  eyebrow: string;
  label: string;
  onClick?: () => void;
}) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onClick ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onClick();
  };
  return (
    <a
      href={href}
      onClick={open}
      className="group/link flex min-h-14 w-full min-w-0 items-center justify-between gap-4 rounded-[0.6875rem] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] py-2.5 pr-2.5 pl-4.5 text-left no-underline transition-colors duration-150 hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.78rem] leading-tight font-medium text-(--muted)">
          {eyebrow}
        </span>
        <span className="text-[1rem] leading-snug font-bold text-(--text)">
          {label}
        </span>
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent)">
        <ArrowRight size={17} weight="bold" aria-hidden="true" />
      </span>
    </a>
  );
}

/** One region's price, drawn as the bar draws its only one. */
function RegionalPrice({
  view,
  receipt,
}: {
  view: RegionalPriceView;
  receipt: boolean;
}) {
  return receipt && view.priceBreakdown ? (
    <CoursePriceBreakdown breakdown={view.priceBreakdown} />
  ) : (
    <CoursePriceDisplay price={view.price} />
  );
}
