import {
  guestHomeGutter,
  guestHomeGutterBleed,
} from "../guest/guestHomeSpacing";
import {
  homeHeroHeightClasses,
  homeHeroPictureSizeClasses,
} from "../guest/homeHeroHeight";

/**
 * The band the picture gets on a page too narrow to show it beside the copy:
 * it runs edge to edge under the copy, its top faded into the hero so the
 * copy seems to stand against the same wall. Its bottom is the hero's own
 * edge.
 *
 * A phone has no band: the goals the laptop would show have a card of their
 * own there (see `LearnerGoalCard`), and the picture is only a glow
 * behind the copy (see `phoneBackdropClasses`).
 */
export const pictureBandClasses = [
  "pointer-events-none! relative mt-1 self-stretch max-sm:hidden",
  guestHomeGutterBleed,
  "@max-[50rem]/home:h-60 @max-[50rem]/home:sm:h-[clamp(20rem,46cqw,23rem)]",
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(to_bottom,#050915_0,rgb(5_9_21/0.5)_18%,transparent_42%)]",
  "[:root[data-theme=light]_&]:before:bg-[linear-gradient(to_bottom,#f4ecdf_0,rgb(244_236_223/0.55)_18%,transparent_42%)]",
  "@[50rem]/home:static @[50rem]/home:mx-0 @[50rem]/home:mt-0 @[50rem]/home:before:hidden",
].join(" ");

/**
 * How tall the hero is where the copy lies beside the picture, and how tall
 * the picture then is. Both are handed down as custom properties because the
 * copy is placed from them (see `copyOnDeskClasses`).
 *
 * The sizes in this comment are the formula's; the hero is drawn at 92% of
 * them, the height it shares with the visitor's hero (see
 * `homeHeroHeightClasses`). The hero is a third of its width tall, between
 * 29rem and 34rem. Under 85rem of page it eases down, to 27rem at 80rem and
 * narrower: the picture
 * covers the hero from its right edge, so a shorter hero draws the desk
 * smaller, and that is what leaves the copy room beside the mug and the
 * laptop.
 *
 * Under 64rem the hero eases down once more, to 25rem at 50rem, for the
 * same reason: it is what keeps the course's row off the laptop for as
 * long as possible on the narrowest pages that still lay the copy beside
 * the picture. The two slopes are added, each from its own resting height.
 *
 * The picture is as tall as the hero, or a third of the hero's width where
 * that is more (a very wide page, on which it is cropped top and bottom).
 *
 * `--picture-shift` is how far the picture's right edge is drawn past the
 * hero's (see `picturePlacementClasses`): 0.216 of the picture's height,
 * which is 144 of its own pixels, or as much of that as the picture has to
 * spare on the left. A page wide enough to show the whole picture has none
 * to spare and shows it as it is. The band of a page that stacks (a tablet
 * held upright) always has it to spare.
 */
export const heroSizeClasses = [
  "justify-start",
  // The hero's ground is the picture's own navy (or sunlit wall), so the
  // picture runs into it. A phone shows no picture, and there the ground is
  // the theme's own page colour instead, dark or light: a fixed navy was
  // seen as a blue corner in every palette that is not blue. Its last 6rem
  // fade out, so the hero runs into the page under it rather than ending
  // at a line.
  "max-sm:bg-transparent! max-sm:bg-[linear-gradient(to_bottom,var(--canvas)_calc(100%_-_6rem),transparent)]!",
  // The height itself, shared with the visitor's hero (92% of the sizes
  // described above).
  homeHeroHeightClasses,
  // The picture's size and shift beside the copy, shared with the visitor's
  // hero so the desk stands in the same place in both.
  homeHeroPictureSizeClasses,
  "@max-[50rem]/home:sm:[--picture-shift:calc(clamp(20rem,46cqw,23rem)_*_0.216)]",
].join(" ");

/**
 * Where the four pictures of the scene (night and day, lamp on and off) are
 * held. They share this, so the scene never moves between them.
 *
 * A phone has its own crop, which ends just past the laptop. Wider pages
 * draw the panorama, whose last tenth, to the right of the laptop, is the
 * lamp, the mouse and a shelf. Held to the hero's right edge, that left the
 * laptop well inside the hero on every page too narrow for the whole
 * picture, and the course's row lying over it. So the picture's box is made
 * wider than the hero by `--picture-shift` and the picture held to the
 * box's right edge: the same slice of the scene is past the hero's edge at
 * every size. The hero's edge falls just past the lid's top corner and
 * just before the mouse, which is not to be seen there; a third of the
 * lamp's shade is left to be switched.
 *
 * It is the box that is widened, not the picture that is moved: the
 * laptop's screen and the lamp's switch are placed by measuring the box and
 * the position in it (`heroPictureGeometry`), and follow. An image is held
 * to its container's width by default, which the wider box has to be let
 * out of.
 */
export const picturePlacementClasses =
  "object-[62%_center] sm:w-[calc(100%_+_var(--picture-shift,0px))]! sm:max-w-none sm:object-[100%_center]";

/**
 * The layer that deepens the picture behind the copy. Its stops are set
 * from where the laptop is rather than from the hero's width, so the
 * laptop's near edge is dimmed by the same small amount on every page: the
 * laptop's screen begins 1.05 picture heights in from the picture's right
 * edge, which is `--picture-shift` past the hero's, and the fade is spent
 * a little way past that.
 */
export const heroFadeClasses = [
  // Stacked (above a phone, under 50rem) the layer has no fade of its own:
  // it only carries the theme's tint (`heroThemeTintClasses`), turned to
  // run down from the top behind the copy and gone before the picture.
  "hidden sm:block @max-[50rem]/home:[--hero-tint-direction:to_bottom] @max-[50rem]/home:[--hero-tint-middle:28%] @max-[50rem]/home:[--hero-tint-end:58%]",
  "@[50rem]/home:bg-[linear-gradient(to_right,rgb(5_9_21/0.94)_0,rgb(5_9_21/0.8)_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_0.573),rgb(5_9_21/0.3)_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_0.978),transparent_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_1.28))]",
  "@[50rem]/home:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.72)_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_0.573),rgb(250_245_236/0.24)_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_0.944),transparent_calc((100%_-_var(--picture-h)_*_1.05_+_var(--picture-shift))_*_1.214))]",
].join(" ");

/**
 * Where the copy stands beside the picture: in the middle of the hero's
 * height, which is about the middle of the laptop's display, with the same
 * room between its three parts (the date and greeting, the quote, the
 * course's row). That room is a share of the hero's height, so a taller
 * hero spreads the copy further up and down.
 */
export const copyOnDeskClasses = [
  "flex w-full flex-col gap-y-4 max-sm:gap-y-5",
  "@[50rem]/home:min-h-(--hero-h) @[50rem]/home:justify-center",
  "@[50rem]/home:gap-y-[clamp(1.25rem,calc(var(--hero-h)_*_0.06),2rem)]",
].join(" ");

/**
 * The box the copy stands in. It lies over the picture without showing; it
 * lets the pointer through to the laptop, and only its own content takes it.
 */
export const heroCopyBoxClasses = `pointer-events-none flex w-full flex-col items-start pt-7 *:pointer-events-auto max-sm:pt-9 max-sm:pb-8 ${guestHomeGutter} @[50rem]/home:max-w-[min(57rem,calc(100cqw_-_var(--picture-h)))] @[50rem]/home:pt-0 @[50rem]/home:pr-0`;

/**
 * The greeting and the quote under it. Beside the picture the box is as
 * wide as the longer of the two, and never less than 22rem; the quote has a
 * width of its own (see `heroQuoteBoxClasses`) and may run on past the
 * greeting's end.
 */
export const heroGreetingBoxClasses =
  "flex min-w-0 flex-col gap-y-[inherit] @[50rem]/home:w-fit @[50rem]/home:max-w-full @[50rem]/home:min-w-[min(22rem,100%)]";

export const heroClockClasses =
  "text-xs leading-4 font-semibold tracking-[0.16em] text-slate-400 uppercase max-sm:text-(--muted)! [:root[data-theme=light]_&]:text-slate-600";

/**
 * The greeting's line is cut off rather than wrapped, and what cuts it off
 * also cuts whatever hangs out of the line's box. The font's letters are
 * 1.36 times its size from top to tail, so the box is made that tall (or the
 * "g" of a name loses its foot) and the margins take the extra back.
 */
export const heroGreetingClasses =
  "-mb-1 truncate text-[clamp(1.375rem,6.4cqw,2rem)] max-sm:text-[clamp(1.5rem,8cqw,2.125rem)] leading-[1.4] font-bold tracking-[-0.025em] @[50rem]/home:mt-0.5 @[50rem]/home:text-[clamp(1.75rem,3.5cqw,2.75rem)]";

/** The colour the learner's name is said in. */
export const heroNameClasses =
  "text-[color-mix(in_srgb,var(--accent)_66%,white)] [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))";

/**
 * The course is a thin row on a frosted surface: its thumbnail, what to do
 * and where the learner is, the course's title over its progress, and the
 * one action. The surface is the theme's own ground, the page's below the
 * hero, let through by a third, so it is dark with light words by night and
 * light with dark words by day. It has no border and no edge of any kind: a
 * soft shadow under it is all that sets it off the picture. While the lamp
 * is on, its warm light falls on the surface too.
 *
 * Beside the picture (a page 50rem or wider) the row blurs the desk behind
 * it and is only as wide as what is in it, so the action stands just past
 * the end of the title; a long title is cut off with an ellipsis once the
 * row would pass 35rem, or the room the hero has for it. Stacked, the row
 * takes the page's width. On a tablet nothing lies behind it but the hero's
 * plain ground, so it is not blurred; on a phone it lies over the backdrop's
 * lights (see `phoneBackdropClasses`) and blurs them, as frosted glass.
 *
 * The row lies in one line beside the picture, and wherever it is 28rem
 * wide or more. Narrower than that on a stacked page (a phone) the title
 * may take two lines and the action a line of its own, at full width.
 * Beside the picture on a page under 56rem, where the hero has little room
 * for the row and no height to spare, it keeps to one line and gives up its
 * Enter key instead (see `LearnerResumeRow`): as on a phone, the whole row
 * is then the one link, and the title is part of it.
 *
 * A row sized by what is in it cannot also be measured by what is in it, so
 * beside the picture it is not a container, and everything there is chosen
 * by the page's width alone.
 */
export const resumePaneClasses = [
  "relative isolate overflow-hidden rounded-[1.125rem] text-(--text) max-sm:rounded-[1.25rem]",
  // A phone lets a little more of the lights behind it through.
  "bg-[color-mix(in_srgb,var(--main-surface,var(--surface))_66%,transparent)] max-sm:bg-[color-mix(in_srgb,var(--main-surface,var(--surface))_52%,transparent)]",
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_14px_28px_-12px_rgb(0_0_0/0.45),0_30px_60px_-22px_rgb(0_0_0/0.6)] [:root[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_14px_28px_-12px_rgb(15_23_42/0.22),0_30px_60px_-22px_rgb(15_23_42/0.32)]",
  "max-sm:backdrop-blur-xl @[50rem]/home:backdrop-blur-xl",
].join(" ");

/**
 * The row's own box: as wide as the page when stacked, and as what is in it
 * beside the picture.
 */
export const resumeRowBoxClasses =
  "@container/resume relative w-full @[50rem]/home:w-fit @[50rem]/home:max-w-[min(35rem,100%)] @[50rem]/home:[container-type:normal]";

export const resumeRowContentClasses =
  "relative z-10 flex flex-wrap items-center gap-x-3.5 gap-y-3 p-3 @[28rem]/resume:flex-nowrap @[50rem]/home:flex-nowrap @[50rem]/home:p-2.5";

export const resumeThumbnailClasses =
  "block h-15 w-26 shrink-0 overflow-hidden rounded-[0.625rem]";

/**
 * A phone's hero has no picture band (see `pictureBandClasses`). Behind its
 * copy there is instead a glow from the hero's top right corner, spreading
 * down and to the left and gone long before the hero's foot (see
 * `LearnerPhoneBackdrop`).
 *
 * It is drawn in the theme's accent, so it is blue in one palette and green
 * or orange in another, and fainter by day. An accent that is nearly black
 * (some day palettes) is lifted first, or it would cast a shadow rather
 * than a light.
 */
export const phoneBackdropClasses = [
  "pointer-events-none! absolute inset-0 -z-30 sm:hidden",
  "[--glow:var(--accent)] supports-[color:oklch(from_white_l_c_h)]:[--glow:oklch(from_var(--accent)_max(l,0.62)_c_h)]",
  "bg-[radial-gradient(110%_55%_at_100%_0%,color-mix(in_srgb,var(--glow)_30%,transparent),color-mix(in_srgb,var(--glow)_12%,transparent)_40%,transparent_75%)]",
  // The glow is the lamp's light: it follows the lamp as the picture does,
  // on by night and off by day until the switch says otherwise (the corner
  // is the switch on a phone, see `HeroDesk`).
  "transition-opacity duration-300 motion-reduce:transition-none [[data-lamp=off]_&]:opacity-0",
  "[:root[data-theme=light]_&]:[--glow:var(--accent)] [:root[data-theme=light]_&]:opacity-0 [:root[data-theme=light]_[data-lamp=on]_&]:opacity-60",
].join(" ");

/**
 * The quote's size. It steps with the page at fixed widths and does not
 * scale with it. It is set on the quote's box so that the box can be sized
 * in the quote's own letters (see `heroQuoteBoxClasses`).
 *
 * Where the copy first stands beside the picture (50rem to 62rem of page)
 * there is little room before the laptop, and the quote is set smaller so
 * that its two lines still hold. A phone sets it smaller for the same
 * reason, though there the longest quotes take a third line.
 */
const heroQuoteSizeClasses =
  "text-lg @max-[30rem]/home:text-base @[50rem]/home:text-[0.9375rem] @[56rem]/home:text-base @[62rem]/home:text-lg @[72rem]/home:text-xl @[90rem]/home:text-[1.375rem]";

/**
 * The quote's box; a phone leaves the quote out. It is never wider than 28 times the quote's font size:
 * wide enough for the longest quote the rotation uses
 * (`DAILY_QUOTE_MAX_LENGTH` characters) to take two lines and no more, with
 * about a tenth to spare for a wider face than the one it was measured in.
 * Beside the picture it is as wide as the quote needs, up to that. A quote
 * is never set in three lines there; one too long for that is not used.
 *
 * The box is as tall as two lines and the author under them whatever the
 * quote, and a quote of one line stands in the middle of it. The copy is
 * centred in the hero, so a box that grew with the quote would move the
 * greeting above it and the course below it when the quote arrived: what
 * holds its place while it loads cannot know how long it will be.
 *
 * On a page with less room than that, the box ends 1.5rem short of the
 * laptop's lid instead. The lid stands 1.05 picture heights in from the
 * picture's right edge, which is `--picture-shift` past the hero's, and the
 * quote is level with it; the course's row below it is held back further,
 * by the laptop's base.
 */
export const heroQuoteBoxClasses = `max-sm:hidden flex min-h-[calc(2.6em_+_1.375rem)] max-w-[28em] min-w-0 flex-col justify-center ${heroQuoteSizeClasses} @[50rem]/home:w-max @[50rem]/home:max-w-[min(28em,calc(100cqw_-_var(--picture-h)_*_1.05_+_var(--picture-shift)_-_clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)_-_1.5rem))]`;

/**
 * The quote is set in lines of about the same length, so one that needs two
 * lines fills both rather than leaving a word on the second.
 */
export const heroQuoteClasses = "font-serif leading-[1.3] text-balance italic";
