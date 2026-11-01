import { guestHomeGutter } from "./guestHomeSpacing";
import {
  homeHeroHeightClasses,
  homeHeroPictureBesideCopyClasses,
  homeHeroPictureSizeClasses,
} from "./homeHeroHeight";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { HomePageHero } from "@veolms/contracts/home-page-defaults";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "./GuestHomeLink";
import type { MouseEvent, ReactNode } from "react";
import { HeroDesk, heroPictureBandFade } from "./HeroDesk";
import { guestHeroCopyWhenComplete, HeroCopyEnd } from "./HeroPicture";
import { glassActionClasses, primaryActionClasses } from "./heroActionClasses";

/**
 * Scrolls to a section of the home page from a link to its id. The page may
 * scroll inside the application frame rather than the window, and the hash is
 * not part of the route, so the browser's own jump is replaced.
 */
function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

/**
 * A page built ahead of time is the guest's, and is also the first thing a
 * signed-in learner with no courses sees (see store/homeHint.ts). The
 * hero is as tall as its copy, and the picture covers the hero, so copy
 * that changed after the first paint would resize the picture. That page
 * therefore carries the learner's copy as well, and the document's own
 * attributes pick between the two before anything is drawn.
 */
const forGuest =
  "[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:hidden";
const forReturningLearner =
  "hidden [:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:block";

/**
 * The greeting is a line the visitor's copy does not have. To keep the hero
 * the height it shares with the visitor's and the learner's heroes (see
 * homeHeroHeight.ts), the copy gives that line back from its padding and
 * the gap above the actions; without this the copy outgrew the hero on
 * pages under about 100rem and the page below moved down at sign-in.
 */
const visitorSpacing = { copy: "py-8 sm:py-12", actions: "sm:mt-8" };
// Measured against the visitor's copy: the same height on phones, beside the
// picture, and between the two (where the hero is as tall as its copy).
const greetedSpacing = {
  copy: "py-3.25 @max-[50rem]/home:sm:py-8.5 @[50rem]/home:py-6",
  actions: "sm:mt-5",
};
// The prerendered page, before the session answers: the visitor's spacing,
// and the greeted spacing by the same document attributes that show the
// greeting (the attribute selector outranks the plain utility). Written out
// in full because Tailwind only makes classes it finds whole in the source.
const greetedSpacingForReturningLearner = {
  copy: "py-8 sm:py-12 [:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:py-3.25 @max-[50rem]/home:sm:[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:py-8.5 @[50rem]/home:[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:py-6",
  actions:
    "sm:mt-8 sm:[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:mt-5",
};

const greetingClasses =
  "mb-2 text-[1.375rem] leading-snug font-semibold text-slate-200 [:root[data-theme=light]_&]:text-slate-700 sm:mb-3 sm:text-[clamp(1.375rem,2.4vw,2rem)]";
/**
 * Where the picture is held: towards the desk on a phone, centred once the
 * hero is wide enough to show all of it, and, where the copy lies beside it,
 * just where the learner's hero holds it (see `homeHeroPictureSizeClasses`),
 * so the desk does not move when the visitor signs in.
 */
const picturePosition = `object-[62%_center] sm:object-[72%_center] xl:object-center ${homeHeroPictureBesideCopyClasses}`;

const descriptionClasses =
  "mt-4 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-slate-200/90 [:root[data-theme=light]_&]:text-slate-700 sm:mt-5 sm:max-w-[min(32rem,54cqw)] sm:text-lg";

function HeroHeadline({
  hero,
  className,
}: {
  hero: HomePageHero;
  className: string;
}) {
  return (
    <span className={className}>
      {hero.headline}
      {hero.highlightedHeadline ? (
        <span className="block text-[color-mix(in_srgb,var(--accent)_66%,white)] [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))">
          {hero.highlightedHeadline}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The hero is a picture of a desk with the copy laid over its empty side. By
 * night (dark theme) the copy is light on the picture's navy; by day (light
 * theme) it is dark on the sunlit wall. The fades run into the picture's own
 * colours rather than the page surface.
 */
export function GuestHomeHero({
  hero,
  greeting,
  returningLearnerHero,
  onNavigatePage,
  freeCoursesSectionId,
  laptopScreen,
}: {
  /** The configured copy; while it is still loading the hero shows its picture and placeholders. */
  hero?: HomePageHero;
  /** A short line of its own above the title, for a signed-in learner. */
  greeting?: string;
  /**
   * The copy a signed-in learner with no courses will be given, for the
   * page that is shown to them before their session has answered. It is in
   * the page beside `hero` and takes its place by the document's attributes.
   */
  returningLearnerHero?: HomePageHero;
  onNavigatePage: NavigateTo;
  /** The secondary action scrolls to this section when it is on the page. */
  freeCoursesSectionId?: string;
  /** What the laptop in the picture shows (see `HeroDesk`). */
  laptopScreen?: ReactNode;
}) {
  const spacing =
    hero && greeting
      ? greetedSpacing
      : hero && returningLearnerHero
        ? greetedSpacingForReturningLearner
        : visitorSpacing;
  return (
    <HeroDesk
      labelledBy="guest-home-hero-title"
      // Beside the picture it is as tall as the signed-in learner's hero,
      // and its picture as big and in the same place, so the page keeps its
      // height and its desk when someone signs in on it.
      className={`min-h-104 justify-start sm:min-h-[clamp(23rem,27vw,25rem)] sm:justify-center ${homeHeroHeightClasses} ${homeHeroPictureSizeClasses}`}
      picturePosition={picturePosition}
      // Wider screens: the copy sits on the picture's empty left side, which
      // is deepened so the text stays readable at every crop.
      fadeClassName="hidden sm:block sm:bg-[linear-gradient(to_right,rgb(5_9_21/0.95)_0,rgb(5_9_21/0.86)_36%,rgb(5_9_21/0.45)_62%,transparent_84%)] sm:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.74)_34%,rgb(250_245_236/0.28)_56%,transparent_74%)]"
      laptopScreen={laptopScreen}
    >
      {(pictures) => (
        <div
          // The box lies over the laptop without showing; it lets the pointer
          // through to the screen, and only its own content takes it.
          className={`pointer-events-none flex w-full max-w-3xl flex-col items-start *:pointer-events-auto ${spacing.copy} ${guestHomeGutter} ${guestHeroCopyWhenComplete}`}
        >
          {hero && greeting ? (
            <p className={greetingClasses}>{greeting}</p>
          ) : hero && returningLearnerHero ? (
            // The greeting's line, kept empty: the name is not known yet.
            <p
              aria-hidden="true"
              className={`invisible ${forReturningLearner} ${greetingClasses}`}
            >
              Hi 👋
            </p>
          ) : null}
          <h1
            id="guest-home-hero-title"
            className="text-[clamp(1.5rem,7.4vw,2.75rem)] leading-[1.06] font-extrabold tracking-[-0.03em] sm:text-[clamp(2.25rem,4.4vw,3.5rem)]"
          >
            {hero ? (
              <>
                <HeroHeadline
                  hero={hero}
                  className={
                    returningLearnerHero ? `block ${forGuest}` : "block"
                  }
                />
                {returningLearnerHero ? (
                  <HeroHeadline
                    hero={returningLearnerHero}
                    className={forReturningLearner}
                  />
                ) : null}
              </>
            ) : (
              <span
                aria-hidden="true"
                className="block h-[2.1em] w-[min(26rem,80vw)] animate-pulse rounded-xl bg-white/10"
              />
            )}
          </h1>
          {!hero || hero.description ? (
            <p
              className={`${descriptionClasses} ${returningLearnerHero ? forGuest : ""}`}
            >
              {hero?.description}
            </p>
          ) : null}
          {returningLearnerHero?.description ? (
            <p className={`${descriptionClasses} ${forReturningLearner}`}>
              {returningLearnerHero.description}
            </p>
          ) : null}

          {/* The pictures. On a phone they are a band of their own between the
              copy and the actions (the copy's last line runs a little over
              their top), faded into the hero at its top and bottom
              edges; on wider screens this box steps aside and they fill the
              whole hero behind the copy. They are drawn as soon as they
              are there, whatever the copy around them is waiting for. */}
          <div
            className={`pointer-events-none! visible relative -mx-[clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)] -mt-6 h-56 self-stretch ${heroPictureBandFade} sm:static sm:mx-0 sm:mt-0 sm:h-auto sm:before:hidden`}
          >
            {pictures}
          </div>

          <div
            className={`mt-3.5 flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center ${spacing.actions}`}
          >
            <GuestHomeLink
              href="/courses"
              onNavigatePage={onNavigatePage}
              data-control-radius-action
              className={primaryActionClasses}
            >
              {hero?.primaryActionLabel ?? "Browse courses"}
              <ArrowRight
                size={18}
                weight="bold"
                aria-hidden="true"
                className="transition-transform duration-150 group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
              />
            </GuestHomeLink>
            {freeCoursesSectionId && hero?.secondaryActionLabel ? (
              <a
                href={`#${freeCoursesSectionId}`}
                data-control-radius-action
                className={glassActionClasses}
                onClick={(event) =>
                  scrollToSection(event, freeCoursesSectionId)
                }
              >
                {hero.secondaryActionLabel}
              </a>
            ) : null}
          </div>
          <HeroCopyEnd />
        </div>
      )}
    </HeroDesk>
  );
}
