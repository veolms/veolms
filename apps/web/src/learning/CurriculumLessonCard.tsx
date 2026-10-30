import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { BrainIcon as Brain } from "@phosphor-icons/react/Brain";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { memo } from "react";
import type { RefObject } from "react";
import type { LessonResource } from "@veolms/contracts";
import type { Lesson } from "./courseContent";
import { LessonResourcesMenu } from "./LessonResourcesMenu";
import { LESSON_CARD_ACTION_CLASS } from "./lessonCardAction";
import { NON_VIDEO_LESSON_LABELS } from "./lessonWithoutVideo";
import { useLessonHoverPreload } from "./useLessonHoverPreload";
import { useWebContributions } from "../lib/web-contributions";
import "./curriculum-lesson-card.css";

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

/**
 * Bars of the "now playing" glyph. Each has its own resting height, so the
 * glyph still reads as an equalizer when the animation is off (reduced
 * motion), and a negative delay, so every bar starts mid-cycle.
 */
const NOW_PLAYING_BARS = [
  { height: "62%", delay: "-0.9s" },
  { height: "100%", delay: "-0.45s" },
  { height: "45%", delay: "0s" },
];

/**
 * The mark of the lesson that is open right now: an animated equalizer for
 * a video, since one is playing; an open book for a reading and the exam
 * sheet for a quiz, which play nothing.
 */
function NowPlayingGlyph({
  contentType,
  className = "",
}: {
  contentType: string;
  className?: string;
}) {
  if (contentType === "document") {
    return (
      <BookOpen
        size={15}
        weight="fill"
        className={`text-(--accent) ${className}`}
        aria-hidden="true"
      />
    );
  }
  if (contentType === "quiz") {
    return (
      <Exam
        size={15}
        weight="fill"
        className={`text-(--accent) ${className}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={`flex size-3.5 items-end justify-center gap-[2.5px] text-(--accent) ${className}`}
      aria-hidden="true"
    >
      {NOW_PLAYING_BARS.map((bar) => (
        <span
          key={bar.delay}
          className="w-[3px] origin-bottom rounded-full bg-current animate-[learning-lesson-now-playing_1.05s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ height: bar.height, animationDelay: bar.delay }}
        />
      ))}
    </span>
  );
}

/**
 * An action that shows on the lesson being played, and on the others while
 * the card is hovered, focused or its menu is open, so a list of lessons is
 * not a column of buttons. A screen with no hover (touch) always shows it.
 * The space stays taken, so the actions to its right never move.
 */
const revealOnHover = (isActive: boolean) =>
  `flex transition-opacity duration-150 ${
    isActive
      ? "opacity-100"
      : "opacity-0 pointer-events-none group-hover/lesson:pointer-events-auto group-hover/lesson:opacity-100 focus-within:opacity-100 has-data-popup-open:pointer-events-auto has-data-popup-open:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
  }`;

export interface CurriculumLessonCardProps {
  lesson: Lesson;
  /**
   * The number the lesson is shown with: its place in its section, or in
   * the whole course when the learner has chosen that.
   */
  displayNumber: number;
  progress: number;
  isActive: boolean;
  isAvailable: boolean;
  /**
   * The visitor cannot play this lesson yet (not signed in, or without
   * access to the course). The card still opens the lesson, where they are
   * asked to log in or get access; a lock marks it in the list.
   */
  isLocked?: boolean;
  onSelectLesson: (lessonNumber: number) => void;
  onClose?: () => void;
  activeLessonRef?: RefObject<HTMLButtonElement | null>;
  resources?: readonly LessonResource[];
  /**
   * Course slug or id; resources are downloaded through this course, and
   * plugin lesson actions act on it.
   */
  resourceCourseKey?: string;
  hasQuiz?: boolean;
  /** The lesson's quiz is what the learner is looking at right now. */
  quizActive?: boolean;
  onOpenQuiz?: (lessonNumber: number) => void;
  portalContainer?: RefObject<HTMLElement | null>;
  /**
   * The course to preload the lesson through while the pointer rests on
   * it. Left out, the lesson is not preloaded.
   */
  hoverPreloadCourseKey?: string;
  /** Extra classes for the card itself (how it behaves off screen). */
  className?: string;
}

/** Shown only while the card is marked so (see the card's attributes). */
const WHEN_UNAVAILABLE = "hidden [[data-unavailable]_&]:block";
const WHEN_COMPLETED = "hidden [[data-completed]_&]:block";
const WHEN_IN_PROGRESS = "hidden [[data-in-progress]_&]:block";
const WHEN_LOCKED = "hidden [[data-locked]_&]:block";
const UNLESS_LOCKED = "[[data-locked]_&]:hidden [[data-unavailable]_&]:hidden";

/**
 * One lesson in the course content list. Watch progress is the percentage
 * beside the duration; a finished lesson shows a green check instead. The open lesson has an accent wash
 * and an animated equalizer instead of any outline.
 *
 * The lesson itself is one button; the quiz and resources actions sit beside
 * it rather than inside it, because a button cannot contain other buttons.
 *
 * Everything on the card that depends on who is looking (whether they may
 * play it, its lock, its tick, its progress) is in the markup whatever the
 * state, and attributes on the card pick what shows: `data-unavailable`
 * (not signed in: greyed, with a small lock by the length), `data-locked`
 * (signed in but without the course: a lock in the corner), `data-completed`
 * and `data-in-progress`. A lesson page is built for nobody in particular,
 * and a script in the document's head sets these from the browser's copies
 * before the page is drawn (lessonPageEarlyState.ts); the first render then
 * sets the same ones, so nothing on the card changes when it takes over.
 * The card's number and whether it is a preview are on it for that script.
 */
export const CurriculumLessonCard = memo(function CurriculumLessonCard({
  lesson,
  displayNumber,
  progress,
  isActive,
  isAvailable,
  isLocked = false,
  onSelectLesson,
  onClose,
  activeLessonRef,
  resources,
  resourceCourseKey,
  hasQuiz = false,
  quizActive = false,
  onOpenQuiz,
  portalContainer,
  hoverPreloadCourseKey,
  className = "",
}: CurriculumLessonCardProps) {
  const [number, title, duration, status, , contentType] = lesson;
  const hoverPreload = useLessonHoverPreload(
    hoverPreloadCourseKey,
    number,
    isAvailable &&
      !isLocked &&
      !isActive &&
      (contentType ?? "video") === "video",
  );
  const completed =
    status === "done" || progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
  const watched = completed ? 100 : Math.max(0, Math.min(100, progress));
  const inProgress = isAvailable && !completed && watched > 0;
  // A locked lesson shows its lock where the quiz and resources would be:
  // neither can be opened without the lesson.
  const showLock = isAvailable && isLocked;
  const hasQuizAction = hasQuiz && Boolean(onOpenQuiz);
  const hasResources = Boolean(resourceCourseKey) && Boolean(resources?.length);
  // Actions plugins add to every lesson card (see web-core contributions).
  // They need the course to act on and, like the quiz, an unlocked lesson.
  const { lessonCardActions } = useWebContributions();
  const showContributed =
    isAvailable &&
    !isLocked &&
    Boolean(resourceCourseKey) &&
    lessonCardActions.length > 0;
  // The card's last place is kept for actions plugins add (a download),
  // whether or not any have arrived: they arrive once the page is running,
  // and the actions before them would otherwise move aside then. The
  // whole corner is in the markup whenever there is a course to act on,
  // and put away by the card's attributes when nothing in it may show.
  const hasActions = Boolean(resourceCourseKey) || hasQuizAction;
  const lengthLabel =
    (contentType && NON_VIDEO_LESSON_LABELS[contentType]) || duration;

  return (
    <div
      data-learning-radius-surface=""
      data-curriculum-lesson-card=""
      data-lesson-number={number}
      data-preview={lesson[4] ? "" : undefined}
      data-active={isActive || undefined}
      data-unavailable={isAvailable ? undefined : ""}
      data-locked={showLock || undefined}
      data-completed={completed || undefined}
      data-in-progress={inProgress || undefined}
      className={`${className} group/lesson relative overflow-hidden rounded-xl transition-[background-color,box-shadow] duration-150 [&[data-unavailable]]:opacity-55 ${
        isActive
          ? // The sidebar's active surface, with a tighter bottom cast: the
            // sidebar shadow token spreads too far for cards stacked in a
            // list, so only its widest layers are reined in here.
            "bg-(image:--sidebar-menu-active-background) shadow-[inset_0_1px_0_rgb(255_255_255/15%),inset_1px_0_0_rgb(255_255_255/7%),inset_0_-1px_0_rgb(0_0_0/28%),0_2px_5px_rgb(0_0_0/45%),0_7px_14px_rgb(0_0_0/36%)] [[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/96%),0_2px_5px_rgb(25_32_45/10%),0_7px_16px_rgb(25_32_45/14%)]"
          : "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] [&:not([data-unavailable])]:hover:bg-[color-mix(in_srgb,var(--text)_7.5%,transparent)]"
      }`}
    >
      <button
        type="button"
        ref={activeLessonRef}
        disabled={!isAvailable}
        title={isAvailable ? undefined : "Log in to watch this lecture"}
        aria-current={isActive ? "true" : undefined}
        onPointerEnter={hoverPreload?.onPointerEnter}
        onPointerLeave={hoverPreload?.onPointerLeave}
        onFocus={hoverPreload?.onFocus}
        onBlur={hoverPreload?.onBlur}
        onClick={() => {
          if (!isAvailable) return;
          hoverPreload?.cancel();
          onSelectLesson(number);
          onClose?.();
        }}
        // Every card keeps room for an action at its foot (a download, the
        // quiz, the lock), whether or not it has one yet: actions a plugin
        // adds arrive once the page is running, and the card used to grow
        // then. A card is as tall before as after; only a title on two
        // lines makes it taller.
        className="block w-full cursor-pointer px-3 pt-3 pb-2.5 text-left focus-visible:-outline-offset-2! [[data-unavailable]_&]:cursor-not-allowed"
      >
        {/* Whole-pixel line heights here and in the meta line below: the
            cards stack, so a line box a fraction of a pixel tall would put
            every card after it on a fractional position, where a later
            paint (hydration's) snaps the text a pixel away from where the
            first paint had it. */}
        <span
          className="line-clamp-2 text-[0.875rem]/5 font-semibold text-(--text) [[data-completed]:not([data-active])_&]:text-[color-mix(in_srgb,var(--text)_72%,transparent)]"
          // A title longer than two lines is cut off; hovering shows all of it.
          title={isAvailable ? title : undefined}
        >
          {displayNumber}. {title}
        </span>
        <span className="mt-1.5 flex min-h-8 items-center gap-1.5 text-[0.8125rem]/5 font-medium tabular-nums text-(--muted)">
          <LockSimple
            size={13}
            weight="fill"
            className={WHEN_UNAVAILABLE}
            aria-hidden="true"
          />
          {isActive ? (
            // Nothing is open on a locked lesson, so no mark. A lesson
            // already finished keeps its tick beside the mark.
            <NowPlayingGlyph
              contentType={contentType ?? "video"}
              className={UNLESS_LOCKED}
            />
          ) : null}
          <CheckCircle
            size={17}
            weight="fill"
            className={`text-(--success) ${WHEN_COMPLETED}`}
            aria-hidden="true"
          />
          <span>{lengthLabel}</span>
          {/* A drawn dot: the middle-dot character sits below the centre
              of these digits. */}
          <span
            className={`size-[3px] shrink-0 rounded-full bg-current ${WHEN_IN_PROGRESS}`}
            aria-hidden="true"
          />
          <span className={WHEN_IN_PROGRESS} data-lesson-watched="">
            {`${Math.round(watched)}% complete`}
          </span>
          {/* Said after the lesson's length to a screen reader, each part
              only while the card is in that state. */}
          <span className={`sr-only ${WHEN_UNAVAILABLE}`}>
            , log in to watch
          </span>
          {isActive ? (
            <span
              className={`sr-only hidden [[data-curriculum-lesson-card]:not([data-unavailable]):not([data-locked])_&]:block`}
            >
              {contentType === "document"
                ? ", now reading"
                : contentType === "quiz"
                  ? ", now open"
                  : ", now playing"}
            </span>
          ) : null}
          <span
            className={`sr-only hidden [[data-completed]:not([data-unavailable])_&]:block`}
          >
            , completed
          </span>
          <span className={`sr-only ${WHEN_LOCKED}`}>, locked</span>
        </span>
      </button>
      {hasActions ? (
        <div className="absolute right-2 bottom-2.5 flex items-center gap-1.5 [[data-unavailable]_&]:hidden">
          {/* Not a button: the card itself opens the lesson. It lets a
              click through to the card underneath. */}
          <span
            className="pointer-events-none size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_22%,var(--canvas))] text-(--accent-ink,var(--accent)) hidden [[data-locked]_&]:inline-flex"
            title="Locked"
            aria-hidden="true"
          >
            <LockSimple size={16} weight="fill" />
          </span>
          {hasQuizAction ? (
            // See `revealOnHover`; kept in sight while its quiz is open.
            <span
              className={`${revealOnHover(isActive || quizActive)} ${UNLESS_LOCKED}`}
            >
              <button
                type="button"
                className={`${LESSON_CARD_ACTION_CLASS} bg-[color-mix(in_srgb,#a050d0_30%,var(--canvas))] text-[#c183ea] hover:bg-[color-mix(in_srgb,#a050d0_44%,var(--canvas))] aria-pressed:bg-[#8e3db4] aria-pressed:text-white [[data-theme=light]_&]:text-purple-700 [[data-theme=light]_&]:aria-pressed:text-white`}
                aria-label={`Open quiz for lecture ${displayNumber}: ${title}`}
                aria-pressed={quizActive}
                title={quizActive ? "Quiz is open" : "Open quiz"}
                onClick={() => onOpenQuiz?.(number)}
              >
                <Brain size={18} weight="fill" aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {hasResources && resources && resourceCourseKey ? (
            // See `revealOnHover`.
            <span className={`${revealOnHover(isActive)} ${UNLESS_LOCKED}`}>
              <LessonResourcesMenu
                courseKey={resourceCourseKey}
                lessonNumber={number}
                lessonTitle={title}
                resources={resources}
                portalContainer={portalContainer}
              />
            </span>
          ) : null}
          {/* Last, so a download is always at the card's right edge. Its
              place is kept from the first paint (see `hasActions`), and
              like the resources it shows on the lesson being played and on
              the others under the pointer. */}
          {resourceCourseKey ? (
            <span
              data-lesson-card-plugin-actions=""
              className={`min-w-8 justify-end gap-1.5 ${revealOnHover(isActive)} ${UNLESS_LOCKED}`}
            >
              {showContributed
                ? lessonCardActions.map(({ id, component: Action }) => (
                    <Action
                      key={id}
                      courseKey={resourceCourseKey}
                      lessonNumber={number}
                      displayNumber={displayNumber}
                      lessonTitle={title}
                      contentType={contentType ?? "video"}
                      isActive={isActive}
                      actionClassName={LESSON_CARD_ACTION_CLASS}
                    />
                  ))
                : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
