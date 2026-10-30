import { Play } from "@phosphor-icons/react/Play";
import type { LessonOpenIntent } from "../../learning/lessonOpenIntent";
import type { Course } from "../catalogue";
import { getCourseThumbnailSrcSet } from "../courseThumbnail";

interface CourseHeroArtworkProps {
  title: string;
  thumbnail: string;
  thumbnailSrcSet?: Course["thumbnailSrcSet"];
  /**
   * A wide picture that, once the hero is wide, fills all of it in place of
   * the thumbnail and its blurred wash. Stacked, the thumbnail stays.
   */
  banner?: string;
  bannerSrcSet?: Course["bannerSrcSet"];
  /** Opens the course's preview. Without it there is no play button. */
  onPreview?: () => void;
  previewDisabled?: boolean;
  /** The play button's name; "Open course" for someone who manages it. */
  previewLabel?: string;
  /** More classes for the play button (the hero hides it for some viewers). */
  previewClassName?: string;
  /**
   * The play button is shown only to someone who neither holds nor
   * manages the course: marked for the head's style (`courseCardEarlyState`),
   * which hides it on a course the learner holds.
   */
  previewDependsOnViewer?: boolean;
  /**
   * The hero keeps 1rem at its foot for the box that overlaps it there: the
   * picture, beside the text, stops above that strip so none of it is hidden.
   */
  footRoom?: boolean;
  /**
   * While the viewer is not known: the enrolled learner's play button as it
   * will be, drawn only on a course the head finds the learner holds
   * (`courseCardEarlyState`), and not pressable until the real one comes.
   */
  heldPlaceholder?: boolean;
  /** Readies the lesson the play button opens, ahead of the press. */
  previewIntent?: LessonOpenIntent["handlers"];
}

/** The round play button in the middle of the picture, while stacked. */
const centerPlayClasses =
  "absolute top-[44%] left-1/2 z-20 inline-flex size-15 -translate-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-black/40 text-white shadow-[0_8px_30px_rgb(0_0_0/0.3)] backdrop-blur-md transition-colors duration-160 ease-out hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:hover:bg-black/40 motion-reduce:transition-none @3xl/hero:hidden";

/**
 * The widest the picture is drawn: the hero's full width while it is stacked,
 * and 16:9 at the hero's height once it sits beside the text (the hero is
 * 16.5rem tall on a laptop and up to 21rem on a very wide monitor).
 */
const heroPictureSizes =
  "(min-width: 2200px) 600px, (min-width: 900px) 480px, 100vw";

/**
 * The banner is drawn at the hero's height in its own proportions: about
 * three times that height wide for the recommended 3:1 (the hero is at most
 * about 22rem tall).
 */
const heroBannerSizes = "(min-width: 2200px) 1100px, 900px";

/**
 * The hero's picture layers, all made from the course thumbnail:
 *
 * 1. a blurred, enlarged copy of the thumbnail that tints the hero with its
 *    colours (the smallest size on file is used; it is blurred anyway). It
 *    lies under the picture and spreads out from it, so on a hero much wider
 *    than the picture the colours fade away from the picture instead of the
 *    thumbnail's middle showing up as a patch in the hero's middle;
 * 2. a grid of dots, set wide apart (24px), lit from the top (beside the
 *    picture only; stacked, see 5.);
 * 3. the thumbnail itself, with no edge of its own: it dissolves into the
 *    wash, downwards while it sits above the text and leftwards once it sits
 *    beside it. Beside the text it is as tall as the hero and whole; in a
 *    hero too narrow for that it loses its left side, which is the faded one;
 * 4. a shade under the text so it reads on any thumbnail;
 * 5. stacked, the dot grid again over that shade, behind the text under the
 *    picture, as faint as the next one;
 * 6. beside the picture, the dot grid again over the whole text side, a
 *    good deal fainter, thinning out where the picture begins. It is a
 *    layer of its own, over the shade, which is solid there and hides the
 *    first grid; the first one is what shows faintly on the picture.
 *
 * With a banner, once wide, 1. and 3. give way to the banner: as tall as the
 * hero, whole from top to bottom, against its right edge and fading to the
 * left; the shade (4.) and the dot grids lie over it as they do over the
 * thumbnail, so the text still reads.
 *
 * The parent is the `@container/hero` these layers size themselves against.
 */
export function CourseHeroArtwork({
  title,
  thumbnail,
  thumbnailSrcSet,
  banner,
  bannerSrcSet,
  onPreview,
  previewDisabled = false,
  previewLabel = "Preview course",
  previewClassName = "",
  previewDependsOnViewer = false,
  footRoom = false,
  heldPlaceholder = false,
  previewIntent,
}: CourseHeroArtworkProps) {
  // A thumbnail from before sizes were kept has an empty list.
  const smallestVariant = thumbnailSrcSet?.length
    ? thumbnailSrcSet.reduce((smallest, variant) =>
        variant.width < smallest.width ? variant : smallest,
      )
    : undefined;
  // Classes for the thumbnail's layers that the banner replaces once wide.
  const bannerHides = banner ? "@3xl/hero:hidden" : "";

  return (
    <>
      {thumbnail ? (
        <img
          src={smallestVariant?.url ?? thumbnail}
          alt=""
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 size-full scale-125 object-cover object-right opacity-55 blur-3xl saturate-150 @3xl/hero:left-auto @3xl/hero:aspect-video @3xl/hero:w-auto @3xl/hero:max-w-[62%] @3xl/hero:origin-right @3xl/hero:scale-[1.7] ${bannerHides}`}
          decoding="async"
          fetchPriority="low"
        />
      ) : (
        // No thumbnail to take colours from: the accent lights the corner the
        // picture would have filled.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_85%_40%,color-mix(in_srgb,var(--accent)_45%,transparent),transparent_70%)]"
        />
      )}

      <div
        aria-hidden="true"
        // Stacked (a phone) the picture's own area is left plain: the dots
        // are behind the words under it instead (below).
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle,color-mix(in_srgb,var(--hero-ink)_20%,transparent)_1px,transparent_1.5px)] bg-size-[24px_24px] [mask-image:radial-gradient(110%_95%_at_58%_0%,black,transparent_74%)] @3xl/hero:block"
      />

      {banner ? (
        // Loaded lazily: stacked (a phone) it is display:none and never
        // fetched; wide it is the hero's picture. It is always as tall as
        // the hero and keeps its own proportions, against the right edge:
        // never cut at the top or bottom. A hero narrower than it cuts its
        // left side, which dissolves into the ground under the text; on a
        // wider one that ground carries on to its left.
        <img
          src={banner}
          srcSet={getCourseThumbnailSrcSet({ thumbnailSrcSet: bannerSrcSet })}
          sizes={heroBannerSizes}
          alt=""
          aria-hidden="true"
          className={`pointer-events-none absolute top-0 right-0 hidden h-full w-auto max-w-none [mask-image:linear-gradient(to_right,transparent,rgb(0_0_0/0.35)_14%,black_32%)] @3xl/hero:block ${
            footRoom ? "@3xl/hero:h-[calc(100%_-_1rem)]" : ""
          }`}
          loading="lazy"
          decoding="async"
        />
      ) : null}

      {thumbnail ? (
        <div
          className={`relative aspect-video w-full ${bannerHides} @3xl/hero:absolute @3xl/hero:inset-y-0 @3xl/hero:right-0 @3xl/hero:h-full @3xl/hero:w-auto @3xl/hero:max-w-[62%] ${
            footRoom
              ? "@3xl/hero:bottom-4! @3xl/hero:h-[calc(100%_-_1rem)]!"
              : ""
          }`}
        >
          <img
            src={thumbnail}
            srcSet={getCourseThumbnailSrcSet({ thumbnailSrcSet })}
            sizes={heroPictureSizes}
            alt={`Preview thumbnail for ${title}`}
            className="absolute inset-0 size-full object-cover object-right [mask-image:linear-gradient(to_bottom,black_52%,rgb(0_0_0/0.5)_78%,transparent)] @3xl/hero:[mask-image:linear-gradient(to_right,transparent_6%,rgb(0_0_0/0.1)_18%,rgb(0_0_0/0.55)_34%,black_50%)]"
            width={960}
            height={540}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          {onPreview ? (
            <button
              type="button"
              data-course-card-early={
                previewDependsOnViewer ? "offer" : undefined
              }
              className={`${centerPlayClasses} ${previewClassName}`}
              {...previewIntent}
              onClick={onPreview}
              disabled={previewDisabled}
              aria-label={previewLabel}
              title={previewLabel}
            >
              <Play size={24} weight="fill" aria-hidden="true" />
            </button>
          ) : null}
          {heldPlaceholder ? (
            // Shown as a block by the head; the button inside is placed on
            // the picture as the real one is.
            <div className="hidden" data-course-card-early="held">
              <span
                aria-hidden="true"
                className={`${centerPlayClasses} pointer-events-none`}
              >
                <Play size={24} weight="fill" aria-hidden="true" />
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-30% to-(--hero-base)/80 to-75% @3xl/hero:hidden"
      />
      {/* Stacked (a phone), the text under the picture gets the fainter
          grid the text side has beside the picture (5. and 6. above): over the
          shade, coming in over the picture's last stretch only, and above the
          hero's foot fade (z-5), so it runs on down to the box under the hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-6 bg-[radial-gradient(circle,color-mix(in_srgb,var(--hero-ink)_11%,transparent)_1px,transparent_1.5px)] bg-size-[24px_24px] [mask-image:linear-gradient(to_bottom,transparent_36%,black_50%)] @3xl/hero:hidden"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-linear-to-r from-(--hero-base) from-28% via-(--hero-base)/75 via-48% to-transparent to-68% @3xl/hero:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle,color-mix(in_srgb,var(--hero-ink)_11%,transparent)_1px,transparent_1.5px)] bg-size-[24px_24px] [mask-image:linear-gradient(to_right,black_36%,transparent_60%)] @3xl/hero:block"
      />
    </>
  );
}
