import {
  courseSurfaceElevation,
  raisedCourseCardClasses,
} from "../../components/cardElevation";
import { guestHeroDayImage, guestHeroImage } from "../guest/guestHeroImage";
import { GuestHomeSectionHeader } from "../guest/GuestHomeSectionHeader";
import {
  guestHomeBlockStart,
  guestHomeGutter,
  guestHomeSectionGap,
} from "../guest/guestHomeSpacing";
import {
  HeroCopyEnd,
  learnerHeroCopyWhenComplete,
  HeroPicture,
  heroSceneClasses,
  heroThemeTintClasses,
  heroBottomFadeClasses,
} from "../guest/HeroPicture";
import { getHomeTimeGreeting } from "../homeGreeting";
import { LearnerCoursesSubtitle } from "./learnerCoursesSubtitle";
import { LearnerGoalCardSkeleton } from "./LearnerGoalCard";
import { LearnerHeroClock } from "./LearnerHeroClock";
import { LearnerPhoneBackdrop } from "./LearnerPhoneBackdrop";
import {
  copyOnDeskClasses,
  heroClockClasses,
  heroCopyBoxClasses,
  heroFadeClasses,
  heroGreetingBoxClasses,
  heroGreetingClasses,
  heroNameClasses,
  heroQuoteBoxClasses,
  heroSizeClasses,
  pictureBandClasses,
  picturePlacementClasses,
  resumePaneClasses,
  resumeRowBoxClasses,
  resumeRowContentClasses,
  resumeThumbnailClasses,
} from "./learnerHeroLayout";
import "../guest/guest-home-shell.css";

/**
 * What stands in for something on the learner's home that is still on its
 * way. Each piece here is the size of what it stands in for, so the page
 * does not move when that arrives.
 */
const pulse = "animate-pulse motion-reduce:animate-none";
/** On the hero's picture and on its frosted row. */
const onHero = `${pulse} rounded-md bg-current/14`;
/** On the page's own ground and on its cards. */
const onPage = `${pulse} rounded-md bg-[color-mix(in_srgb,var(--text)_10%,transparent)]`;

/**
 * The most the learner's course list shows: two rows of four on a large
 * monitor. The layout hides what a narrower page has no room for, so the
 * rows it does show are full ones: four rows on a phone, six cards in two
 * or three columns.
 */
export const learnerCourseGridClasses = [
  "grid grid-cols-1 gap-3",
  "@max-lg/courses:[&>*:nth-child(n+5)]:hidden",
  "@lg/courses:grid-cols-2 @lg/courses:gap-4 @lg/courses:@max-[100rem]/courses:[&>*:nth-child(n+7)]:hidden",
  "@2xl/courses:grid-cols-3 @2xl/courses:gap-5",
  "@[100rem]/courses:grid-cols-4",
].join(" ");

/**
 * The part of the page under the hero, with what goes in it. Above a phone
 * it is drawn 0.75rem up into the hero's faded foot (`heroBottomFadeClasses`):
 * the picture is all but gone there, so the first heading keeps its usual
 * distance from where the picture can still be seen. That is less than the
 * smallest top padding (22px), so the heading never slips under the hero,
 * which is drawn over the page below it.
 */
export const learnerHomeBodyClasses = `grid min-w-0 pb-[clamp(1.75rem,3.6cqw,3rem)] sm:-mt-3 ${guestHomeSectionGap} ${guestHomeGutter} ${guestHomeBlockStart}`;

/** The page's own box (see `LearnerHome`). */
export const learnerHomePageClasses = `learner-home-page @container/home min-w-0 ${courseSurfaceElevation}`;

/** The learner's name in the greeting, before the session has answered. */
export function LearnerNameSkeleton() {
  return (
    <span
      aria-hidden="true"
      className={`${onHero} inline-block h-[0.72em] w-[3.3em]`}
    />
  );
}

/**
 * The quote of the day before it has arrived: two bars for its two lines
 * and one for its author, in the room the quote's box keeps for them (see
 * `heroQuoteBoxClasses`).
 *
 * The bars are a fixed size, set in the quote's own letters: 20 of its font
 * sizes for the first and four fifths of that for the second, which is
 * about what a quote of middling length takes and no wider than the
 * greeting above them. The author's bar begins where the first one ends,
 * which is where the author's name begins under a quote of that length. They used to be measured from a sample quote once
 * the page was running, so a page built ahead of time drew them at one
 * length and then redrew them at another before the quote came. Nothing
 * here waits on a script, so they are the same from the first paint on.
 */
export function LearnerQuoteSkeleton() {
  return (
    <div aria-hidden="true" aria-busy="true" className={heroQuoteBoxClasses}>
      {/* As wide as the box of a quote of two lines is, so the author's
          bar has the room the author has. */}
      <div className="w-[28em] max-w-full">
        <div className="relative h-[2.6em] w-[20em] max-w-full">
          <span
            className={`${onHero} absolute top-[0.65em] left-0 block h-4 w-full -translate-y-1/2`}
          />
          <span
            className={`${onHero} absolute top-[1.95em] left-0 block h-4 w-4/5 -translate-y-1/2`}
          />
        </div>
        {/* The author starts where the quote's longest line ends, or ends
            with the box where there is no room for that (see
            `useAuthorBesideQuote`); its bar does the same by the longer
            bar. */}
        <span
          className={`${onHero} mt-2 mb-0.5 ml-[min(20em,calc(100%_-_9rem))] block h-3 w-36`}
        />
      </div>
    </div>
  );
}

/** The hero's course row (see `LearnerResumeRow`), before its course is known. */
export function LearnerResumeRowSkeleton() {
  return (
    <div className={resumeRowBoxClasses} aria-hidden="true" aria-busy="true">
      <div className={resumePaneClasses}>
        <div className={resumeRowContentClasses}>
          <span className={`${resumeThumbnailClasses} ${onHero}`} />
          {/* As tall as the row's three lines of text (what to do, the
              course, its progress), so the row is the real one's height
              where its thumbnail is left out as well. The key after it
              is left out where the row has none (see LearnerResumeRow): a
              phone, and beside the picture on a page under 56rem. */}
          <div className="flex min-h-[3.8rem] min-w-0 flex-1 flex-col justify-center @[50rem]/home:w-52 @[50rem]/home:flex-none">
            <span className={`${onHero} block h-3 w-28`} />
            <span className={`${onHero} mt-2.5 block h-4 w-full max-w-52`} />
          </div>
          <span
            className={`${onHero} mb-1 block h-11 w-full shrink-0 rounded-[0.625rem] max-sm:hidden @[28rem]/resume:w-24 @[50rem]/home:w-24 @[50rem]/home:@max-[56rem]/home:hidden`}
          />
        </div>
      </div>
    </div>
  );
}

/** One of the learner's course cards (see `LearnerCourseCard`). */
function LearnerCourseCardSkeleton() {
  return (
    <div
      className={`flex min-w-0 items-center gap-3.5 overflow-hidden rounded-2xl border border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) p-3 shadow-(--card-shadow) ${raisedCourseCardClasses} @lg/courses:flex-col @lg/courses:items-stretch @lg/courses:gap-0 @lg/courses:p-0`}
    >
      <span
        className={`${onPage} block aspect-video w-30 shrink-0 rounded-lg @lg/courses:w-auto @lg/courses:rounded-none`}
      />
      <div className="flex min-w-0 flex-1 flex-col @lg/courses:px-4 @lg/courses:pt-2.5 @lg/courses:pb-4">
        <span className="flex h-6 items-center @lg/courses:h-10">
          <span className={`${onPage} block h-4 w-3/4`} />
        </span>
        <span className="flex h-5 items-center @lg/courses:h-6">
          <span className={`${onPage} block h-3 w-1/2`} />
        </span>
        <span className="block pt-2.5 @lg/courses:pt-3.5">
          <span
            className={`${onPage} block h-9 w-full rounded-[10px] @lg/courses:h-11`}
          />
        </span>
      </div>
    </div>
  );
}

/**
 * The learner's course list before the courses are known: its heading and
 * the line under it (see `LearnerCoursesSubtitle`), and cards standing in
 * for the first row.
 */
export function LearnerCoursesSkeleton() {
  return (
    <section
      aria-labelledby="learner-home-courses-title"
      aria-busy="true"
      className="@container/courses min-w-0"
    >
      <GuestHomeSectionHeader
        id="learner-home-courses-title"
        title="My Courses"
        subtitle={<LearnerCoursesSubtitle />}
      />
      <div aria-hidden="true" className={`mt-5 ${learnerCourseGridClasses}`}>
        <LearnerCourseCardSkeleton />
        <LearnerCourseCardSkeleton />
        <LearnerCourseCardSkeleton />
      </div>
      <span className="sr-only" role="status">
        Loading your courses
      </span>
    </section>
  );
}

/**
 * The learner's home before its own code has arrived: the hero's picture,
 * which is the same for everyone and is asked for with the page, the
 * heading of the course list, and placeholders where the learner's own
 * things will be. It knows no learner unless it is told the name, and the
 * one thing it reads the clock for, the date and time over the greeting,
 * corrects itself in the browser (see `LearnerHeroClock`), so it can be
 * rendered ahead of time.
 *
 * The home itself takes over from it (see `LearnerHome`), laid out the same
 * way, so nothing on the page moves when it does.
 */
export function LearnerHomeShell({
  learnerName = "",
}: {
  /**
   * The name this tab remembers, where the shell is only ever rendered in
   * the browser. The greeting is then said outright instead of held by a
   * placeholder, and the quote under it wraps as it will. The clock is read
   * to say it, so a page built ahead of time must not be given one.
   */
  learnerName?: string;
}) {
  const firstName = learnerName.trim().split(/\s+/u)[0] ?? "";
  const pictures = (
    <>
      <HeroPicture
        picture={guestHeroImage}
        position={picturePlacementClasses}
        priority
        className="-z-40 max-sm:translate-x-[calc(0.34%+0.72px)] [:root[data-theme=light]_&]:invisible"
      />
      <HeroPicture
        picture={guestHeroDayImage}
        position={picturePlacementClasses}
        className="-z-20 hidden [:root[data-theme=light]_&]:block"
      />
    </>
  );
  return (
    <div className={learnerHomePageClasses}>
      <section
        aria-label="Your home is loading"
        aria-busy="true"
        className={`${heroSceneClasses} ${heroBottomFadeClasses} ${heroSizeClasses}`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${heroFadeClasses} ${heroThemeTintClasses}`}
        />
        <div className={heroCopyBoxClasses}>
          <LearnerPhoneBackdrop />
          <div
            className={`${copyOnDeskClasses} ${learnerHeroCopyWhenComplete}`}
            aria-hidden="true"
          >
            <div className={heroGreetingBoxClasses}>
              <div className="min-w-0">
                <LearnerHeroClock
                  className={heroClockClasses}
                  fillBeforePaint
                />
                <p className={heroGreetingClasses}>
                  {firstName ? (
                    <>
                      {getHomeTimeGreeting(new Date().getHours())},{" "}
                      <span className={heroNameClasses}>{firstName}.</span>
                    </>
                  ) : (
                    // Built ahead of time, it knows no name. A tab that
                    // remembers the account says the greeting outright: the
                    // document's head hands the words over before the
                    // first paint (see learnerHomeSnapshot.ts).
                    <>
                      <span
                        className={`${onHero} inline-block h-[0.72em] w-[10.4em] max-w-full [:root[data-learner-home-greeting]_&]:hidden`}
                      />
                      <span className="hidden after:content-(--learner-home-greeting) [:root[data-learner-home-greeting]_&]:inline" />
                      <span
                        className={`${heroNameClasses} hidden after:content-(--learner-home-name) [:root[data-learner-home-greeting]_&]:inline`}
                      />
                    </>
                  )}
                </p>
              </div>
              <LearnerQuoteSkeleton />
            </div>
            <LearnerGoalCardSkeleton />
            <LearnerResumeRowSkeleton />
            <HeroCopyEnd />
          </div>
          <div className={pictureBandClasses}>{pictures}</div>
        </div>
      </section>
      <div className={learnerHomeBodyClasses}>
        <LearnerCoursesSkeleton />
      </div>
    </div>
  );
}
