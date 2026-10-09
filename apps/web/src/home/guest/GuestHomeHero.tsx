import { guestHomeGutter } from "./guestHomeSpacing";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { HomePageHero } from "@veolms/contracts/home-page-defaults";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "./GuestHomeLink";
import type { MouseEvent, ReactNode } from "react";
import { HeroDesk, heroPictureBandFade } from "./HeroDesk";
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
 * The hero is a picture of a desk with the copy laid over its empty side. By
 * night (dark theme) the copy is light on the picture's navy; by day (light
 * theme) it is dark on the sunlit wall. The fades run into the picture's own
 * colours rather than the page surface.
 */
export function GuestHomeHero({
  hero,
  greeting,
  onNavigatePage,
  freeCoursesSectionId,
  laptopScreen,
}: {
  /** The configured copy; while it is still loading the hero shows its picture and placeholders. */
  hero?: HomePageHero;
  /** A short line of its own above the title, for a signed-in learner. */
  greeting?: string;
  onNavigatePage: NavigateTo;
  /** The secondary action scrolls to this section when it is on the page. */
  freeCoursesSectionId?: string;
  /** What the laptop in the picture shows (see `HeroDesk`). */
  laptopScreen?: ReactNode;
}) {
  return (
    <HeroDesk
      labelledBy="guest-home-hero-title"
      className="min-h-104 justify-start sm:min-h-[clamp(20rem,27vw,25rem)] sm:justify-center"
      // Wider screens: the copy sits on the picture's empty left side, which
      // is deepened so the text stays readable at every crop.
      fadeClassName="hidden sm:block sm:bg-[linear-gradient(to_right,rgb(5_9_21/0.95)_0,rgb(5_9_21/0.86)_36%,rgb(5_9_21/0.45)_62%,transparent_84%)] sm:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.74)_34%,rgb(250_245_236/0.28)_56%,transparent_74%)]"
      laptopScreen={laptopScreen}
    >
      {(pictures) => (
        <div
          // The box lies over the laptop without showing; it lets the pointer
          // through to the screen, and only its own content takes it.
          className={`pointer-events-none flex w-full max-w-3xl flex-col items-start py-8 *:pointer-events-auto sm:py-12 ${guestHomeGutter}`}
        >
          {hero && greeting ? (
            <p className="mb-2 text-[1.375rem] leading-snug font-semibold text-slate-200 [:root[data-theme=light]_&]:text-slate-700 sm:mb-3 sm:text-[clamp(1.375rem,2.4vw,2rem)]">
              {greeting}
            </p>
          ) : null}
          <h1
            id="guest-home-hero-title"
            className="text-[clamp(1.5rem,7.4vw,2.75rem)] leading-[1.06] font-extrabold tracking-[-0.03em] sm:text-[clamp(2.25rem,4.4vw,3.5rem)]"
          >
            {hero ? (
              <>
                {hero.headline}
                {hero.highlightedHeadline ? (
                  <span className="block text-[color-mix(in_srgb,var(--accent)_66%,white)] [:root[data-theme=light]_&]:text-(--accent-ink,var(--accent))">
                    {hero.highlightedHeadline}
                  </span>
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
            <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-slate-200/90 [:root[data-theme=light]_&]:text-slate-700 sm:mt-5 sm:max-w-[min(32rem,54cqw)] sm:text-lg">
              {hero?.description}
            </p>
          ) : null}

          {/* The pictures. On a phone they are a band of their own between the
              copy and the actions (the copy's last line runs a little over
              their top), faded into the hero at its top and bottom
              edges; on wider screens this box steps aside and they fill the
              whole hero behind the copy. */}
          <div
            className={`pointer-events-none! relative -mx-[clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)] -mt-6 h-56 self-stretch ${heroPictureBandFade} sm:static sm:mx-0 sm:mt-0 sm:h-auto sm:before:hidden`}
          >
            {pictures}
          </div>

          <div className="mt-3.5 flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row min-[420px]:items-center sm:mt-8">
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
        </div>
      )}
    </HeroDesk>
  );
}
