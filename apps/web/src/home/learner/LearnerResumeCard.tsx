import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type {
  EnrolledCourse,
  LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import { useRef } from "react";
import { GuestHomeLink } from "../guest/GuestHomeLink";
import { guestHomeGutterBleed } from "../guest/guestHomeSpacing";
import {
  lampLightLayerClasses,
  primaryActionClasses,
} from "../guest/heroActionClasses";
import { LearnerCourseThumbnail } from "./LearnerCourseThumbnail";
import type { LearnerHeroIntent } from "./learnerHomePlan";
import { useCardTilt } from "./useCardTilt";

/** Where in the course the learner goes next, once it is known. */
export interface LearnerResume {
  context: LearningProgressResumeContextResponse | null;
  isLoading: boolean;
}

const actionLabels: Record<LearnerHeroIntent, string> = {
  start: "Start Learning",
  continue: "Continue Learning",
  next: "Start Learning",
  review: "Review Course",
};

/**
 * The course is a card: a pane of frosted glass with the thumbnail on its
 * left and the course's words on its right. It has no border: its edge is
 * a shine, the light a pane's rim catches, bright at the top left corner,
 * gone along the middle and back, fainter, at the bottom right. While the
 * lamp is on, its warm light falls on the pane's top right corner too, as
 * it does on the hero's actions. The pane's foot casts a short shadow. The
 * thumbnail has no edge of its own either: it thins out into the glass on
 * every side, most of all at the left, the top left corner and the bottom
 * (see the thumbnail's mask below).
 *
 * Whatever the theme, the pane is dark and the words on it are light. By
 * night it has only a breath of tint; by day it is smoked, enough for the
 * words to read against the sunlit wall and no more.
 *
 * The words take the pane's right half, within limits that keep the action
 * on one line and the lines from running long (`--words-w`), and the
 * thumbnail has what is left.
 *
 * Beside the picture (a page 50rem or wider) the pane stands on the desk.
 * There it blurs what is behind it, enough to read as glass while the desk
 * and what lies on it still show through as shapes, and it takes its size
 * from the picture it lies on (`--picture-h` is the picture's height, set by
 * the hero, which also places the card):
 * - it is as tall as the laptop's screen: the screen's far edge, the taller
 *   one, is 51.5% of the picture's height;
 * - it runs 2.5rem over the mug on the desk, whose handle is 1.481 picture
 *   heights in from the hero's right edge: enough to cover the handle and
 *   the mug's near side, which show through the glass. The page gutter on
 *   its other side is taken off;
 * - with room to spare it is 10rem wider than a 16:9 thumbnail of its
 *   height;
 * - it is never narrower than 23rem, which its thumbnail and words need.
 *   On the narrowest pages that takes it over the whole mug and, at the
 *   very last, over the laptop's near edge; the glass lets both show.
 *
 * A narrower page (a phone, a tablet held upright) stacks the hero, and the
 * pane runs from one edge of the screen to the other, as the cards on the
 * Courses page do there (see `cardPlaceClasses`). It is as tall as its
 * words need and at least 13rem, a little more on a wider page so the
 * thumbnail keeps its shape. Once the thumbnail would be more than 20rem
 * across, the words take the rest of the width instead. Nothing lies behind
 * the pane there but the hero's plain ground, so it is not blurred: a blur
 * would show nothing, and costs a phone a pass over the pane on every frame
 * of a scroll.
 *
 * The pane leans towards a pointer, up to about six degrees either way,
 * and grows by a fiftieth: towards a mouse that is over it, and on a touch
 * screen towards a finger dragged across it. `useCardTilt` supplies where
 * the pointer is (`--tilt-x`, `--tilt-y`) and whether the pane is following
 * one at all (`--tilt-lift`), and marks the pane's place with `data-tilting`
 * for as long as the pane is away from rest; everything that moves reads
 * them here, and has a transform only while that mark is there. What is on
 * the pane drifts by different amounts as it leans, the thumbnail against
 * the pointer and the words and the action with it, which is what gives the
 * pane its depth: the pane clips and blurs, and a box that does either is
 * flat, so its layers cannot be set at real depths behind one another.
 *
 * Two things keep the lean steady. The pointer is followed over the pane's
 * place (`cardPlaceClasses`), a box around it that stays put, because the
 * pane's own outline moves as it leans and a pointer near its edge would
 * fall off it and back on, over and over. And where there is a mouse,
 * everything that moves is marked as about to (`tiltLayerClass`), so the
 * browser keeps each as a picture it slides and turns; left to itself it
 * redraws the words at each new position, snapped to whole pixels, which
 * makes them shiver.
 */
const cardClasses = [
  "relative isolate mt-5 flex w-full items-stretch justify-end overflow-hidden rounded-[1.25rem] text-white",
  "bg-[linear-gradient(115deg,rgb(99_128_255/0.1),rgb(120_140_255/0.04)_48%,rgb(255_255_255/0.03))]",
  "[:root[data-theme=light]_&]:bg-[linear-gradient(115deg,rgb(34_48_112/0.7),rgb(13_19_46/0.7))]",
  "shadow-[0_16px_22px_-16px_rgb(0_0_0/0.85)] [:root[data-theme=light]_&]:shadow-[0_16px_22px_-16px_rgb(15_23_42/0.5)]",
  // The shine along the edge: a gradient painted over the whole pane and
  // masked down to its outermost pixel.
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:p-px",
  "after:bg-[linear-gradient(135deg,rgb(255_255_255/0.55),rgb(255_255_255/0.14)_24%,rgb(255_255_255/0.03)_52%,rgb(255_255_255/0.07)_76%,rgb(255_255_255/0.3))]",
  "after:[mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]",
  // Stacked.
  "min-h-[clamp(13rem,30cqw,15rem)] [--words-w:max(14rem,min(50%,19rem),calc(100%_-_20rem))]",
  // Beside the picture.
  "@[50rem]/home:mt-0 @[50rem]/home:backdrop-blur-md @[50rem]/home:[--words-w:clamp(14rem,50%,19rem)]",
  "@[50rem]/home:w-[clamp(23rem,calc(100cqw_-_var(--picture-h)_*_1.481_+_2.5rem_-_clamp(var(--application-page-inline-gutter,25px),3.6cqw,3rem)),calc(var(--picture-h)_*_0.9156_+_10rem))]",
  "@[50rem]/home:min-h-[calc(var(--picture-h)_*_0.515)]",
  "[[data-tilting]_&]:[transform:perspective(56rem)_rotateX(calc(var(--tilt-y,0)*-13deg))_rotateY(calc(var(--tilt-x,0)*11deg))_scale(calc(1_+_var(--tilt-lift,0)*0.02))]",
].join(" ");

/**
 * The pane's place: the box it stands in, and where a pointer is followed
 * (see `useCardTilt`). In the stacked layout that box is pulled out over the
 * page's gutters, so the pane reaches both edges of the screen. Beside the
 * picture it is exactly as large as the pane lying flat.
 *
 * A finger dragged across it leans the pane, so the browser is left only the
 * up-and-down drags (to scroll the page) and the pinch, and the shell's own
 * sideways swipe, which moves the sidebar, is kept off it by the
 * `data-sidebar-swipe-ignore` its element carries.
 */
const cardPlaceClasses = `${guestHomeGutterBleed} touch-pan-y touch-pinch-zoom [--tilt-on:1] @[50rem]/home:mx-0 @[50rem]/home:w-fit`;

/**
 * Put on the pane and on each of its layers that drifts. Only where there
 * is a mouse: a layer kept ready costs memory, which a phone or a tablet is
 * short of. There the layers are made when a drag begins to lean the pane.
 */
const tiltLayerClass =
  "[@media(hover:hover)_and_(pointer:fine)]:will-change-transform";

/**
 * The light the leaning pane catches: a soft spot that sits under the
 * pointer and is only there while the pane is leaning.
 */
const cardGlareClasses =
  "pointer-events-none absolute inset-0 hidden rounded-[inherit] bg-[radial-gradient(circle_at_calc(50%_+_var(--tilt-x,0)*100%)_calc(50%_+_var(--tilt-y,0)*100%),rgb(255_255_255/0.18),rgb(255_255_255/0.05)_32%,transparent_56%)] [opacity:var(--tilt-lift,0)] [[data-tilting]_&]:block";

/**
 * The lamp's light on the pane, while the lamp is on. Beside the picture
 * the lamp hangs above the pane and to its right, and lights its top right
 * corner (`lampLightLayerClasses`). Stacked, the lamp is in the picture
 * under the pane, at its right, so the light comes up from there instead:
 * a wash along the whole of the pane's foot, and over that a glow that
 * reaches across most of the pane from its bottom right corner, where it is
 * brightest.
 */
const cardLampLightClasses = `${lampLightLayerClasses} @max-[50rem]/home:bg-[radial-gradient(118%_130%_at_100%_100%,rgb(255_190_120/0.46),rgb(255_190_120/0.26)_26%,rgb(255_190_120/0.12)_52%,rgb(255_190_120/0.04)_72%,transparent_86%),linear-gradient(to_top,rgb(255_190_120/0.14),transparent_55%)]`;

/**
 * The action has the lamp's light on it too, in its top right corner. On
 * the stacked pane it is lit from below like the pane itself.
 */
const cardActionLampLightClasses =
  "@max-[50rem]/home:before:bg-[radial-gradient(130%_170%_at_100%_100%,rgb(255_190_120/0.36),rgb(255_190_120/0.1)_38%,transparent_68%)]";

/**
 * The thumbnail stands in the side the words leave free, three quarters of
 * the card's height and centred in it, with the glass showing above and
 * below. It stops a little short of the words, and has faded out by then,
 * so there is clear glass between the two. It is cropped from its middle to
 * that shape rather than squeezed into it.
 *
 * Its mask is three fades multiplied together: across (in from the left,
 * out towards the words), down (in from the top, out well before the
 * bottom), and one more from the top left corner.
 *
 * As the card leans, it drifts against the pointer (see `cardClasses`).
 */
const cardThumbnailClasses = [
  "absolute top-1/2 left-0 right-[calc(var(--words-w)_+_0.25rem)] block h-[76%] -translate-y-1/2 overflow-hidden",
  "[mask-image:linear-gradient(to_right,transparent,black_20%,black_78%,transparent),linear-gradient(to_bottom,transparent,black_15%,black_68%,transparent),radial-gradient(100%_100%_at_0_0,transparent_6%,black_42%)] [mask-composite:intersect]",
  "[[data-tilting]_&]:[transform:translate3d(calc(var(--tilt-x,0)*-16px),calc(var(--tilt-y,0)*-12px),0)]",
].join(" ");

const quietTextClasses = "text-slate-300";

/**
 * How far the learner is through the course, in words, at the end of the
 * lesson's line and over the progress bar. A course that has not been
 * started has no progress to speak of, and nothing is said of it.
 */
function CardProgressFigure({
  course,
  intent,
}: {
  course: EnrolledCourse;
  intent: LearnerHeroIntent;
}) {
  if (intent === "start" || intent === "next") return null;
  return (
    <span className="ml-auto font-medium whitespace-nowrap text-white/90">
      {course.progress ?? 0}% complete
    </span>
  );
}

/** The lesson the action leads to, and where the learner is in the course. */
function ResumeLesson({
  course,
  intent,
  resume,
}: {
  course: EnrolledCourse;
  intent: LearnerHeroIntent;
  resume: LearnerResume;
}) {
  if (resume.isLoading) {
    return (
      <div role="status" aria-busy="true" className="mt-2 grid gap-2.5">
        <span className="h-5 w-3/5 animate-pulse rounded-md bg-current/12 motion-reduce:animate-none" />
        <span className="h-4 w-2/5 animate-pulse rounded-md bg-current/12 motion-reduce:animate-none" />
        <span className="sr-only">Finding your next lesson</span>
      </div>
    );
  }

  const context = resume.context;
  const lesson = context?.resumeLesson;

  if (!lesson) {
    const finished =
      intent === "review" && context ? context.totalLessons : null;
    return (
      <p
        className={`mt-3 flex items-center gap-2 text-[clamp(0.8125rem,5.5cqw,0.875rem)] ${quietTextClasses}`}
      >
        {finished ? (
          <>
            <CheckCircle
              size={18}
              weight="fill"
              aria-hidden="true"
              className="shrink-0 text-emerald-400"
            />
            All {finished} lessons completed
          </>
        ) : (
          <>
            {course.totalSections}{" "}
            {course.totalSections === 1 ? "Section" : "Sections"}
            <span aria-hidden="true">•</span>
            {course.totalLessons}{" "}
            {course.totalLessons === 1 ? "Lecture" : "Lectures"}
            <CardProgressFigure course={course} intent={intent} />
          </>
        )}
      </p>
    );
  }

  return (
    <>
      {/* Always one line, cut off with an ellipsis. */}
      <p className="mt-1 truncate text-[clamp(0.875rem,6.2cqw,1rem)] font-medium text-[color-mix(in_srgb,var(--accent)_48%,white)]">
        {lesson.title}
      </p>
      <p
        className={`mt-3 flex min-w-0 items-center gap-x-2 text-[clamp(0.8125rem,5.5cqw,0.875rem)] ${quietTextClasses}`}
      >
        <span className="whitespace-nowrap">
          Lesson {lesson.lessonNumber} of {context.totalLessons}
        </span>
        <CardProgressFigure course={course} intent={intent} />
      </p>
    </>
  );
}

/**
 * The course the hero leads with, as a card (see `cardClasses`): its
 * thumbnail, the lesson the learner is on, how far they are through the
 * course, and the one action that takes them back into it. The whole card
 * opens the course.
 */
export function LearnerResumeCard({
  course,
  intent,
  resume,
  href,
  onOpen,
}: {
  course: EnrolledCourse;
  intent: LearnerHeroIntent;
  resume: LearnerResume;
  /** The course's address, for the action to be a real link. */
  href: string;
  onOpen: () => void;
}) {
  const progress = course.progress ?? 0;
  const showProgress = intent === "continue" || intent === "review";
  const ActionIcon = intent === "review" ? BookOpen : Play;
  const cardPlaceRef = useRef<HTMLDivElement>(null);
  useCardTilt(cardPlaceRef);

  return (
    <div
      ref={cardPlaceRef}
      className={cardPlaceClasses}
      data-sidebar-swipe-ignore=""
    >
      <div className={`${cardClasses} ${tiltLayerClass}`}>
        <span aria-hidden="true" className={cardLampLightClasses} />
        <span className={`${cardThumbnailClasses} ${tiltLayerClass}`}>
          <LearnerCourseThumbnail course={course} priority />
        </span>

        <span aria-hidden="true" className={cardGlareClasses} />
        {/* The whole card opens the course, so the pointer is a hand all over
          it. This lies over the thumbnail and the glass; the words above it
          let the pointer through to it, and the action takes it itself. The
          action is the same link, with its name. */}
        <GuestHomeLink
          href={href}
          onNavigatePage={onOpen}
          tabIndex={-1}
          aria-hidden="true"
          // The titles above are each cut to one line and let the pointer
          // through to this link, so the link says them in full on hover.
          title={[course.courseTitle, resume.context?.resumeLesson?.title]
            .filter(Boolean)
            .join(" — ")}
          className="absolute inset-0 rounded-[inherit]"
        />

        <div className="pointer-events-none z-10 flex w-(--words-w) min-w-0 shrink-0 flex-col items-start justify-center py-4 pr-4 pl-3 [text-shadow:0_1px_2px_rgb(0_0_0/0.45)] [[data-tilting]_&]:[transform:translate3d(calc(var(--tilt-x,0)*6px),calc(var(--tilt-y,0)*5px),0)] [@media(hover:hover)_and_(pointer:fine)]:will-change-transform @7xl/home:pr-5">
          <div className="@container/resume w-full min-w-0">
            <h2 className="line-clamp-2 text-[clamp(1.125rem,8.5cqw,1.375rem)] leading-snug font-bold tracking-[-0.015em]">
              {course.courseTitle}
            </h2>
            <ResumeLesson course={course} intent={intent} resume={resume} />
          </div>

          {/* Shown once there is progress: a course not started yet has only
            its action. The figure for the bar is on the line above it. */}
          {showProgress ? (
            <span
              role="progressbar"
              aria-label={`${course.courseTitle} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-current/14"
              data-sidebar-swipe-ignore=""
            >
              <span
                className="block h-full rounded-full bg-[color-mix(in_srgb,var(--accent)_70%,white)]"
                style={{ width: `${progress}%` }}
              />
            </span>
          ) : null}

          {/* The shared action is taller, and wider at its sides, than the
            card's words have room for. */}
          <GuestHomeLink
            href={href}
            onNavigatePage={onOpen}
            data-control-radius-action
            className={`${primaryActionClasses} pointer-events-auto mt-4 min-h-11! w-full min-w-0 px-3! text-[0.9375rem]! [text-shadow:none] [[data-tilting]_&]:[transform:translate3d(calc(var(--tilt-x,0)*5px),calc(var(--tilt-y,0)*4px),0)] @7xl/home:min-h-12! @7xl/home:text-base! ${cardActionLampLightClasses} ${tiltLayerClass}`}
          >
            <ActionIcon
              size={18}
              weight={intent === "review" ? "regular" : "fill"}
              aria-hidden="true"
            />
            {actionLabels[intent]}
          </GuestHomeLink>
        </div>
      </div>
    </div>
  );
}
