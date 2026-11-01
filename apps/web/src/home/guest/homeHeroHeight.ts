/**
 * How tall the home page's hero is where its copy lies beside the picture
 * (50rem of page and wider), the same for a visitor and for a signed-in
 * learner, so the page keeps its height when someone signs in on it.
 *
 * It is the learner's hero (see `heroSizeClasses` in
 * learner/learnerHeroLayout.ts, which places its copy and picture from it)
 * at 92%: a third of the page's width, between about 26.7rem and 31.3rem,
 * easing down on narrower pages to 23rem at 50rem. That is a little taller
 * than the visitor's copy alone needs and a little shorter than the
 * learner's used to be, which still leaves the learner's three parts room.
 * Set as `--hero-h` on the hero; written out in full because Tailwind only
 * makes classes it finds whole in the source.
 */
export const homeHeroHeightClasses =
  "@[50rem]/home:[--hero-h:calc(max(calc(clamp(25rem,17.85rem_+_14.3cqw,27rem)_+_clamp(27rem,40.22cqw_-_5rem,29rem)_-_27rem),min(33.4cqw,34rem))_*_0.92)] @[50rem]/home:min-h-(--hero-h)";

/**
 * How tall the picture is where the copy lies beside it, and how far its
 * right edge is drawn past the hero's: `--picture-h` and `--picture-shift`
 * (see `heroSizeClasses` in learner/learnerHeroLayout.ts for why).
 *
 * Shared, with `homeHeroPictureBesideCopyClasses`, by the visitor's hero
 * and the learner's, so that both show the desk, the mug and the laptop in
 * the same place: when someone signs in or out on the page only the copy
 * changes, and nothing behind it moves.
 */
export const homeHeroPictureSizeClasses = [
  "@[50rem]/home:[--picture-h:max(var(--hero-h),33.35cqw)]",
  "@[50rem]/home:[--picture-shift:min(calc(var(--picture-h)_*_0.216),max(0px,calc(var(--picture-h)_*_2.9985_-_100cqw)))]",
].join(" ");

/**
 * Where the picture is held where the copy lies beside it: its box made
 * wider than the hero by `--picture-shift` and the picture held to the
 * box's right edge (see `picturePlacementClasses` in
 * learner/learnerHeroLayout.ts). Important, to win over a hero's own crop
 * for narrower pages and over the picture's full width.
 */
export const homeHeroPictureBesideCopyClasses =
  "@[50rem]/home:w-[calc(100%_+_var(--picture-shift,0px))]! @[50rem]/home:max-w-none @[50rem]/home:object-[100%_center]!";
