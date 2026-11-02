import type { MouseEvent } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { Clock } from "@phosphor-icons/react/Clock";
import { Play } from "@phosphor-icons/react/Play";
import { Stack } from "@phosphor-icons/react/Stack";
import type { Course } from "../catalogue";
import { PageBackButton } from "../../components/PageBackButton";
import { CourseWishlistHeartButton } from "../CourseWishlistHeartButton";
import { CourseHeroArtwork } from "./CourseHeroArtwork";
import { presumedGuestOnlyClasses } from "./courseViewerState";
import { useCurriculumIntent } from "./curriculumIntent";
import { useHydrated } from "../viewerCourseState";
import {
  mergeIntentHandlers,
  type LessonOpenIntent,
} from "../../learning/lessonOpenIntent";

export interface CourseOverviewHeroProps {
  title: string;
  /** The course's short description, shown under the title. */
  shortDescription?: string;
  sections: number;
  lessons: number;
  duration: string;
  thumbnail: string;
  thumbnailSrcSet?: Course["thumbnailSrcSet"];
  /** Fills the hero behind the text once it is wide (desktop); see the artwork. */
  banner?: string;
  bannerSrcSet?: Course["bannerSrcSet"];
  onBack?: () => void;
  /** Where the back link leads, as the link reads: "All courses", "Home". */
  backLabel?: string;
  /** Left out for someone who manages the course. */
  wishlist?: {
    wishlisted: boolean;
    disabled: boolean;
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /**
   * Left out when the course has nothing a visitor can watch yet. For
   * someone who manages the course, or a learner enrolled in it, it is
   * `kind: "open"`, into the course itself: a round play button in the
   * corner beside the text, and in the middle of the picture while stacked
   * (an "Open course" pill under the text when there is no picture).
   */
  preview?: {
    onOpen: () => void;
    disabled: boolean;
    kind?: "preview" | "open";
    /** What an `open` button is called; "Open course" by default. */
    label?: string;
    /** Readies the lesson the buttons open, ahead of the press. */
    intent?: LessonOpenIntent["handlers"];
  };
  /**
   * Which of the corner's two controls depend on who is looking, while that
   * is not known yet (see `courseViewerState`).
   *
   * - `for: "everyone"`: the viewer is being waited for. The controls named
   *   here are not passed in at all; a placeholder holds the place of each.
   * - `for: "expected-session"`: the visitor is presumed a guest and the
   *   guest's controls are passed in and shown. On a browser that remembers
   *   a session they are hidden from the first paint and the placeholders
   *   shown in their place.
   *
   * `heldPlay` draws the enrolled learner's play button, on a course the
   * document's head finds the learner holds (the guest's preview is then
   * marked for the head to hide, the trailer's included).
   */
  viewerPlaceholders?: {
    for: "everyone" | "expected-session";
    preview: boolean;
    wishlist: boolean;
    heldPlay?: boolean;
  };
  placement?: HeroPlacement;
}

/**
 * Where the hero sits.
 *
 * - `card`: a rounded card in the page's column, for the course editor's
 *   preview window.
 * - `edge`: on the course page itself, where it touches the application
 *   frame at the top and on both sides, as the home page's hero does.
 */
export type HeroPlacement = "card" | "edge";

/**
 * The hero's ground and ink follow the theme. By night the ground is near
 * black and the text white. By day the text side is the light surface with
 * the page's dark text on it, and only the picture's side stays as the
 * thumbnail paints it. Everything in the hero that is drawn on the ground
 * takes `--hero-base` and `--hero-ink` from here; the buttons that lie over
 * the picture (the heart, the preview button) keep their dark glass.
 */
const heroSurfaceClasses =
  "@container/hero relative isolate overflow-hidden bg-(--hero-base) text-(--hero-ink) [--hero-base:color-mix(in_srgb,var(--accent)_9%,#080b13)] [--hero-ink:white] [:root[data-theme=light]_&]:[--hero-base:var(--surface)] [:root[data-theme=light]_&]:[--hero-ink:var(--text)]";

/**
 * The hero's lower edge on the course page: over its last stretch it fades
 * slowly into the ground the boxes below lie on, so the hero does not end
 * in a hard line behind the box that overlaps it. The ground is the shell's
 * `--card-ground` (see `CoursesPage`), or the canvas in the unframed layout,
 * where the page is not deepened. It lies over the picture and under the
 * text and the buttons.
 */
const heroFootFadeClasses =
  "pointer-events-none absolute inset-x-0 bottom-0 z-5 h-28 bg-linear-to-t from-(--hero-foot) from-12% via-(--hero-foot)/50 via-45% to-transparent [--hero-foot:var(--card-ground,var(--canvas))]";

/**
 * The text column: under the picture when stacked, beside it when wide. Wide,
 * it is as tall as the hero, with the title at the top under the back link
 * and the course facts at the bottom. Its width limit is its right edge, so
 * it has no padding there: at the narrowest wide hero the three facts need
 * all of it to stay on one line. The hero is kept low, and grows only on a
 * monitor wide enough that the picture would otherwise be a small part of it.
 */
const heroTextClasses =
  "relative z-10 flex flex-col gap-3 pb-6 @3xl/hero:min-h-[clamp(15rem,28cqi,max(17rem,min(15cqi,21rem)))] @3xl/hero:justify-between @3xl/hero:gap-4 @3xl/hero:pr-0";

/**
 * The column the hero's text and everything below the hero keep to. Its
 * width (1100px) is written into the edge placement below as 68.75rem.
 * `data-fixed-radius` goes with it: the radius preference rounds every box
 * directly inside the page, and this one is only a wrapper.
 */
export const overviewColumnClasses =
  "mx-auto box-border flex w-full max-w-275 flex-col gap-4";

/**
 * What differs between the two placements.
 *
 * The edge hero is pulled out over the shell's page padding by that padding's
 * own lengths, which the shell publishes as custom properties. Its contents
 * keep to the column the cards below sit in: that column is the page inside
 * its gutters, at most 1100px (68.75rem) wide and centred, so its edge is one
 * gutter in, or half of what the hero has beyond 1100px once that is more.
 * The heart and the preview button stay in the frame's corners, over the
 * picture.
 */
export const heroPlacementClasses: Record<
  HeroPlacement,
  { surface: string; controls: string; text: string; pill: string }
> = {
  card: {
    surface: `${heroSurfaceClasses} rounded-2xl border border-white/8 shadow-(--card-shadow)`,
    controls: "p-3 @3xl/hero:p-5",
    text: `${heroTextClasses} px-4 @3xl/hero:pl-5`,
    pill: "right-5",
  },
  edge: {
    surface: `${heroSurfaceClasses} -mx-(--application-page-inline-gutter) -mt-(--application-page-block-start)`,
    controls:
      "px-(--application-page-inline-gutter) py-3 @3xl/hero:py-5 @3xl/hero:pl-[max(var(--application-page-inline-gutter),(100cqi_-_68.75rem)/2)]",
    // The first box under the hero overlaps its last 1rem: the hero is that
    // much taller here (`pb-10` and the `min-h`, which is `heroTextClasses`'
    // own plus 1rem, written out because Tailwind reads whole class names),
    // and the picture stops above the strip (`footRoom`).
    // On a phone the words keep 1rem from the screen's edges, as the text
    // in the boxes below does (they run to the edges there).
    text: `${heroTextClasses} pb-10! @3xl/hero:min-h-[calc(clamp(15rem,28cqi,max(17rem,min(15cqi,21rem)))_+_1rem)]! px-[calc(var(--application-page-inline-gutter)_+_1rem)] max-[640px]:px-4 @3xl/hero:pl-[max(var(--application-page-inline-gutter),(100cqi_-_68.75rem)/2)]`,
    pill: "right-(--application-page-inline-gutter) @3xl/hero:bottom-10!",
  },
};

const heroControlClasses =
  "pointer-events-auto cursor-pointer items-center justify-center border border-white/18 bg-slate-950/70 text-white transition-colors duration-160 ease-out hover:bg-slate-950/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default";

const previewPillClasses = `${heroControlClasses} h-12 gap-2.5 rounded-full px-5 text-[0.92rem] font-semibold`;

/**
 * Holds the place of a control in the hero's corner: the same dark glass,
 * pulsing as the app's other placeholders do.
 */
const controlPlaceholderClasses =
  "shrink-0 animate-pulse rounded-full border border-white/10 bg-slate-950/55 motion-reduce:animate-none";

const previewPillContent = {
  preview: (
    <>
      <Play size={17} weight="bold" aria-hidden="true" />
      <span>Preview Course</span>
    </>
  ),
  open: (
    <>
      <Play size={17} weight="bold" aria-hidden="true" />
      <span>Open course</span>
    </>
  ),
};

// Left out while the row is too narrow to hold all three facts on one line:
// a dot must not end up alone at the end of a line.
const metaSeparator = (
  <span
    className="hidden text-[0.8rem] text-(--hero-ink)/30 @md/hero:inline"
    aria-hidden="true"
  >
    •
  </span>
);

export function CourseOverviewHero({
  title,
  shortDescription,
  sections,
  lessons,
  duration,
  thumbnail,
  thumbnailSrcSet,
  banner,
  bannerSrcSet,
  onBack,
  backLabel = "Back",
  wishlist,
  preview,
  viewerPlaceholders,
  placement = "card",
}: CourseOverviewHeroProps) {
  // The way into the lessons, whose pages use the whole curriculum.
  const curriculumIntent = useCurriculumIntent();
  const hydrated = useHydrated();
  const placed = heroPlacementClasses[placement];
  // The guest's own controls step aside for their placeholders on a browser
  // that remembers a session.
  const guestOnly =
    viewerPlaceholders?.for === "expected-session"
      ? presumedGuestOnlyClasses
      : "";
  const previewGuestOnly = viewerPlaceholders?.preview ? guestOnly : "";
  const forEveryone = viewerPlaceholders?.for === "everyone";
  const heldPlay = Boolean(viewerPlaceholders?.heldPlay && thumbnail);
  // A preview the head puts away on a course the learner holds.
  const previewOffered = Boolean(viewerPlaceholders?.preview) || heldPlay;
  const openLabel = preview?.label ?? "Open course";
  // The short description is one paragraph here, whatever line breaks it
  // was written with, cut to two or three lines.
  const summary = shortDescription?.replace(/\s+/g, " ").trim();
  // Stacked, the text tucks up into the picture's fading lower edge. With no
  // picture it starts below the buttons in the corners instead.
  const stackedTop = thumbnail ? "-mt-[7cqi]" : "pt-18";
  // The picture is 56.25cqi tall and the title starts 7cqi up into it; the
  // heart (2.75rem) sits a little above that line. With no picture it goes
  // back to the top corner.
  const stackedCorner = thumbnail ? "top-[calc(49.25cqi_-_3.25rem)]" : "top-3";
  // Wide, the title starts on a line of its own under the back link.
  const wideTop = onBack ? "@3xl/hero:pt-16" : "@3xl/hero:pt-6";
  // Beside a picture the text keeps to its half; alone it may run wider.
  const wideWidth = thumbnail
    ? "@3xl/hero:max-w-[52%]"
    : "@3xl/hero:max-w-[72%]";
  // A long title takes smaller type, so it does not push the hero to twice
  // its height. Sized against the hero's own width (cqi), not the window's;
  // a short title grows a little more on a hero as wide as a large monitor.
  const titleSize =
    title.length > 70
      ? "text-[clamp(1.3rem,0.9rem+1.6cqi,1.85rem)]"
      : title.length > 44
        ? "text-[clamp(1.45rem,0.95rem+2.1cqi,2.15rem)]"
        : // A short title also gets one line to itself where the hero has
          // the room: from 68rem of hero it may run past its column, up to
          // 62% of the hero, over the picture's faded edge. It still wraps
          // if it is longer than that.
          "text-[clamp(1.6rem,1rem+2.6cqi,max(2.5rem,min(2.3cqi,3.25rem)))] @[68rem]/hero:w-max @[68rem]/hero:max-w-[62cqi]";

  return (
    <section
      aria-labelledby="cov-hero-title"
      className={placed.surface}
      // The radius preference rounds every section on this page; at the
      // frame's edge the frame does the rounding.
      data-fixed-radius={placement === "edge" ? "" : undefined}
    >
      <CourseHeroArtwork
        footRoom={placement === "edge"}
        title={title}
        thumbnail={thumbnail}
        thumbnailSrcSet={thumbnailSrcSet}
        banner={banner}
        bannerSrcSet={bannerSrcSet}
        onPreview={preview?.onOpen}
        previewDisabled={preview?.disabled}
        previewLabel={preview?.kind === "open" ? openLabel : undefined}
        previewClassName={previewGuestOnly}
        previewDependsOnViewer={previewOffered}
        previewIntent={preview?.intent}
        heldPlaceholder={heldPlay}
      />

      {placement === "edge" ? (
        <div aria-hidden="true" className={heroFootFadeClasses} />
      ) : null}

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 ${placed.controls}`}
      >
        {onBack ? (
          <>
            {/* Over the picture while stacked (a phone or a tablet): the
                app's back button in the Settings page's shape, in the top
                left corner, dark over the picture (a little see-through, a light edge and a
                white arrow); it says where it leads to screen readers. */}
            <PageBackButton
              label={backLabel}
              title={backLabel}
              onClick={onBack}
              className="pointer-events-auto self-start! border-white/25! bg-black/45! text-white! shadow-none! backdrop-blur-[2px] hover:bg-black/60! hover:text-white! @3xl/hero:hidden"
            />
            {/* Beside the picture: a link that says where it leads, in the
                theme's accent, lightened (the hero is dark in every theme).
                It sits in a slim pill of the same colour, faint and
                see-through, its left edge in line with the title. It rests
                slightly dull and comes up to its full colour under the
                pointer, the pill a little stronger; nothing moves and nothing is underlined. */}
            <button
              type="button"
              className="pointer-events-auto hidden h-8 cursor-pointer items-center gap-2 rounded-full border-0 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 text-[0.9rem] font-medium text-[color-mix(in_srgb,var(--accent)_72%,white)] opacity-85 transition-[opacity,background-color] duration-160 ease-out hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white @3xl/hero:inline-flex [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))"
              onClick={onBack}
            >
              <ArrowLeft size={17} weight="bold" aria-hidden="true" />
              {hydrated ? (
                <span>{backLabel}</span>
              ) : (
                // The built page names the Courses page; a page opened from
                // another section is named by the document's head before
                // the first paint (see navigationOriginEarlyState.ts).
                <>
                  <span className="[:root[data-navigation-origin]_&]:hidden">
                    {backLabel}
                  </span>
                  <span className="hidden after:content-(--navigation-origin-label) [:root[data-navigation-origin]_&]:inline" />
                </>
              )}
            </button>
          </>
        ) : (
          <span />
        )}
      </div>

      <div
        className={`${placed.text} ${stackedTop} @3xl/hero:mt-0 ${wideTop} ${wideWidth}`}
      >
        {/* The title, the summary and the facts are three rows of the
            column: beside the picture they are spread over its height, so
            the summary sits midway between the title and the facts. */}
        <h1
          id="cov-hero-title"
          className={`m-0 ${titleSize} leading-[1.12] font-bold tracking-[-0.03em] text-balance [text-shadow:0_1px_18px_rgb(0_0_0/0.4)] [:root[data-theme=light]_&]:[text-shadow:none]`}
        >
          {title}
        </h1>
        {summary ? (
          // The course's two-line pitch, in the page's own face, upright,
          // in balanced lines. It was set as the home page's quote is (the
          // system serif in italic) until 2026-10-14: that reads as someone
          // being quoted, which this is not; the serif is whichever one the
          // device has, so the line looked different on each; and its
          // figures ("75+ hours") are old-style ones that sit unevenly.
          // Two lines where the hero is wide; a third where its text column
          // is narrow, so that the line is never cut short. Stacked, it has
          // a few pixels more room above and below than the column's own
          // gap; beside the picture the rows are spread anyway.
          <p className="mx-0 my-1.5 line-clamp-3 max-w-[34em] text-[1.02rem] leading-[1.45] font-medium text-balance text-(--hero-ink)/80 @3xl/hero:my-0">
            {summary}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.86rem] font-medium text-(--hero-ink)/80 @md/hero:gap-x-3 @3xl/hero:text-[0.9rem]">
          <span className="inline-flex items-center gap-1.5">
            <Stack
              size={18}
              weight="duotone"
              className="text-sky-400 [:root[data-theme=light]_&]:text-sky-600"
              aria-hidden="true"
            />
            <span className="tabular-nums">
              {sections} Section{sections === 1 ? "" : "s"}
            </span>
          </span>
          {metaSeparator}
          <span className="inline-flex items-center gap-1.5">
            <BookOpen
              size={18}
              weight="duotone"
              className="text-violet-400 [:root[data-theme=light]_&]:text-violet-600"
              aria-hidden="true"
            />
            <span className="tabular-nums">
              {lessons} Lesson{lessons === 1 ? "" : "s"}
            </span>
          </span>
          {metaSeparator}
          <span className="inline-flex items-center gap-1.5">
            <Clock
              size={18}
              weight="duotone"
              className="text-amber-400 [:root[data-theme=light]_&]:text-amber-600"
              aria-hidden="true"
            />
            <span className="tabular-nums">{duration || "0h 0m"}</span>
          </span>
        </div>

        {/* With no picture there is no play button on it either. */}
        {preview && !thumbnail ? (
          <button
            type="button"
            className={`${previewPillClasses} mt-1 inline-flex self-start ${previewGuestOnly}`}
            {...mergeIntentHandlers(curriculumIntent, preview.intent)}
            onClick={preview.onOpen}
            disabled={preview.disabled}
          >
            {preview.label ? (
              <>
                <Play size={17} weight="bold" aria-hidden="true" />
                <span>{preview.label}</span>
              </>
            ) : (
              previewPillContent[preview.kind ?? "preview"]
            )}
          </button>
        ) : null}
      </div>

      {/* The hero's bottom right corner: for someone who manages the course,
          or a learner enrolled in it, a round play button into it, beside
          the text only; for anyone else
          the preview button, beside the text only (stacked, the
          play button on the picture is the way in), and the heart. Stacked,
          the text runs the hero's full width, so the corner used is the
          picture's: just above where the title begins. */}
      <div
        className={`absolute ${placed.pill} ${stackedCorner} z-20 flex items-center gap-2.5 @3xl/hero:top-auto @3xl/hero:bottom-6`}
      >
        {preview && thumbnail ? (
          preview.kind === "open" ? (
            <button
              type="button"
              className={`${heroControlClasses} hidden size-12 rounded-full @3xl/hero:inline-flex`}
              {...mergeIntentHandlers(curriculumIntent, preview.intent)}
              onClick={preview.onOpen}
              disabled={preview.disabled}
              aria-label={openLabel}
              title={openLabel}
            >
              <Play size={19} weight="fill" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              data-course-card-early={previewOffered ? "offer" : undefined}
              className={`${previewPillClasses} hidden @3xl/hero:inline-flex ${previewGuestOnly}`}
              {...mergeIntentHandlers(curriculumIntent, preview.intent)}
              onClick={preview.onOpen}
              disabled={preview.disabled}
            >
              {previewPillContent[preview.kind ?? "preview"]}
            </button>
          )
        ) : null}
        {heldPlay ? (
          // The enrolled learner's button, before the page knows them.
          <div className="hidden" data-course-card-early="held">
            <span
              aria-hidden="true"
              className={`${heroControlClasses} pointer-events-none! hidden size-12 rounded-full @3xl/hero:inline-flex`}
            >
              <Play size={19} weight="fill" aria-hidden="true" />
            </span>
          </div>
        ) : null}
        {/* The places of the two controls while the viewer is not known:
            the preview button's beside the text only, as the button's own
            is, and the heart's. */}
        {viewerPlaceholders?.preview && thumbnail ? (
          <span
            aria-hidden="true"
            className={`${controlPlaceholderClasses} h-12 w-44 ${
              forEveryone
                ? "hidden @3xl/hero:block"
                : "hidden [:root[data-session-hint=signed-in]:not([data-course-cards-early])_&]:@3xl/hero:block"
            }`}
          />
        ) : null}
        {viewerPlaceholders?.wishlist ? (
          <span
            aria-hidden="true"
            className={`${controlPlaceholderClasses} size-11 ${
              forEveryone
                ? "block"
                : "hidden [:root[data-session-hint=signed-in]:not([data-course-cards-early])_&]:block"
            }`}
          />
        ) : null}
        {wishlist ? (
          // While the viewer is not known the heart is marked for the
          // head's style (`courseCardEarlyState`): hidden on a course the
          // learner holds, and filled, by the inert one beside it, on a
          // course in their wishlist, until the page knows.
          <div
            className={viewerPlaceholders?.wishlist ? guestOnly : ""}
            data-course-card-early={
              viewerPlaceholders?.wishlist ? "offer" : undefined
            }
          >
            <div
              className="flex"
              data-course-early-heart={
                viewerPlaceholders?.wishlist && !wishlist.wishlisted
                  ? "empty"
                  : undefined
              }
            >
              <CourseWishlistHeartButton
                variant="overview-hero"
                wishlisted={wishlist.wishlisted}
                disabled={wishlist.disabled}
                aria-label={
                  wishlist.wishlisted
                    ? "Remove from wishlist"
                    : "Add to wishlist"
                }
                title={
                  wishlist.wishlisted
                    ? "Remove from wishlist"
                    : "Add to wishlist"
                }
                onClick={wishlist.onToggle}
              />
            </div>
            {viewerPlaceholders?.wishlist && !wishlist.wishlisted ? (
              <div
                className="pointer-events-none hidden"
                aria-hidden="true"
                data-course-early-heart="filled"
              >
                <CourseWishlistHeartButton
                  variant="overview-hero"
                  wishlisted
                  disabled
                  aria-label="Remove from wishlist"
                  title="Remove from wishlist"
                  onClick={() => undefined}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
