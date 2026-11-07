import { useHomeFestive } from "../services/home";
import { DiwaliCoupon } from "./DiwaliCoupon";
import { DiwaliDiyaRow } from "./DiwaliDiyaRow";

/**
 * The Diwali offer in the phone's menu drawer, above its dock: the phone
 * has no sidebar, so this is where its offer is. The diyas and the fountain
 * (which fires rockets when pressed) over the coupon, on the same warm
 * light as in the sidebar. Shown while an admin has the festive offer on.
 */
export function DiwaliMenuOffer() {
  const festive = useHomeFestive().data;
  if (!festive?.enabled) return null;
  const { couponCode, couponNote } = festive;

  return (
    <section
      aria-label="Diwali offer"
      className="relative mx-auto w-full max-w-[19rem] px-4 pt-10 pb-4 text-center"
    >
      <span
        aria-hidden="true"
        // Larger than the offer and fading out well inside its own box
        // (closest-side), so no edge of the light is ever cut off.
        className="pointer-events-none absolute -inset-x-10 -top-10 -bottom-6 bg-[radial-gradient(closest-side,rgb(255_150_50/0.16),rgb(255_150_50/0.06)_50%,transparent)] [:root[data-theme=light]_&]:opacity-70"
      />
      <DiwaliDiyaRow />
      {couponCode ? (
        <DiwaliCoupon
          code={couponCode}
          note={couponNote}
          className="relative px-1 pt-6"
        />
      ) : null}
    </section>
  );
}
