import { Check } from "@phosphor-icons/react/Check";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { Ticket } from "@phosphor-icons/react/Ticket";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";

export interface CourseCouponControlProps {
  /** The saving itself is shown beside the price, not repeated here. */
  applied: { code: string } | null;
  isOpen: boolean;
  code: string;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCodeChange: (code: string) => void;
  onApply: () => void;
  onRemove: () => void;
  /**
   * What is wrong with the code that was tried. While the field is open it
   * is said in a small note hanging from the field (a faint red fill and
   * a red mark, no outline), and the field's own edge turns a faint red.
   * The bar itself does not grow a line for it.
   */
  error?: string | null;
  /**
   * On a wide bar it stands over the button in a narrow column (the bar
   * with the receipt): as wide as the column and as thin as on a phone.
   */
  stackedOnWide?: boolean;
}

// The field a code is typed into. It fills the coupon's place in the bar
// (see `couponSlotClasses` in `CoursePriceBar`): above the buy button on a
// phone, beside it from a medium width. Beside the button it is the
// button's height (56px); stacked over it on a phone it is thinner (44px),
// so it reads as less important than the button. It has the button's
// corners (11px); the "Have a coupon?" link is the same shape.
const slotClasses = "flex h-11 items-center rounded-[0.6875rem] @md/price:h-14";
// Over the button in a narrow column on a wide bar (`stackedOnWide`).
const stackedSlotClasses = "@2xl/price:h-11";

// Where the link and the coupon in use stand in the coupon's place, which
// is wider than either. In a bar of one row the place ends at the buy
// button and they stand against that end, next to the button. Where the
// coupon and the button have a line of their own they start the line, under
// the price. The place tells which it is by its own width (`/coupon`): it
// is 20rem at most in the one row, and always more than that on a line of
// its own. (The link says the same for itself, with its own margin.)
const besideButtonClasses =
  "@2xl/price:ml-auto @2xl/price:@min-[20.05rem]/coupon:ml-0";

/**
 * What stands in the price bar's coupon place. It is one of three things:
 * a quiet "Have a coupon?" link, the field a code is typed into, or the
 * coupon that has been applied. The bar gives the place the same size for
 * all three.
 */
export function CourseCouponControl({
  applied,
  isOpen,
  code,
  busy,
  onOpen,
  onClose,
  onCodeChange,
  onApply,
  onRemove,
  error,
  stackedOnWide = false,
}: CourseCouponControlProps) {
  if (applied) {
    return (
      // A coupon in use is a small ticket, one line high: the code and
      // "Applied" on the stub, a perforation with a notch cut into each
      // edge, and the way to take it off again. The notches are dots in the
      // card's own colour (`--elevated-card`, set by the bar), so they read
      // as holes in the ticket.
      //
      // Beside the buy button it is only as wide as its code. Stacked above
      // it (a phone), it is as wide as the button under it and as tall as
      // the field and the link are there, so the button under them stays
      // where it is; the code stays at the start, and what it says moves to
      // the end of the stub and is said in full.
      <div
        className={`relative flex h-11 w-full max-w-full min-w-0 animate-in items-center rounded-[0.6875rem] bg-[color-mix(in_srgb,var(--success,#10b981)_13%,transparent)] text-(--text) duration-150 fade-in zoom-in-95 motion-reduce:animate-none @md/price:h-10 @md/price:w-fit ${
          stackedOnWide
            ? "@2xl/price:h-full @2xl/price:min-h-11 @2xl/price:w-full"
            : besideButtonClasses
        }`}
      >
        {/* No icon before the code: the notched shape already says
            "coupon". */}
        <span
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 pr-3 pl-3.5 @md/price:flex-none @md/price:justify-start ${
            stackedOnWide ? "@2xl/price:flex-1 @2xl/price:justify-between" : ""
          }`}
        >
          <span className="truncate text-[0.95rem] leading-none font-bold tracking-wider uppercase">
            {applied.code}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[0.82rem] leading-none font-semibold text-[color-mix(in_srgb,var(--success,#10b981)_72%,var(--text))]">
            <Check size={13} weight="bold" aria-hidden="true" />
            <span className="@md/price:hidden">Coupon applied</span>
            <span className="hidden @md/price:inline">
              <span className="sr-only">Coupon </span>
              Applied
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-full w-0 shrink-0 border-l border-dashed border-[color-mix(in_srgb,var(--success,#10b981)_45%,transparent)]"
        >
          <span className="absolute -top-[5px] left-[-0.5px] size-2.5 -translate-x-1/2 rounded-full bg-(--elevated-card,var(--surface))" />
          <span className="absolute -bottom-[5px] left-[-0.5px] size-2.5 -translate-x-1/2 rounded-full bg-(--elevated-card,var(--surface))" />
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="mx-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--muted) transition-colors hover:bg-rose-500/12 hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-(--accent)"
          aria-label="Remove coupon"
          title="Remove coupon"
        >
          <X size={15} weight="bold" />
        </button>
      </div>
    );
  }

  if (isOpen) {
    const canApply = !busy && Boolean(code.trim());
    return (
      // A plain field: a faint fill and a thin edge that takes the accent
      // while it is typed in. "Apply" is words in the field, not a second
      // filled button competing with the buy button beside it.
      // The box around it only places the note about a refused code: under
      // the field beside the buy button, over it when they are stacked (the
      // button is right under the field there).
      <div className="relative">
        {error ? (
          <p
            role="alert"
            className={`absolute bottom-[calc(100%+9px)] left-0 z-20 m-0 flex w-max max-w-full animate-in items-center gap-2 rounded-lg bg-(--coupon-note) px-3 py-2 text-[0.8rem] leading-snug font-semibold text-(--text) shadow-[0_10px_26px_-10px_rgb(0_0_0/0.55)] duration-150 [--coupon-note:color-mix(in_srgb,#f43f5e_18%,var(--surface))] fade-in @md/price:top-[calc(100%+9px)] @md/price:bottom-auto ${
              stackedOnWide
                ? "@2xl/price:top-auto @2xl/price:bottom-[calc(100%+9px)]"
                : ""
            }`}
          >
            {/* The note's pointer: a corner of the same box, turned, on the
                side that faces the field. */}
            <span
              aria-hidden="true"
              className={`absolute -bottom-[5px] left-5 size-2.5 rotate-45 bg-(--coupon-note) @md/price:-top-[5px] @md/price:bottom-auto ${
                stackedOnWide
                  ? "@2xl/price:top-auto @2xl/price:-bottom-[5px]"
                  : ""
              }`}
            />
            <WarningCircle
              size={16}
              weight="fill"
              className="shrink-0 text-rose-500"
              aria-hidden="true"
            />
            <span className="min-w-0">{error}</span>
          </p>
        ) : null}
        <div
          className={`${slotClasses} ${stackedOnWide ? stackedSlotClasses : ""} w-full gap-1 border pr-1.5 pl-3.5 transition-colors duration-140 ${
            // A refused code turns the field's edge red, as solid as the accent
            // edge it has while it is typed in (a see-through red read as a
            // thinner line), only a little softened towards the surface, and
            // gives its fill a trace of the same red.
            error
              ? "border-[color-mix(in_srgb,#f43f5e_78%,var(--surface))] bg-[color-mix(in_srgb,#f43f5e_8%,transparent)]"
              : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-within:border-(--accent)"
          }`}
        >
          {/* Filled for as long as the field is open, as the link's ticket
            is under the pointer. */}
          <Ticket
            size={19}
            weight="fill"
            className="mr-1.5 shrink-0 text-(--accent-ink,var(--accent))"
            aria-hidden="true"
          />
          <input
            type="text"
            value={code}
            onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApply();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Enter coupon code"
            // The page tells a paste into this field from one into any other
            // by this mark (see `tryPastedCoupon`).
            data-coupon-code-input=""
            disabled={busy}
            aria-label="Coupon code"
            autoComplete="off"
            spellCheck={false}
            className="h-full w-full min-w-0 border-0 bg-transparent text-[0.9rem] font-semibold tracking-wider text-(--text) uppercase outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-(--muted) placeholder:normal-case"
            autoFocus
          />
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            aria-label={busy ? "Applying coupon" : undefined}
            className="inline-flex h-8 min-w-14 shrink-0 cursor-pointer items-center justify-center rounded-md px-2.5 text-[0.86rem] font-bold whitespace-nowrap text-(--accent-ink,var(--accent)) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:text-(--muted) disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {busy ? (
              <CircleNotch
                size={15}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              "Apply"
            )}
          </button>
          <span
            aria-hidden="true"
            className="h-5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_12%,transparent)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            title="Cancel"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      // Beside the main button it is that button's height and has its
      // corners (11px), so the tint that comes up under the pointer is the
      // same shape. The roundness preference sets an action button's
      // radius from `--control-radius-action`, hence the mark and the
      // variable (see `priceBarActionClasses`).
      //
      // It is a quiet second action: no fill at rest, only a thin dashed
      // edge (the app's dashed border, as on its empty states), and a faint tint of the accent under the pointer,
      // stronger when pressed (no fill at rest since 2026-10-15).
      //
      // On a phone it is centred over the button, across the bar, and as
      // tall as the field that takes its place (44px, thinner than the
      // button). On a line it shares with
      // the button only, it starts the line, its tinted edge in line with
      // the price's first figure. (It was pulled back by its own padding to
      // put the ticket there while it had no tint at rest, until
      // 2026-10-15.)
      data-control-radius-action
      className={`group/coupon flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[0.6875rem] border border-dashed border-[color-mix(in_srgb,var(--text)_22%,transparent)] bg-transparent px-2 text-[0.9rem] font-semibold whitespace-nowrap text-(--accent-ink,var(--accent)) transition-colors duration-140 [--control-radius-action:0.6875rem] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] @md/price:h-14 @md/price:w-fit @md/price:px-4 ${
        stackedOnWide
          ? "@2xl/price:h-11 @2xl/price:w-full"
          : besideButtonClasses
      }`}
    >
      {/* The ticket is an outline at rest and filled in under the pointer,
          the keyboard's focus or a press. Both drawings are in the page,
          one over the other, so nothing moves when they swap. */}
      <span
        className="relative inline-flex size-[19px] shrink-0"
        aria-hidden="true"
      >
        <Ticket
          size={19}
          className="transition-opacity duration-140 group-hover/coupon:opacity-0 group-focus-visible/coupon:opacity-0 group-active/coupon:opacity-0 motion-reduce:transition-none"
        />
        <Ticket
          size={19}
          weight="fill"
          className="absolute inset-0 opacity-0 transition-opacity duration-140 group-hover/coupon:opacity-100 group-focus-visible/coupon:opacity-100 group-active/coupon:opacity-100 motion-reduce:transition-none"
        />
      </span>
      <span>Have a coupon?</span>
    </button>
  );
}
