import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { memo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { LessonResource } from "@veolms/contracts";
import type { Lesson } from "./courseContent";
import { LessonResourcesMenu } from "./LessonResourcesMenu";
import { LESSON_CARD_ACTION_CLASS } from "./lessonCardAction";
import "./curriculum-lesson-card.css";

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

const NON_VIDEO_LESSON_LABELS: Partial<Record<string, string>> = {
  document: "Reading",
  quiz: "Quiz",
};

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

/** Animated equalizer shown on the lesson that is open right now. */
function NowPlayingGlyph() {
  return (
    <span
      className="flex size-3.5 items-end justify-center gap-[2.5px] text-(--accent)"
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

export interface CurriculumLessonCardProps {
  lesson: Lesson;
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
  virtualIndex?: number;
  onVirtualizedKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  resources?: readonly LessonResource[];
  /** Course slug or id; resources are downloaded through this course. */
  resourceCourseKey?: string;
  hasQuiz?: boolean;
  /** The lesson's quiz is what the learner is looking at right now. */
  quizActive?: boolean;
  onOpenQuiz?: (lessonNumber: number) => void;
  portalContainer?: RefObject<HTMLElement | null>;
}

/**
 * One lesson in the course content list. Watch progress is the percentage
 * beside the duration; a finished lesson shows a green check instead. The open lesson has an accent wash
 * and an animated equalizer instead of any outline.
 *
 * The lesson itself is one button; the quiz and resources actions sit beside
 * it rather than inside it, because a button cannot contain other buttons.
 */
export const CurriculumLessonCard = memo(function CurriculumLessonCard({
  lesson,
  progress,
  isActive,
  isAvailable,
  isLocked = false,
  onSelectLesson,
  onClose,
  activeLessonRef,
  virtualIndex,
  onVirtualizedKeyDown,
  resources,
  resourceCourseKey,
  hasQuiz = false,
  quizActive = false,
  onOpenQuiz,
  portalContainer,
}: CurriculumLessonCardProps) {
  const [number, title, duration, status, , contentType] = lesson;
  const completed =
    status === "done" || progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
  const watched = completed ? 100 : Math.max(0, Math.min(100, progress));
  const inProgress = !completed && watched > 0;
  // A locked lesson shows its lock where the quiz and resources would be:
  // neither can be opened without the lesson.
  const showLock = isAvailable && isLocked;
  const showQuiz = isAvailable && !isLocked && hasQuiz && Boolean(onOpenQuiz);
  const showResources =
    isAvailable &&
    !isLocked &&
    Boolean(resourceCourseKey) &&
    Boolean(resources?.length);
  const hasActions = showLock || showQuiz || showResources;
  const lengthLabel =
    (contentType && NON_VIDEO_LESSON_LABELS[contentType]) || duration;

  return (
    <div
      data-learning-radius-surface=""
      data-curriculum-lesson-card=""
      data-active={isActive || undefined}
      data-completed={completed || undefined}
      className={`group/lesson relative overflow-hidden rounded-lg transition-[background-color,box-shadow] duration-150 ${
        isActive
          ? // The sidebar's active surface, with a tighter bottom cast: the
            // sidebar shadow token spreads too far for cards stacked in a
            // list, so only its widest layers are reined in here.
            "bg-(image:--sidebar-menu-active-background) shadow-[inset_0_1px_0_rgb(255_255_255/15%),inset_1px_0_0_rgb(255_255_255/7%),inset_0_-1px_0_rgb(0_0_0/28%),0_2px_5px_rgb(0_0_0/45%),0_7px_14px_rgb(0_0_0/36%)] [[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/96%),0_2px_5px_rgb(25_32_45/10%),0_7px_16px_rgb(25_32_45/14%)]"
          : "bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
      } ${
        isAvailable
          ? isActive
            ? ""
            : "hover:bg-[color-mix(in_srgb,var(--text)_7.5%,transparent)]"
          : "opacity-55"
      }`}
    >
      <button
        type="button"
        ref={activeLessonRef}
        disabled={!isAvailable}
        title={isAvailable ? undefined : "Log in to watch this lecture"}
        aria-current={isActive ? "true" : undefined}
        data-curriculum-lesson-index={virtualIndex}
        onKeyDown={onVirtualizedKeyDown}
        onClick={() => {
          if (!isAvailable) return;
          onSelectLesson(number);
          onClose?.();
        }}
        className={`block w-full px-3.5 pt-3 text-left focus-visible:-outline-offset-2! ${
          hasActions ? "pb-2.5" : "pb-3"
        } ${isAvailable ? "cursor-pointer" : "cursor-not-allowed"}`}
      >
        <span
          className={`line-clamp-2 text-[0.875rem]/[1.4] font-semibold ${
            completed && !isActive
              ? "text-[color-mix(in_srgb,var(--text)_72%,transparent)]"
              : "text-(--text)"
          }`}
          // A title longer than two lines is cut off; hovering shows all of it.
          title={isAvailable ? title : undefined}
        >
          {number}. {title}
        </span>
        <span
          className={`mt-1.5 flex items-center gap-1.5 text-[0.8125rem] font-medium tabular-nums text-(--muted) ${
            hasActions ? "min-h-8" : "min-h-5"
          }`}
        >
          {!isAvailable ? (
            <LockSimple size={13} weight="fill" aria-hidden="true" />
          ) : isActive && !showLock ? (
            // Nothing is playing on a locked lesson, so no equalizer. A
            // lesson already finished keeps its tick beside the bars.
            <>
              <NowPlayingGlyph />
              {completed ? (
                <CheckCircle
                  size={17}
                  weight="fill"
                  className="text-(--success)"
                  aria-hidden="true"
                />
              ) : null}
            </>
          ) : completed ? (
            <CheckCircle
              size={17}
              weight="fill"
              className="text-(--success)"
              aria-hidden="true"
            />
          ) : null}
          <span>{lengthLabel}</span>
          {isAvailable && inProgress ? (
            <>
              {/* A drawn dot: the middle-dot character sits below the
                  centre of these digits. */}
              <span
                className="size-[3px] shrink-0 rounded-full bg-current"
                aria-hidden="true"
              />
              <span>{Math.round(watched)}% complete</span>
            </>
          ) : null}
          <span className="sr-only">
            {!isAvailable
              ? ", log in to watch"
              : `${isActive && !showLock ? ", now playing" : ""}${completed ? ", completed" : ""}${showLock ? ", locked" : ""}`}
          </span>
        </span>
      </button>
      {hasActions ? (
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
          {showLock ? (
            // Not a button: the card itself opens the lesson. It lets a
            // click through to the card underneath.
            <span
              className="pointer-events-none inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_22%,var(--canvas))] text-(--accent-ink,var(--accent))"
              title="Locked"
              aria-hidden="true"
            >
              <LockSimple size={16} weight="fill" />
            </span>
          ) : null}
          {showQuiz ? (
            <button
              type="button"
              className={`${LESSON_CARD_ACTION_CLASS} bg-[color-mix(in_srgb,#a050d0_30%,var(--canvas))] text-[#c183ea] hover:bg-[color-mix(in_srgb,#a050d0_44%,var(--canvas))] aria-pressed:bg-[#8e3db4] aria-pressed:text-white [[data-theme=light]_&]:text-purple-700 [[data-theme=light]_&]:aria-pressed:text-white`}
              aria-label={`Open quiz for lecture ${number}: ${title}`}
              aria-pressed={quizActive}
              title={quizActive ? "Quiz is open" : "Open quiz"}
              onClick={() => onOpenQuiz?.(number)}
            >
              <Exam size={17} weight="fill" aria-hidden="true" />
            </button>
          ) : null}
          {showResources && resources && resourceCourseKey ? (
            <LessonResourcesMenu
              courseKey={resourceCourseKey}
              lessonNumber={number}
              lessonTitle={title}
              resources={resources}
              portalContainer={portalContainer}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
