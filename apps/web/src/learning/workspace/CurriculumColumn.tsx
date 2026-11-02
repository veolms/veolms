import type { RefObject, Dispatch, SetStateAction } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Lesson } from "../courseContent";
import {
  SplitFrameGutter,
  SplitFramePane,
} from "../../components/SplitFramePane";
import {
  COURSE_CONTENT_SHORTCUT_ARIA,
  type getRightPanelShortcutLabel,
} from "../../keyboardShortcuts";
import { Curriculum } from "../Curriculum";
import type { AdaptedCurriculumSection } from "../courseCurriculumAdapter";
import {
  CURRICULUM_COLLAPSED_WIDTH,
  CURRICULUM_MAX_WIDTH,
  CURRICULUM_MIN_WIDTH,
  LEARNING_SPLIT_MEDIA,
} from "../learningShellPreferences";
import type { CurriculumPointerEvent } from "./workspaceGestureTypes";

export interface CurriculumColumnProps {
  splitPaneRef: RefObject<HTMLDivElement | null>;
  theaterMode: boolean;
  curriculumCollapsed: boolean;
  curriculumShortcutLabel: ReturnType<typeof getRightPanelShortcutLabel>;
  curriculumAccessibleWidth: number;
  curriculumResizing: boolean;
  curriculumResizePreviewWidth: number | null;
  curriculumWidth: number;
  handleCurriculumResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  toggleCurriculumFromResizeRail: () => void;
  startCurriculumResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  moveCurriculumResize: (event: CurriculumPointerEvent) => void;
  endCurriculumResize: (
    event: CurriculumPointerEvent,
    cancelled?: boolean,
  ) => void;
  curriculumSections: AdaptedCurriculumSection[];
  curriculumLessonsById: Map<number, Lesson>;
  curriculumScrollportRef: RefObject<HTMLElement | null>;
  selectedLesson: number;
  lessonProgress: Record<number, number>;
  /** See `Curriculum`'s `progressPending`. */
  progressPending?: boolean;
  selectLesson: (lessonNumber: number, view?: "video" | "quiz") => void;
  lockedLessonNumbers: ReadonlySet<number>;
  onOpenCourseOverview: () => void;
  courseNavigationActionLabel: string | undefined;
  courseTitle: string;
  courseThumbnail: string | undefined;
  courseThumbnailSrcSet: string | undefined;
  curriculumFocusRequest: number;
  coursePersistenceKey: string;
  curriculumLessonResources: Map<
    number,
    readonly {
      id: string;
      mediaAssetId: string;
      title: string;
      mediaAsset?:
        | {
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            status:
              "uploading" | "uploaded" | "processing" | "ready" | "failed";
          }
        | undefined;
    }[]
  >;
  courseSlug: string | undefined;
  curriculumQuizLessonNumbers: Set<number>;
  showingQuiz: boolean;
  handleOpenLessonQuiz: (lessonNumber: number) => void;
  isApiRoute: boolean;
  isCourseOverviewLoading: boolean;
  courseUnavailable: "failed" | "not-found" | "no-lessons" | null;
  setChaptersPanelHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /**
   * Whether the course's lessons are drawn yet. A lesson opened inside the
   * app draws its column first and the list in it a frame later (see
   * useShownAfterFirstPaint): the list is most of the page's elements, and
   * it held the video back.
   */
  listShown: boolean;
}

export function CurriculumColumn({
  splitPaneRef,
  theaterMode,
  curriculumCollapsed,
  curriculumShortcutLabel,
  curriculumAccessibleWidth,
  curriculumResizing,
  curriculumResizePreviewWidth,
  curriculumWidth,
  handleCurriculumResizeKeyDown,
  toggleCurriculumFromResizeRail,
  startCurriculumResize,
  moveCurriculumResize,
  endCurriculumResize,
  curriculumSections,
  curriculumLessonsById,
  curriculumScrollportRef,
  selectedLesson,
  lessonProgress,
  progressPending = false,
  selectLesson,
  lockedLessonNumbers,
  onOpenCourseOverview,
  courseNavigationActionLabel,
  courseTitle,
  courseThumbnail,
  courseThumbnailSrcSet,
  curriculumFocusRequest,
  coursePersistenceKey,
  curriculumLessonResources,
  courseSlug,
  curriculumQuizLessonNumbers,
  showingQuiz,
  handleOpenLessonQuiz,
  isApiRoute,
  isCourseOverviewLoading,
  courseUnavailable,
  setChaptersPanelHost,
  listShown,
}: CurriculumColumnProps) {
  // prettier-ignore
  return (
    <SplitFramePane
      element="div"
      paneRef={splitPaneRef}
      className="learning-workspace__curriculum-clip"
      split={!theaterMode}
      media={LEARNING_SPLIT_MEDIA}
      card={false}
    >
      <div
        className={`learning-workspace__curriculum-column ${curriculumCollapsed ? "is-collapsed" : ""}`}
        data-split-frame-card=""
      >
        <SplitFrameGutter
          className="learning-curriculum__resize-rail"
          resizing={curriculumResizing}
          aria-label="Resize course curriculum"
          aria-keyshortcuts={COURSE_CONTENT_SHORTCUT_ARIA}
          title={`Resize course content | ${curriculumShortcutLabel}`}
          aria-valuemin={CURRICULUM_MIN_WIDTH}
          aria-valuemax={CURRICULUM_MAX_WIDTH}
          aria-valuenow={
            curriculumCollapsed
              ? undefined
              : Math.round(curriculumAccessibleWidth)
          }
          aria-valuetext={
            curriculumCollapsed
              ? "Course curriculum collapsed"
              : `${Math.round(curriculumAccessibleWidth)} pixels wide${
                  curriculumResizing &&
                  (curriculumResizePreviewWidth ??
                    (curriculumCollapsed
                      ? CURRICULUM_COLLAPSED_WIDTH
                      : curriculumWidth)) < CURRICULUM_MIN_WIDTH
                    ? ", sliding closed"
                    : ""
                }`
          }
          onKeyDown={handleCurriculumResizeKeyDown}
          onDoubleClick={toggleCurriculumFromResizeRail}
          onPointerDown={startCurriculumResize}
          onPointerMove={moveCurriculumResize}
          onPointerUp={endCurriculumResize}
          onPointerCancel={(event) => endCurriculumResize(event, true)}
        />
        <div
          id="learning-course-content"
          className="learning-curriculum__viewport"
        >
          {listShown ? (
            <Curriculum
              sections={curriculumSections}
              lessonsById={curriculumLessonsById}
              scrollportRef={curriculumScrollportRef}
              scrollportId="learning-course-curriculum-scrollport"
              selectedLesson={selectedLesson}
              lessonProgress={lessonProgress}
              progressPending={progressPending}
              onSelectLesson={selectLesson}
              lockedLessonNumbers={lockedLessonNumbers}
              onOpenCourseOverview={onOpenCourseOverview}
              courseNavigationActionLabel={courseNavigationActionLabel}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              courseThumbnailSrcSet={courseThumbnailSrcSet}
              focusRequest={curriculumFocusRequest}
              persistenceKey={coursePersistenceKey}
              lessonResources={curriculumLessonResources}
              resourceCourseKey={courseSlug}
              quizLessonNumbers={curriculumQuizLessonNumbers}
              activeQuizLesson={showingQuiz ? selectedLesson : null}
              onOpenLessonQuiz={handleOpenLessonQuiz}
              isLoading={isApiRoute && isCourseOverviewLoading}
              unavailable={courseUnavailable !== null}
              loadFailed={courseUnavailable === "failed"}
            />
          ) : null}
        </div>
        {/* The lesson player portals its chapters panel here so it
                overlays the course content. It sits below the resize rail. */}
        <div
          ref={setChaptersPanelHost}
          data-learning-chapters-panel-host=""
          className="pointer-events-none absolute inset-0 z-11 overflow-hidden rounded-[inherit]"
        />
      </div>
    </SplitFramePane>
  );
}
