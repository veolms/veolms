import type { EnrolledCourse } from "@veolms/contracts";
import type { ReactNode } from "react";
import { HeroDesk } from "../guest/HeroDesk";
import {
  guestHomeGutter,
  guestHomeGutterBleed,
} from "../guest/guestHomeSpacing";
import { LearnerResumeCard, type LearnerResume } from "./LearnerResumeCard";
import type { LearnerHeroIntent } from "./learnerHomePlan";

/** What the hero asks of the learner, in one line under the greeting. */
const prompts: Record<LearnerHeroIntent, string> = {
  start: "Ready to start learning?",
  continue: "Pick up where you left off.",
  next: "Ready for your next course?",
  review: "You’re all caught up.",
};

/**
 * The band the picture gets on a page too narrow to show it beside the copy:
 * it runs edge to edge under the course card, its top faded into the hero
 * so the card seems to stand against the same wall. Its bottom is the
 * hero's own edge.
 */
const pictureBandClasses = [
  "pointer-events-none! relative mt-1 self-stretch",
  guestHomeGutterBleed,
  "@max-[50rem]/home:h-60 @max-[50rem]/home:sm:h-[clamp(20rem,46cqw,23rem)]",
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(to_bottom,#050915_0,rgb(5_9_21/0.5)_18%,transparent_42%)]",
  "[:root[data-theme=light]_&]:before:bg-[linear-gradient(to_bottom,#f4ecdf_0,rgb(244_236_223/0.55)_18%,transparent_42%)]",
  "@[50rem]/home:static @[50rem]/home:mx-0 @[50rem]/home:mt-0 @[50rem]/home:before:hidden",
].join(" ");

/**
 * How tall the hero is where the copy lies beside the picture, and how tall
 * the picture then is. Both are handed down as custom properties because the
 * course card is sized from them (see `LearnerResumeCard`).
 *
 * The hero is a third of its width tall, between 29rem and 34rem. Under
 * 85rem of page it eases down, to 27rem at 80rem and narrower: the picture
 * covers the hero from its right edge, so a shorter hero draws the desk
 * smaller, and that is what leaves the course card, which may only just
 * reach the mug, room for its thumbnail and its words. The slope is the
 * height at which the card at its full width stops 2rem short of the mug:
 * (page width - 2rem - gutter - 10rem) / 2.3966, with the gutter at its
 * 3.6% of the page. (The card is allowed a little over the mug where it has
 * to be narrower than that.)
 *
 * Under 64rem the hero eases down once more, to 25rem at 50rem, for the
 * same reason: it is what keeps the card off the laptop for as long as
 * possible on the narrowest pages that still lay the copy beside the
 * picture. The two slopes are added, each from its own resting height.
 *
 * The picture is as tall as the hero, or a third of the hero's width where
 * that is more (a very wide page, on which it is cropped top and bottom).
 */
const heroSizeClasses = [
  "justify-start",
  "@[50rem]/home:[--hero-h:max(calc(clamp(25rem,17.85rem_+_14.3cqw,27rem)_+_clamp(27rem,40.22cqw_-_5rem,29rem)_-_27rem),min(33.4cqw,34rem))]",
  "@[50rem]/home:[--picture-h:max(var(--hero-h),33.35cqw)]",
  "@[50rem]/home:min-h-(--hero-h)",
].join(" ");

/**
 * The layer that deepens the picture behind the copy. Its stops are set
 * from where the laptop is rather than from the hero's width, so the
 * laptop's near edge is dimmed by the same small amount on every page: the
 * laptop's screen begins 1.05 picture heights in from the hero's right
 * edge, and the fade is spent a little way past that.
 */
const heroFadeClasses = [
  "hidden @[50rem]/home:block",
  "@[50rem]/home:bg-[linear-gradient(to_right,rgb(5_9_21/0.94)_0,rgb(5_9_21/0.8)_calc((100%_-_var(--picture-h)_*_1.05)_*_0.573),rgb(5_9_21/0.3)_calc((100%_-_var(--picture-h)_*_1.05)_*_0.978),transparent_calc((100%_-_var(--picture-h)_*_1.05)_*_1.28))]",
  "@[50rem]/home:[:root[data-theme=light]_&]:bg-[linear-gradient(to_right,rgb(250_245_236/0.9)_0,rgb(250_245_236/0.72)_calc((100%_-_var(--picture-h)_*_1.05)_*_0.573),rgb(250_245_236/0.24)_calc((100%_-_var(--picture-h)_*_1.05)_*_0.944),transparent_calc((100%_-_var(--picture-h)_*_1.05)_*_1.214))]",
].join(" ");

/**
 * Where the course card stands beside the picture: centred on the laptop,
 * lid and keyboard together, which puts its foot on the desk about where
 * the laptop's front edge and the mug stand.
 *
 * The laptop's middle is 58.4% of the way down the picture, and the picture
 * is centred in the hero, so the card's middle belongs 8.4% of the
 * picture's height below the hero's. The card is 51.5% of the picture's
 * height tall, which makes its top half the hero's height less 17.35% of
 * the picture's.
 */
const courseOnDeskClasses =
  "@[50rem]/home:relative @[50rem]/home:mt-[calc(var(--hero-h)_/_2_-_var(--picture-h)_*_0.1735)]";

/**
 * The hero of an enrolled learner's home: a greeting, what to do next, the
 * course to do it in, and their learning goals on the laptop in the picture.
 *
 * A page 50rem or wider lays the copy over the picture's empty left side,
 * as the guest hero does. The picture is held to the hero's right edge, so
 * the desk keeps its size and place there however wide the hero is. The
 * course card stands on the desk beside the laptop, level with it (see
 * `courseOnDeskClasses`), and the greeting sits directly above the card.
 *
 * The copy's box ends where the laptop's lid begins, a picture's height in
 * from the hero's right edge, so a long greeting wraps before it would run
 * onto the laptop.
 *
 * Narrower pages (a tablet held upright, a phone) stack them: the greeting,
 * the same course card running from one edge of the screen to the other,
 * and the picture in a band of its own below it.
 */
export function LearnerHomeHero({
  greeting,
  intent,
  course,
  resume,
  courseHref,
  onOpenCourse,
  laptopScreen,
}: {
  greeting: string;
  intent: LearnerHeroIntent;
  course: EnrolledCourse;
  resume: LearnerResume;
  courseHref: string;
  onOpenCourse: () => void;
  /** What the laptop in the picture shows (see `HeroDesk`). */
  laptopScreen: ReactNode;
}) {
  return (
    <HeroDesk
      labelledBy="learner-home-hero-title"
      className={heroSizeClasses}
      fadeClassName={heroFadeClasses}
      picturePosition="object-[62%_center] sm:object-[100%_center]"
      laptopScreen={laptopScreen}
    >
      {(pictures) => (
        <div
          data-learner-home-hero=""
          // The box lies over the picture without showing; it lets the
          // pointer through to the laptop, and only its own content takes it.
          className={`pointer-events-none flex w-full flex-col items-start pt-7 *:pointer-events-auto ${guestHomeGutter} @[50rem]/home:max-w-[min(57rem,calc(100cqw_-_var(--picture-h)))] @[50rem]/home:pt-0 @[50rem]/home:pr-0`}
        >
          {/* The greeting and the course. Beside the picture this box is
              the card's place on the desk, and the greeting is hung from
              its top edge, so the two stay together whatever the greeting's
              height. Like the box around it, it takes no pointer itself. */}
          <div
            className={`pointer-events-none! w-full *:pointer-events-auto ${courseOnDeskClasses}`}
          >
            <div className="@[50rem]/home:absolute @[50rem]/home:inset-x-0 @[50rem]/home:bottom-full @[50rem]/home:pb-3">
              <h1
                id="learner-home-hero-title"
                className="text-2xl leading-tight font-bold tracking-[-0.02em] text-balance @xl/home:text-[1.75rem] @[50rem]/home:text-[clamp(1.75rem,2.4cqw,2.125rem)]"
              >
                {greeting}
              </h1>
              <p className="mt-1 text-base text-slate-300 @xl/home:text-lg [:root[data-theme=light]_&]:text-slate-600">
                {prompts[intent]}
              </p>
            </div>

            <LearnerResumeCard
              course={course}
              intent={intent}
              resume={resume}
              href={courseHref}
              onOpen={onOpenCourse}
            />
          </div>

          <div className={pictureBandClasses}>{pictures}</div>
        </div>
      )}
    </HeroDesk>
  );
}
