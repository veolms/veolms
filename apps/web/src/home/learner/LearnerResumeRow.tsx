import { ArrowElbowDownLeftIcon as ArrowElbowDownLeft } from "@phosphor-icons/react/ArrowElbowDownLeft";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import type {
  EnrolledCourse,
  LearningProgressResumeContextResponse,
} from "@veolms/contracts";
import { useRef, type ReactNode } from "react";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "../guest/GuestHomeLink";
import {
  lampLightLayerClasses,
  primaryActionClasses,
} from "../guest/heroActionClasses";
import { formatCourseProgress } from "../../learning/courseProgressFormat";
import { playEnterKeySound, prepareEnterKeySound } from "./enterKeySound";
import { LearnerCourseThumbnail } from "./LearnerCourseThumbnail";
import {
  getEnrolledCourseOverviewHref,
  VIEW_COURSE_CURRICULUM_HINT,
  type LearnerHeroIntent,
} from "./learnerHomePlan";
import {
  resumePaneClasses,
  resumeRowBoxClasses,
  resumeRowContentClasses,
  resumeThumbnailClasses,
} from "./learnerHeroLayout";
import { useEnterKeyAction } from "./useEnterKeyAction";
import { useIsCutOff } from "./useIsCutOff";
import { usePinnedCelebration } from "./usePinnedCelebration";

/** Where in the course the learner goes next, once it is known. */
export interface LearnerResume {
  context: LearningProgressResumeContextResponse | null;
  isLoading: boolean;
}

/**
 * How long after a tap the key's release is heard. A tap is only known to be
 * one when it ends, so both strokes are played then, this far apart.
 */
const TAP_KEY_RELEASE_MS = 70;

/** What the row is for, said before where the learner is in the course. */
const leadLabels: Record<LearnerHeroIntent, string> = {
  start: "Start",
  continue: "Continue",
  next: "Up next",
  review: "Completed",
};

/**
 * The lamp's light on the pane, while the lamp is on. Beside the picture
 * the lamp hangs above the pane and to its right, and lights its top right
 * corner. Stacked, the lamp is in the picture under the pane, so the light
 * comes up from its bottom right corner instead. A phone shows no lamp, so
 * there is no lamp light on it: the pane and its key keep their own colours,
 * with only the hero's background glow behind them.
 */
const paneLampLightClasses = `${lampLightLayerClasses} max-sm:hidden @max-[50rem]/home:bg-[radial-gradient(118%_130%_at_100%_100%,color-mix(in_srgb,var(--lamp-frost)_22%,transparent),color-mix(in_srgb,var(--lamp-frost)_11%,transparent)_26%,color-mix(in_srgb,var(--lamp-frost)_4%,transparent)_52%,transparent_78%)]`;

/**
 * The action is drawn as the Enter key of a keyboard, in the accent's
 * colour: a cap with a lit top edge standing on a darker side, which it
 * sinks into while it is pressed, by the pointer or by the Enter key itself
 * (see `useEnterKeyAction`), with the sound of a mechanical keyboard's
 * (see `enterKeySound`). It is named for the key, "Enter", whatever the
 * learner is to do in the course; the line beside it says that. The key's
 * own sign follows its name on every screen, touch screens included.
 */
const enterKeyClasses = [
  "[--key-side:color-mix(in_srgb,var(--accent)_56%,black)]",
  // An accent that is nearly black (the codex palette by day) has no darker
  // shade left to stand on: its side would vanish into the cap. There the
  // side is a slightly lighter shade of the same hue instead, so the key still reads
  // as raised. The step is 1 only when the darkened accent falls under 0.22
  // lightness, so every other palette keeps the side it has.
  "supports-[color:oklch(from_white_l_c_h)]:[--key-side:oklch(from_color-mix(in_srgb,var(--accent)_56%,black)_calc(l_+_0.2_*_clamp(0,(0.22_-_l)_*_1000,1))_c_h)]",
  "mb-1 rounded-[0.625rem]!",
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.5),inset_0_-1px_0_rgb(0_0_0/0.14),0_4px_0_var(--key-side),0_10px_16px_-6px_rgb(0_0_0/0.65)]!",
  "transition-[background-color,box-shadow,translate]! duration-75! motion-reduce:transition-none!",
  "active:translate-y-0.75 active:shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.14),0_1px_0_var(--key-side),0_3px_6px_-3px_rgb(0_0_0/0.6)]!",
  "data-pressed:translate-y-0.75 data-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_0_rgb(0_0_0/0.14),0_1px_0_var(--key-side),0_3px_6px_-3px_rgb(0_0_0/0.6)]!",
].join(" ");

/**
 * The course the hero leads with, as a row (see `resumePaneClasses`). The whole
 * row opens the course at the lesson to carry on with, and so does the
 * Enter key.
 */
export function LearnerResumeRow({
  course,
  intent,
  resume,
  href,
  onOpen,
  pinned,
  onUnpin,
  onNavigatePage,
  pinDrop,
  pinPulse = 0,
}: {
  course: EnrolledCourse;
  intent: LearnerHeroIntent;
  resume: LearnerResume;
  /** The course's address, for the action to be a real link. */
  href: string;
  onOpen: () => void;
  /** The learner pinned this course here; the row lets them take it off. */
  pinned: boolean;
  onUnpin: () => void;
  /** For the course's name, which leads to the course's own page. */
  onNavigatePage: NavigateTo;
  /** Laid over the row, and a little past it, while a course is dragged. */
  pinDrop?: ReactNode;
  /**
   * How many times a course has been pinned on this page. Each new count
   * plays the row's "pinned" motion (see `usePinnedCelebration`).
   */
  pinPulse?: number;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLButtonElement>(null);
  usePinnedCelebration(paneRef, pinRef, pinned ? pinPulse : 0);
  const progress = course.progress ?? 0;
  // A course not started yet has no progress to speak of.
  const showProgress = intent === "continue" || intent === "review";
  const actionRef = useRef<HTMLAnchorElement>(null);
  /** The key's current press is a finger's (or a pen's), not a mouse's. */
  const touchPressRef = useRef(false);
  // Enter opens the lesson on every page, the row standing in for its key
  // where the key is not drawn (a phone, and beside the picture on a page
  // under 56rem).
  const enterPressed = useEnterKeyAction(actionRef, onOpen, paneRef);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleCutOff = useIsCutOff(titleRef, course.courseTitle);

  const lesson = intent === "review" ? null : resume.context?.resumeLesson;
  const totalLessons = resume.context?.totalLessons ?? course.totalLessons;
  const place = lesson
    ? `Lesson ${lesson.lessonNumber} of ${totalLessons}`
    : `${totalLessons} ${totalLessons === 1 ? "lesson" : "lessons"}`;

  return (
    <div className={resumeRowBoxClasses}>
      <div
        ref={paneRef}
        className={resumePaneClasses}
        // The key's sound is made ready on the way to a press.
        onPointerEnter={prepareEnterKeySound}
        onFocus={prepareEnterKeySound}
      >
        <span aria-hidden="true" className={paneLampLightClasses} />
        {/* The whole row opens the course, so the pointer is a hand all over
            it. This lies under the words, which let the pointer through to
            it; the action is the same link, with its name. */}
        <GuestHomeLink
          href={href}
          onNavigatePage={onOpen}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 rounded-[inherit]"
        />

        <div className={`pointer-events-none ${resumeRowContentClasses}`}>
          <span className={resumeThumbnailClasses}>
            <LearnerCourseThumbnail course={course} priority />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-xs text-(--muted)">
                {leadLabels[intent]}
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                {place}
              </p>
              {/* A pinned course stays here until the pin is taken off, and
                  this is the only place it can be: the row's course is not
                  among the cards below, whose menus do the pinning. */}
              {pinned ? (
                <button
                  ref={pinRef}
                  type="button"
                  onClick={onUnpin}
                  title="Unpin from Home"
                  aria-label={`Unpin ${course.courseTitle} from Home`}
                  className="pointer-events-auto -my-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-[color-mix(in_srgb,var(--accent)_70%,white)] transition-colors hover:bg-current/12 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current [:root[data-theme=light]_&]:text-(--accent)"
                >
                  <PushPin size={13} weight="fill" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {/* The name is the one thing on the row that does not open the
                lesson: it leads to the course's own page, where the
                curriculum is, and says so under the pointer. A name that is
                cut off says itself in full instead. Only its letters take
                the pointer; the rest of the line is the row's link. Where
                the row has no key (a phone, and beside the picture on a
                page under 56rem) the whole card is one link, so a click or
                a tap on the name opens the lesson like one anywhere else. */}
            <h2
              ref={titleRef}
              className="mt-0.5 line-clamp-2 text-[0.9375rem] leading-snug font-semibold @[28rem]/resume:block @[28rem]/resume:truncate @[50rem]/home:block @[50rem]/home:truncate"
            >
              <GuestHomeLink
                href={getEnrolledCourseOverviewHref(course)}
                onNavigatePage={onNavigatePage}
                title={
                  titleCutOff ? course.courseTitle : VIEW_COURSE_CURRICULUM_HINT
                }
                className="pointer-events-auto rounded-xs underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current max-sm:pointer-events-none max-sm:hover:no-underline @[50rem]/home:@max-[56rem]/home:pointer-events-none @[50rem]/home:@max-[56rem]/home:hover:no-underline"
              >
                {course.courseTitle}
              </GuestHomeLink>
            </h2>
            {showProgress ? (
              <div className="mt-1.5 flex items-center gap-2.5">
                <span
                  role="progressbar"
                  aria-label={`${course.courseTitle} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-current/14"
                >
                  <span
                    className="block h-full min-w-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_70%,white)] [:root[data-theme=light]_&]:bg-(--accent)"
                    style={{ width: `${progress}%` }}
                  />
                </span>
                <span className="text-xs leading-4 text-(--muted)">
                  {formatCourseProgress(progress)}
                </span>
              </div>
            ) : null}
          </div>

          {/* The shared action is taller, and wider at its sides, than the
              row has room for. A phone has no key, and neither has the row
              beside the picture on a page under 56rem, which keeps its
              thumbnail instead: the whole card is the link there, and a
              click or a tap anywhere on it opens the lesson. */}
          <GuestHomeLink
            ref={actionRef}
            href={href}
            onNavigatePage={onOpen}
            data-control-radius-action
            data-pressed={enterPressed ? "" : undefined}
            aria-keyshortcuts="Enter"
            aria-label={`Enter ${course.courseTitle}`}
            // The key sounds under the pointer as it does under the Enter
            // key: a mouse sounds it as the button goes down and up. A
            // finger only sounds it once the touch has turned out to be a
            // tap: one that lands on the key while the page is being
            // scrolled is not a press, and must not sound like one.
            onPointerDown={(event) => {
              touchPressRef.current = event.pointerType !== "mouse";
              if (event.button === 0 && !touchPressRef.current) {
                playEnterKeySound("down");
              }
            }}
            onPointerUp={(event) => {
              if (event.button === 0 && event.pointerType === "mouse") {
                playEnterKeySound("up");
              }
            }}
            onClick={() => {
              if (!touchPressRef.current) return;
              touchPressRef.current = false;
              playEnterKeySound("down");
              window.setTimeout(
                () => playEnterKeySound("up"),
                TAP_KEY_RELEASE_MS,
              );
            }}
            className={`${primaryActionClasses} ${enterKeyClasses} pointer-events-auto max-sm:hidden @[50rem]/home:@max-[56rem]/home:hidden min-h-11! w-full shrink-0 px-5! text-[0.9375rem]! @[28rem]/resume:w-auto @[50rem]/home:w-auto`}
          >
            Enter
            <ArrowElbowDownLeft
              size={17}
              weight="bold"
              aria-hidden="true"
              className="opacity-75"
            />
          </GuestHomeLink>
        </div>
      </div>
      {pinDrop}
    </div>
  );
}
