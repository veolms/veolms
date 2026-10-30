import { LearnerPhoneBackdrop } from "../learner/LearnerPhoneBackdrop";
import { guestHomeGutter, guestHomeGutterBleed } from "./guestHomeSpacing";
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
import { HeroDesk } from "./HeroDesk";
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
 * The hero has two forms, by the width of the page:
 *
 * - From 50rem, the copy lies over the empty left side of the desk picture,
 *   with the laptop playing the hero video on the right.
 * - Narrower (phones, and tablets up to about an iPad mini held upright),
 *   there is no picture: the copy stands on the page itself, followed by the
 *   video in a card of its own and the actions. A desk cropped to that width
 *   showed little more than the laptop, and left the copy cramped above it.
 *
 * Both are in the page from the first paint and the page's width picks one
 * (`@[50rem]/home` and `@max-[50rem]/home` below), so a page built ahead of
 * time is right before any script runs.
 */

/**
 * Space around the copy. The learner's greeting is a larger line than the
 * visitor's welcome above the title, so the greeted copy gives a little
 * back from its padding and the gap above the actions, keeping the hero the
 * height the visitor's and the learner's heroes share beside the picture
 * (see homeHeroHeight.ts).
 */
const visitorSpacing = {
  copy: "pt-7 pb-9 @[50rem]/home:py-10",
  actions: "@[50rem]/home:mt-8",
};
const greetedSpacing = {
  copy: "pt-7 pb-9 @[50rem]/home:py-7",
  actions: "@[50rem]/home:mt-6",
};
// The prerendered page, before the session answers: the visitor's spacing,
// and the greeted spacing by the same document attributes that show the
// greeting (the attribute selector outranks the plain utility). Written out
// in full because Tailwind only makes classes it finds whole in the source.
const greetedSpacingForReturningLearner = {
  copy: "pt-7 pb-9 @[50rem]/home:py-10 @[50rem]/home:[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:py-7",
  actions:
    "@[50rem]/home:mt-8 @[50rem]/home:[:root[data-session-hint=signed-in][data-home-hint=new-learner]_&]:mt-6",
};

const greetingClasses =
  "mb-2 text-[1.375rem] leading-snug font-semibold text-slate-200 [:root[data-theme=light]_&]:text-slate-700 @[50rem]/home:mb-3 @[50rem]/home:text-[clamp(1.375rem,2.4vw,2rem)]";

/** The small line above the title ("Welcome to …"). */
const eyebrowClasses =
  "mb-3 text-xs leading-normal font-semibold tracking-[0.22em] text-slate-400 uppercase [:root[data-theme=light]_&]:text-slate-500 @[50rem]/home:mb-4";

/**
 * Where the picture is held where the copy lies beside it: just where the
 * learner's hero holds it (see `homeHeroPictureSizeClasses`), so the desk
 * does not move when the visitor signs in.
 */
const picturePosition = `object-[72%_center] xl:object-center ${homeHeroPictureBesideCopyClasses}`;

/**
 * The supporting text, set as a quote: Lora italic, a little larger than
 * body text and with room between its lines.
 */
// Beside the picture the quote is kept to about 23 of its letters' widths
// (in its own size, set on the box too): just room for it in two even
// lines.
const descriptionBoxClasses =
  "mt-4 w-fit max-w-xl text-[clamp(1.0625rem,2.4cqw,1.25rem)] @[50rem]/home:mt-5 @[50rem]/home:max-w-[min(23em,52cqw)] @[50rem]/home:text-[clamp(1.125rem,1.6cqw,1.4rem)]";
const descriptionTextClasses =
  "font-[Lora,'Lora_Fallback',Georgia,serif] text-[clamp(1.0625rem,2.4cqw,1.25rem)] leading-[1.5] font-normal text-balance text-slate-200 italic [:root[data-theme=light]_&]:text-slate-700 @[50rem]/home:text-[clamp(1.125rem,1.6cqw,1.4rem)]";
const descriptionClasses = `${descriptionBoxClasses} ${descriptionTextClasses}`;

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
 * Where the copy lies beside it, the hero is a picture of a desk with the
 * copy laid over its empty side. By night (dark theme) the copy is light on
 * the picture's navy; by day (light theme) it is dark on the sunlit wall.
 * The fades run into the picture's own colours rather than the page
 * surface. Narrower, the hero is the page's own surface (see above).
 */
export function GuestHomeHero({
  hero,
  greeting,
  returningLearnerHero,
  onNavigatePage,
  freeCoursesSectionId,
  laptopScreen,
  introVideo,
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
  /** The same video for the narrow form, drawn in a card of its own. */
  introVideo?: ReactNode;
}) {
  const spacing =
    hero && greeting
      ? greetedSpacing
      : hero && returningLearnerHero
        ? greetedSpacingForReturningLearner
        : visitorSpacing;
  const eyebrow = hero && !greeting ? hero.eyebrow : "";
  return (
    <HeroDesk
      labelledBy="guest-home-hero-title"
      // Beside the picture it is as tall as the signed-in learner's hero,
      // and its picture as big and in the same place, so the page keeps its
      // height and its desk when someone signs in on it. Narrower it is as
      // tall as its content, on the page's own background, and not faded out
      // at its foot (its actions are there).
      className={`justify-start @[50rem]/home:justify-center @max-[50rem]/home:bg-transparent! @max-[50rem]/home:[mask-image:none]! ${homeHeroHeightClasses} ${homeHeroPictureSizeClasses}`}
      picturePosition={picturePosition}
      deskLayersClassName="@max-[50rem]/home:hidden"
      // A phone's top right corner switches the lamp, as on the signed-in
      // learner's home (the glow behind the copy follows it); a wider page
      // with no picture has no lamp to switch.
      lampCornerOnPhone
      lampSwitchClassName="@max-[50rem]/home:sm:hidden"
      picturesWhenShown
      // The copy sits on the picture's empty left side, which is deepened so
      // the text stays readable at every crop.
      fadeClassName="hidden @[50rem]/home:block @[50rem]/home:bg-[linear-gradient(to_right,rgb(5_9_21/0.95)_0,rgb(5_9_21/0.86)_36%,rgb(5_9_21/0.45)_62%,transparent_84%)] @[50rem]/home:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.74)_34%,rgb(250_245_236/0.28)_56%,transparent_74%)]"
      laptopScreen={laptopScreen}
    >
      {(pictures) => (
        <div
          // The box lies over the laptop without showing; it lets the pointer
          // through to the screen, and only its own content takes it.
          className={`pointer-events-none flex w-full max-w-3xl flex-col items-start *:pointer-events-auto ${spacing.copy} ${guestHomeGutter} ${guestHeroCopyWhenComplete}`}
        >
          {/* A phone has no picture: the signed-in learner's glow from the
              hero's top right corner stands behind the copy instead, in a
              box as tall as that learner's hero (this one is taller, with
              the video in it), so the light falls the same way. */}
          <LearnerPhoneBackdrop className="bottom-auto h-[26rem]" />
          {hero && greeting ? (
            <p className={greetingClasses}>{greeting}</p>
          ) : hero && returningLearnerHero ? (
            <>
              {eyebrow ? (
                <p className={`${eyebrowClasses} ${forGuest}`}>{eyebrow}</p>
              ) : null}
              {/* The greeting's line, kept empty: the name is not known yet. */}
              <p
                aria-hidden="true"
                className={`invisible ${forReturningLearner} ${greetingClasses}`}
              >
                Hi 👋
              </p>
            </>
          ) : eyebrow ? (
            <p className={eyebrowClasses}>{eyebrow}</p>
          ) : null}
          <h1
            id="guest-home-hero-title"
            className="text-[clamp(1.875rem,8cqw,2.75rem)] leading-[1.14] font-extrabold tracking-[-0.03em] @[50rem]/home:text-[clamp(2.25rem,4.4vw,3.5rem)] @[50rem]/home:leading-[1.1]"
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
            // A quote, signed as the signed-in learner's is.
            <figure
              className={`${descriptionBoxClasses} ${returningLearnerHero ? forGuest : ""}`}
            >
              <blockquote className={descriptionTextClasses}>
                {hero?.description}
              </blockquote>
              {hero ? (
                // At the quote box's right edge, which is at or past the end of
                // its longest line.
                <figcaption className="mt-1.5 flex items-center justify-end gap-2.5 text-[0.8125rem] leading-4 text-slate-400 [:root[data-theme=light]_&]:text-slate-600">
                  <span aria-hidden="true" className="h-px w-6 bg-current/60" />
                  ProCodrr
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          {returningLearnerHero?.description ? (
            <p className={`${descriptionClasses} ${forReturningLearner}`}>
              {returningLearnerHero.description}
            </p>
          ) : null}

          {/* The pictures, where the copy lies beside them: this box steps
              aside (its own box is not drawn) and they fill the whole hero
              behind the copy. They are drawn as soon as they are there,
              whatever the copy around them is waiting for. Narrower they are
              not drawn at all. */}
          <div className="pointer-events-none! visible hidden @[50rem]/home:contents">
            {pictures}
          </div>

          {introVideo ? (
            // From one edge of the page to the other, over the gutters.
            <div
              className={`relative mt-6 self-stretch rounded-xl ${guestHomeGutterBleed} shadow-[0_20px_44px_-22px_rgb(0_0_0/0.75)] [:root[data-theme=light]_&]:shadow-[0_18px_40px_-22px_rgb(15_23_42/0.4)] @[50rem]/home:hidden`}
            >
              {introVideo}
            </div>
          ) : null}

          <div
            className={`mt-6 flex w-full flex-col items-stretch gap-4 @[50rem]/home:flex-row @[50rem]/home:items-center @[50rem]/home:w-auto @[50rem]/home:justify-start @[50rem]/home:gap-3 ${spacing.actions}`}
          >
            {/* Stacked, the button above the sign-in line, wherever the hero
                has no picture; beside the picture the actions share a row. */}
            <div className="flex flex-col gap-3 @[50rem]/home:flex-row @[50rem]/home:items-center">
              <GuestHomeLink
                href="/courses"
                onNavigatePage={onNavigatePage}
                data-control-radius-action
                // No lamp light on it where no lamp is drawn beside it.
                className={`${primaryActionClasses} @max-[50rem]/home:before:hidden`}
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
                // Glass over the picture; narrower, the free courses are the
                // next thing down the page anyway.
                <a
                  href={`#${freeCoursesSectionId}`}
                  data-control-radius-action
                  className={`${glassActionClasses} @max-[50rem]/home:hidden`}
                  onClick={(event) =>
                    scrollToSection(event, freeCoursesSectionId)
                  }
                >
                  {hero.secondaryActionLabel}
                </a>
              ) : null}
            </div>
            {hero && !greeting ? (
              <p
                className={`text-center text-sm font-medium text-slate-400 [:root[data-theme=light]_&]:text-slate-600 @[50rem]/home:hidden ${returningLearnerHero ? forGuest : ""}`}
              >
                {/* For a new learner as for a returning one: signing in
                    makes an account too. */}
                New here or coming back?{" "}
                <GuestHomeLink
                  href="/login"
                  onNavigatePage={onNavigatePage}
                  className="font-semibold text-[color-mix(in_srgb,var(--accent)_70%,white)] underline-offset-4 hover:underline [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))"
                >
                  Sign in
                </GuestHomeLink>
              </p>
            ) : null}
          </div>
          <HeroCopyEnd />
        </div>
      )}
    </HeroDesk>
  );
}
