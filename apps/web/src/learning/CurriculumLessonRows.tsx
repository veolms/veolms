import { memo } from "react";
import type { RefObject } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { ProgressRing } from "../components/ProgressRing";
import type { LessonResource } from "@veolms/contracts";
import type { Lesson } from "./courseContent";
import { CurriculumLessonCard } from "./CurriculumLessonCard";
import { useLessonHoverPreload } from "./useLessonHoverPreload";

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

interface CurriculumLessonButtonProps {
  lesson: Lesson;
  /** The number the lesson is shown with (see `lessonNumberBase`). */
  displayNumber: number;
  progress: number;
  isActive: boolean;
  isAvailable: boolean;
  onSelectLesson: (lessonNumber: number) => void;
  onClose?: () => void;
  activeLessonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * The course to preload the lesson through while the pointer rests on
   * it. Left out, the lesson is not preloaded.
   */
  hoverPreloadCourseKey?: string;
  /** Extra classes for the row itself (how it behaves off screen). */
  className?: string;
}

const CurriculumLessonButton = memo(function CurriculumLessonButton({
  lesson,
  displayNumber,
  progress,
  isActive,
  isAvailable,
  onSelectLesson,
  onClose,
  activeLessonRef,
  hoverPreloadCourseKey,
  className = "",
}: CurriculumLessonButtonProps) {
  const [number, title, duration, status, , contentType] = lesson;
  const hoverPreload = useLessonHoverPreload(
    hoverPreloadCourseKey,
    number,
    isAvailable && !isActive && (contentType ?? "video") === "video",
  );
  const completed =
    status === "done" || progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
  const showProgress = isActive || progress > 0;

  return (
    <button
      type="button"
      ref={activeLessonRef}
      disabled={!isAvailable}
      title={isAvailable ? undefined : "Log in to watch this lecture"}
      aria-label={isAvailable ? undefined : `${title} (log in to watch)`}
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
      className={`${className} learning-curriculum__lesson ${isActive ? "is-active" : ""} ${!isAvailable ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {completed ? (
        <span
          className="learning-curriculum__lesson-status"
          aria-label="Completed"
        >
          <Check size={12} weight="bold" />
        </span>
      ) : showProgress ? (
        <span
          className="learning-curriculum__lesson-progress"
          role="progressbar"
          aria-label={`Lecture ${displayNumber} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={`${Math.round(progress)}% watched`}
        >
          <ProgressRing
            share={progress / 100}
            stroke={4.5}
            animate={false}
            className="size-full"
          />
        </span>
      ) : (
        <Circle
          size={20}
          className="learning-curriculum__lesson-status learning-curriculum__lesson-status--todo"
        />
      )}
      <span className="learning-curriculum__lesson-number">
        {displayNumber}.
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="learning-curriculum__lesson-duration">{duration}</span>
    </button>
  );
});

interface CurriculumLessonRowsProps {
  sectionId: number;
  sectionTitle: string;
  lessons: readonly Lesson[];
  selectedLesson: number;
  lessonProgress: Readonly<Record<number, number>>;
  onSelectLesson: (lessonNumber: number) => void;
  isLessonAvailable?: (lessonNumber: number) => boolean;
  /** Lessons the visitor cannot play yet; their cards show a lock. */
  lockedLessonNumbers?: ReadonlySet<number>;
  onClose?: () => void;
  activeLessonRef: RefObject<HTMLButtonElement | null>;
  /** The mini player's playlist keeps the dense single-line rows. */
  compact?: boolean;
  /**
   * What is taken off a lesson's number in the course to give the number
   * it is shown with: 0 when lessons are numbered straight through the
   * course, or one less than the section's first lesson when every section
   * starts again at 1.
   */
  lessonNumberBase?: number;
  lessonResources?: ReadonlyMap<number, readonly LessonResource[]>;
  resourceCourseKey?: string;
  quizLessonNumbers?: ReadonlySet<number>;
  activeQuizLesson?: number | null;
  onOpenLessonQuiz?: (lessonNumber: number) => void;
  portalContainer?: RefObject<HTMLElement | null>;
}

/**
 * Every lesson of the section is in the page; none is added or taken away
 * as the panel scrolls, so scrolling is the browser's own and costs no
 * script. What keeps a long course cheap is `content-visibility`: a lesson
 * off screen is not laid out or painted until it comes near, and holds its
 * place meanwhile at the height it was last seen with (or the usual one).
 *
 * The lesson being played is left out of that: the containment would cut
 * off the shadow it casts.
 */
const CARD_HEIGHT = 86;
const CARD_GAP = 6;
/**
 * The list's own padding: a little above its first card, and under its
 * last as much as the block's bottom corners are deep: once the last card
 * has passed behind a heading that holds to the top of the panel
 * (Curriculum.tsx), only that rounded foot is left under it, which the
 * heading then takes over.
 */
const CARD_LIST_PADDING_TOP = 8;
const CARD_LIST_PADDING_BOTTOM = 16;
const OFFSCREEN_CARD_CLASSES =
  "[content-visibility:auto] [contain-intrinsic-size:auto_86px]";
const OFFSCREEN_ROW_CLASSES =
  "[content-visibility:auto] [contain-intrinsic-size:auto_46px]";

/**
 * It is kept from rendering again unless something of its own changes: the
 * panel renders for many reasons that are none of a section's business (a
 * drag of its edge, another section opening), and a long course has several
 * hundred lessons to go through each time.
 */
export const CurriculumLessonRows = memo(function CurriculumLessonRows(
  props: CurriculumLessonRowsProps,
) {
  const offscreenClasses = props.compact
    ? OFFSCREEN_ROW_CLASSES
    : OFFSCREEN_CARD_CLASSES;
  // The classes go on the lesson's own element: a wrapper for each would
  // be one more element per lesson for every style pass to walk.
  const rows = props.lessons.map((lesson) => (
    <CurriculumLesson
      key={lesson[0]}
      rows={props}
      lesson={lesson}
      className={
        lesson[0] === props.selectedLesson ? undefined : offscreenClasses
      }
    />
  ));
  if (props.compact) return <>{rows}</>;

  const count = props.lessons.length;
  return (
    // The cards stand inside their section's block, right under its
    // heading (whose progress bar parts the two), with the same small room
    // around them as the course page's outline gives its lessons.
    //
    // The whole list is skipped too while the section is off screen, so a
    // change to the panel's width lays out the sections in view and passes
    // over the rest as one box each. Until it has been seen it stands at
    // the height its lessons usually come to. A different number of
    // lessons (a search) starts it afresh: the height it was last seen
    // with would no longer be its own.
    //
    // The skipping is a plain block's around the list, not the padded list's
    // own: Safari held a skipped list at its padding and gaps (its cards
    // counted as nothing) instead of that height, so the panel's scroll
    // height jumped once a later section came near; a plain block keeps it.
    // Unpadded, the block's placeholder is also the list's whole height,
    // padding included.
    <div
      key={count}
      className="[content-visibility:auto]"
      style={{
        containIntrinsicBlockSize: `auto ${count * (CARD_HEIGHT + CARD_GAP) - CARD_GAP + CARD_LIST_PADDING_TOP + CARD_LIST_PADDING_BOTTOM}px`,
      }}
    >
      <div className="flex flex-col gap-1.5 px-2 pt-2 pb-4">{rows}</div>
    </div>
  );
});

interface CurriculumLessonProps {
  rows: CurriculumLessonRowsProps;
  lesson: Lesson;
  className?: string;
}

/** A lesson in whichever presentation the list uses. */
function CurriculumLesson({ rows, lesson, className }: CurriculumLessonProps) {
  const number = lesson[0];
  const isActive = rows.selectedLesson === number;
  const shared = {
    lesson,
    displayNumber: number - (rows.lessonNumberBase ?? 0),
    progress: getLessonProgress(rows.lessonProgress, lesson),
    isActive,
    isAvailable: rows.isLessonAvailable?.(number) ?? true,
    onSelectLesson: rows.onSelectLesson,
    onClose: rows.onClose,
    activeLessonRef: isActive ? rows.activeLessonRef : undefined,
    // A locked lesson would only be refused; nothing to preload.
    hoverPreloadCourseKey: rows.lockedLessonNumbers?.has(number)
      ? undefined
      : rows.resourceCourseKey,
    className,
  };

  if (rows.compact) return <CurriculumLessonButton {...shared} />;

  return (
    <CurriculumLessonCard
      {...shared}
      isLocked={rows.lockedLessonNumbers?.has(number) ?? false}
      resources={rows.lessonResources?.get(number)}
      resourceCourseKey={rows.resourceCourseKey}
      hasQuiz={rows.quizLessonNumbers?.has(number) ?? false}
      quizActive={rows.activeQuizLesson === number}
      onOpenQuiz={rows.onOpenLessonQuiz}
      portalContainer={rows.portalContainer}
    />
  );
}

function getLessonProgress(
  lessonProgress: Readonly<Record<number, number>>,
  lesson: Lesson,
) {
  const [number, , , status] = lesson;
  const storedProgress = lessonProgress[number];
  if (typeof storedProgress === "number") {
    return Math.max(0, Math.min(100, storedProgress));
  }
  return status === "done" ? 100 : 0;
}
