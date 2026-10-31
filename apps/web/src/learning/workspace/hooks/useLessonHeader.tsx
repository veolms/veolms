import {
  useLayoutEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
  type JSX,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import type {
  LessonVideoPlayerProps,
  RegisterPersistentLearningPlayer,
} from "../../player";
import type { Lesson } from "../../courseContent";
import type { AdaptedCurriculumSection } from "../../courseCurriculumAdapter";
import type { useLessonTitleHeightSwipe } from "../../player/LessonPlayerHeightHandle";
import type { LiveLessonProgress } from "../../player/liveLessonProgress";
import {
  endsTextSelection,
  releaseEarlierSelection,
} from "../../textSelectionClick";

export interface UseLessonHeaderArgs {
  courseSlug: string | undefined;
  persistentPlayerCourseRouteKey: string | undefined;
  persistentPlayerLessonPath: string | undefined;
  persistentPlayerReturnPath: string | undefined;
  registerPersistentPlayer: RegisterPersistentLearningPlayer | undefined;
  isLessonAvailable: (lessonNumber: number) => boolean;
  selectedLesson: number;
  lessonDrawer: boolean;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  lessonTriggerRef: RefObject<HTMLButtonElement | null>;
  curriculumSections: AdaptedCurriculumSection[];
  curriculumLessonsById: Map<number, Lesson>;
  currentLesson: Lesson;
  detachedProgressTarget:
    | {
        userId: string;
        courseKey: string;
        lessonIdsByNumber: ReadonlyMap<number, string> | undefined;
      }
    | undefined;
  liveLessonProgress: LiveLessonProgress;
  stickyPlayer: boolean;
  appliedPlayerHeight: number | null;
  readingGrowable:
    | {
        growth: number | null;
        onGrowthChange: Dispatch<SetStateAction<number | null>>;
      }
    | undefined;
  onHeaderPointerLeave: () => void;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  titleSwipeHandlers: Omit<
    ReturnType<typeof useLessonTitleHeightSwipe>,
    "onHeaderPointerMove" | "onHeaderPointerLeave"
  >;
  selectLesson: (lessonNumber: number, view?: "video" | "quiz") => void;
  openLessonDrawerInPlace: () => void;
  lessonPlayerProps: LessonVideoPlayerProps;
  /** The course editor with this lesson open, for those who may edit it. */
  lessonEditPath: string | null;
  onOpenLessonEditor?: (path: string) => void;
}

export interface UseLessonHeaderResult {
  lessonHeader: (contained?: boolean, titleLoading?: boolean) => JSX.Element;
}

export function useLessonHeader({
  courseSlug,
  persistentPlayerCourseRouteKey,
  persistentPlayerLessonPath,
  persistentPlayerReturnPath,
  registerPersistentPlayer,
  isLessonAvailable,
  selectedLesson,
  lessonDrawer,
  playerWrapRef,
  lessonTriggerRef,
  curriculumSections,
  curriculumLessonsById,
  currentLesson,
  detachedProgressTarget,
  liveLessonProgress,
  stickyPlayer,
  appliedPlayerHeight,
  readingGrowable,
  onHeaderPointerLeave,
  onHeaderPointerMove,
  titleSwipeHandlers,
  selectLesson,
  openLessonDrawerInPlace,
  lessonPlayerProps,
  lessonEditPath,
  onOpenLessonEditor,
}: UseLessonHeaderArgs): UseLessonHeaderResult {
  // Registers the player again whenever what it shows changes. Progress is
  // not among those: it is handed over as a live source (see
  // `liveLessonProgress`), since every registration re-renders the academy
  // layout in the middle of this commit.
  useLayoutEffect(() => {
    const anchor = playerWrapRef.current;
    if (
      !anchor ||
      !registerPersistentPlayer ||
      !persistentPlayerCourseRouteKey ||
      !persistentPlayerLessonPath ||
      !persistentPlayerReturnPath
    ) {
      return undefined;
    }

    return registerPersistentPlayer({
      anchor,
      courseRouteKey: persistentPlayerCourseRouteKey,
      lessonPath: persistentPlayerLessonPath,
      mediaKey:
        lessonPlayerProps.resumePersistenceKey ??
        lessonPlayerProps.media.fileName,
      playerProps: lessonPlayerProps,
      returnPath: persistentPlayerReturnPath,
      courseSlug,
      selectedLesson,
      onSelectLesson: selectLesson,
      curriculumSections,
      curriculumLessonsById,
      lessonProgress: liveLessonProgress,
      isLessonAvailable,
      progressTarget: detachedProgressTarget,
    });
  }, [
    courseSlug,
    curriculumLessonsById,
    curriculumSections,
    detachedProgressTarget,
    isLessonAvailable,
    lessonPlayerProps,
    liveLessonProgress,
    persistentPlayerCourseRouteKey,
    persistentPlayerLessonPath,
    persistentPlayerReturnPath,
    registerPersistentPlayer,
    selectLesson,
    selectedLesson,
    playerWrapRef,
  ]);

  const lessonHeader = (contained = false, titleLoading = false) => (
    <header
      // At phone width the header goes into the discussion's scroll area,
      // which is padded 10px at its top; this one stands there until the
      // page knows it is on a phone (a page built ahead of time does not),
      // and is set the same so that nothing moves when it is swapped.
      className={`learning-workspace__lesson-header ${
        contained ? "" : "max-[640px]:pt-2.5"
      }`}
      data-lesson-edit={lessonEditPath ? "" : undefined}
      // Tells the video's resize grip when a mouse is over its strip (at
      // phone width the strip lies over the top of this header).
      onPointerMove={stickyPlayer ? onHeaderPointerMove : undefined}
      onPointerLeave={stickyPlayer ? onHeaderPointerLeave : undefined}
    >
      <button
        id="learning-course-content-trigger"
        ref={lessonTriggerRef}
        type="button"
        className={`learning-workspace__lesson-heading ${appliedPlayerHeight === null && !readingGrowable ? "touch-pan-up" : "touch-none"}`}
        {...(stickyPlayer ? titleSwipeHandlers : undefined)}
        aria-label={`Open course lessons for ${currentLesson[1]}`}
        aria-expanded={lessonDrawer}
        // The title can be selected like any text (learning.css); a click
        // that only selected some of it does not open the lessons.
        onMouseDown={releaseEarlierSelection}
        onClick={(event) => {
          if (endsTextSelection(event)) return;
          openLessonDrawerInPlace();
        }}
      >
        <div className="min-w-0">
          {titleLoading ? (
            <span
              className="block h-5 w-40 max-w-full animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_12%,transparent)]"
              data-testid="learning-lesson-title-loading"
              aria-hidden="true"
            />
          ) : (
            <h1 id="learning-lesson-title">{currentLesson[1]}</h1>
          )}
        </div>
      </button>
      {lessonEditPath ? (
        // For staff who may change the curriculum: the editor, with this
        // lesson open. A link, so it can also be opened in a new tab.
        <a
          href={lessonEditPath}
          className="learning-workspace__lesson-edit inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-3 text-[0.86rem] font-semibold whitespace-nowrap text-(--text) no-underline transition-colors duration-140 hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          aria-label={`Edit lesson: ${currentLesson[1]}`}
          title="Edit this lesson in the course editor"
          onClick={(event) => {
            if (
              !onOpenLessonEditor ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            onOpenLessonEditor(lessonEditPath);
          }}
        >
          <PencilSimple size={15} weight="bold" aria-hidden="true" />
          <span>Edit</span>
        </a>
      ) : null}
      {/* No quiz button here: the course content list marks a lesson that
          has a quiz and opens it, and the open quiz carries its own way
          back to the video. */}
    </header>
  );
  return {
    lessonHeader,
  };
}
