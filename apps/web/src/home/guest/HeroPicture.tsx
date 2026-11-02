import type { Ref } from "react";
import type { GuestHeroPicture } from "./guestHeroImage";

/** One of the hero's stacked pictures, in its phone and wide crops. */
export function HeroPicture({
  picture,
  position,
  className,
  priority = false,
  warmUp = false,
  whenShown = false,
  imageRef,
  onLoad,
  onError,
}: {
  picture: GuestHeroPicture;
  position: string;
  className: string;
  /** The picture the page is first painted with. */
  priority?: boolean;
  /**
   * A copy loaded ahead of need, behind everything else: fetched now (not
   * when it comes into view) and after what the page itself is loading.
   */
  warmUp?: boolean;
  /**
   * For a picture that some screens are not shown: fetched only once it is
   * laid out (a lazy image whose box is not drawn is never fetched, and one
   * that is drawn, even invisible, is fetched at once), at the priority the
   * two props above give it. Such a picture is preloaded from the page's
   * head where it is shown, so it is no later for this.
   */
  whenShown?: boolean;
  imageRef?: Ref<HTMLImageElement>;
  onLoad?: (image: HTMLImageElement) => void;
  onError?: () => void;
}) {
  return (
    <picture>
      <source
        media={picture.phone.media}
        srcSet={picture.phone.srcSet}
        sizes={picture.phone.sizes}
        width={picture.phone.width}
        height={picture.phone.height}
      />
      <img
        ref={imageRef}
        src={picture.wide.src}
        srcSet={picture.wide.srcSet}
        sizes={picture.wide.sizes}
        width={picture.wide.width}
        height={picture.wide.height}
        alt=""
        loading={(priority || warmUp) && !whenShown ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : warmUp ? "low" : undefined}
        decoding="async"
        onLoad={onLoad ? (event) => onLoad(event.currentTarget) : undefined}
        onError={onError}
        className={`absolute inset-x-0 top-0 h-full w-full object-cover ${position} ${className}`}
      />
    </picture>
  );
}

/**
 * A hero's copy is centred in the hero's height. A page built ahead of time
 * reaches the browser in pieces, and one that is drawn when only the first
 * of the copy has arrived centres that much, then moves it up as the rest
 * comes in. So where the copy is centred it is not drawn until the last of
 * it is there: `HeroCopyEnd` goes last in whatever carries one of these
 * classes. (A browser without `:has()` ignores the rule and draws the copy
 * as before.)
 *
 * Both the guest's hero and the learner's centre their copy where it stands
 * beside the picture.
 */
export const guestHeroCopyWhenComplete =
  "@[50rem]/home:[&:not(:has(>[data-hero-copy-end]))]:invisible";
export const learnerHeroCopyWhenComplete =
  "@[50rem]/home:[&:not(:has(>[data-hero-copy-end]))]:invisible";

export function HeroCopyEnd() {
  return <span data-hero-copy-end="" hidden />;
}

/**
 * The hero's own box, whatever stands in it: the picture's navy by night
 * (dark theme) and the sunlit wall by day.
 */
export const heroSceneClasses =
  "relative isolate flex flex-col overflow-clip bg-[#050915] text-white [:root[data-theme=light]_&]:bg-[#f4ecdf] [:root[data-theme=light]_&]:text-slate-900";

/**
 * A faint wash of the theme's accent over the side of the hero the copy
 * sits on, fading out towards the picture. It is kept light, a tint rather
 * than a colour, so the picture still shows through it. The picture and the fade that deepens it
 * are the same navy (by night) or cream (by day) whatever the theme, so
 * without it that side looks the same in every theme. It is drawn on the
 * fade's own layer, so it shows wherever that layer does and nowhere else.
 * It runs from the left; a hero whose copy is stacked above the picture
 * turns it with `--hero-tint-direction` and moves its stops with
 * `--hero-tint-middle` and `--hero-tint-end`.
 */
export const heroThemeTintClasses =
  "after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(var(--hero-tint-direction,to_right),color-mix(in_srgb,var(--accent)_18%,transparent)_0,color-mix(in_srgb,var(--accent)_8%,transparent)_var(--hero-tint-middle,38%),transparent_var(--hero-tint-end,65%))] [:root[data-theme=light]_&]:after:bg-[linear-gradient(var(--hero-tint-direction,to_right),color-mix(in_srgb,var(--accent)_14%,transparent)_0,color-mix(in_srgb,var(--accent)_6%,transparent)_var(--hero-tint-middle,38%),transparent_var(--hero-tint-end,65%))]";

/**
 * The hero's foot fades out into the page below it: the hero is masked to
 * clear over its bottom 4rem, gently at first (still 90% there after the
 * first rem, so the laptop above is barely touched) and then evenly to
 * nothing, so its picture, its ground and the layers over them all thin out
 * together and the page's own background shows through. Painting the page's colour over the foot
 * instead left a hairline wherever the hero ended between two device
 * pixels. The fade stays clear of the course row beside the picture, which
 * ends at least 4.1rem above the foot. A phone's hero already fades out by
 * itself.
 */
export const heroBottomFadeClasses =
  "sm:[mask-image:linear-gradient(to_bottom,black_calc(100%_-_4rem),rgb(0_0_0/0.9)_calc(100%_-_3rem),rgb(0_0_0/0.68)_calc(100%_-_2rem),rgb(0_0_0/0.36)_calc(100%_-_1rem),transparent)]";
