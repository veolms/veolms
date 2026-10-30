import type { RefObject, Dispatch, SetStateAction } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { DRAWER_SWIPE_THROUGH_VIEWPORT_CLASS } from "../../gestures/pointerGestureOwnership";
import type { Lesson } from "../courseContent";
import { Curriculum } from "../Curriculum";
import type { AdaptedCurriculumSection } from "../courseCurriculumAdapter";
import {
  LESSON_DRAWER_MAX_FLOATING_WIDTH,
  LESSON_DRAWER_MIN_FLOATING_WIDTH,
  type LessonDrawerHeroControlProps,
} from "../useLessonDrawerHeroControl";
import type { LessonDrawerViewportBounds } from "../useLessonDrawerHeroControl";
import {
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { TouchEvent as ReactTouchEvent } from "react";

export interface CourseLessonsDrawerContentProps {
  lessonDrawerSurfaceRef: RefObject<HTMLDivElement | null>;
  lessonDrawerSkipFinalFocusRef: RefObject<boolean>;
  previousFocusRef: RefObject<HTMLElement | null>;
  lessonTriggerRef: RefObject<HTMLButtonElement | null>;
  phoneLessonDrawer: boolean;
  lessonDrawerCollapsedSnapPoint: number;
  lessonDrawerViewportBounds: LessonDrawerViewportBounds | null;
  floatingLessonDrawerWidth: number;
  floatingLessonDrawerResizing: boolean;
  floatingLessonDrawerViewportWidth: number;
  floatingLessonDrawerSlidingClosed: boolean;
  handleFloatingLessonDrawerResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  startFloatingLessonDrawerResize: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleLessonDrawerTouchStartCapture: (
    event: ReactTouchEvent<HTMLElement>,
  ) => void;
  curriculumSections: AdaptedCurriculumSection[];
  curriculumLessonsById: Map<number, Lesson>;
  lessonDrawerScrollportRef: RefObject<HTMLElement | null>;
  selectedLesson: number;
  lessonProgress: Record<number, number>;
  /** See `Curriculum`'s `progressPending`. */
  progressPending?: boolean;
  lockedLessonNumbers: ReadonlySet<number>;
  selectLesson: (lessonNumber: number, view?: "video" | "quiz") => void;
  onOpenCourseOverview: () => void;
  courseNavigationActionLabel: string | undefined;
  courseTitle: string;
  courseThumbnail: string | undefined;
  courseThumbnailSrcSet: string | undefined;
  lessonDrawerScrollTarget: "current" | "keep" | "top";
  lessonDrawerFocusRequest: number;
  lessonDrawerTopRequest: number;
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
  closeLessonDrawer: () => void;
  setLessonDrawerSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  lessonDrawerHeroControlProps: LessonDrawerHeroControlProps;
}

export function CourseLessonsDrawerContent({
  lessonDrawerSurfaceRef,
  lessonDrawerSkipFinalFocusRef,
  previousFocusRef,
  lessonTriggerRef,
  phoneLessonDrawer,
  lessonDrawerCollapsedSnapPoint,
  lessonDrawerViewportBounds,
  floatingLessonDrawerWidth,
  floatingLessonDrawerResizing,
  floatingLessonDrawerViewportWidth,
  floatingLessonDrawerSlidingClosed,
  handleFloatingLessonDrawerResizeKeyDown,
  startFloatingLessonDrawerResize,
  handleLessonDrawerTouchStartCapture,
  curriculumSections,
  curriculumLessonsById,
  lessonDrawerScrollportRef,
  selectedLesson,
  lessonProgress,
  progressPending = false,
  lockedLessonNumbers,
  selectLesson,
  onOpenCourseOverview,
  courseNavigationActionLabel,
  courseTitle,
  courseThumbnail,
  courseThumbnailSrcSet,
  lessonDrawerScrollTarget,
  lessonDrawerFocusRequest,
  lessonDrawerTopRequest,
  coursePersistenceKey,
  curriculumLessonResources,
  courseSlug,
  curriculumQuizLessonNumbers,
  showingQuiz,
  handleOpenLessonQuiz,
  isApiRoute,
  isCourseOverviewLoading,
  courseUnavailable,
  closeLessonDrawer,
  setLessonDrawerSnapPoint,
  lessonDrawerHeroControlProps,
}: CourseLessonsDrawerContentProps) {
  // prettier-ignore
  return (
    <DrawerContent
      ref={lessonDrawerSurfaceRef}
      viewportClassName={DRAWER_SWIPE_THROUGH_VIEWPORT_CLASS}
      aria-label="Course lessons"
      initialFocus
      finalFocus={() => {
        if (lessonDrawerSkipFinalFocusRef.current) {
          lessonDrawerSkipFinalFocusRef.current = false;
          return false;
        }
        return previousFocusRef.current || lessonTriggerRef.current;
      }}
      style={
        {
          ...(phoneLessonDrawer && lessonDrawerCollapsedSnapPoint > 1
            ? {
                "--learning-drawer-collapsed-height": `${lessonDrawerCollapsedSnapPoint}px`,
              }
            : {}),
          ...(lessonDrawerViewportBounds
            ? {
                "--learning-floating-curriculum-left-radius": "12px",
                "--learning-floating-curriculum-radius":
                  lessonDrawerViewportBounds.borderRadius ?? "18px",
                bottom: `${lessonDrawerViewportBounds.bottom ?? 12}px`,
                left: `${lessonDrawerViewportBounds.left}px`,
                right: "auto",
                top: `${lessonDrawerViewportBounds.top ?? 12}px`,
                width: `${lessonDrawerViewportBounds.width}px`,
              }
            : !phoneLessonDrawer
              ? {
                  "--learning-floating-curriculum-left-radius": "12px",
                  "--learning-floating-curriculum-radius": "18px",
                  bottom: "max(10px, var(--app-safe-area-bottom))",
                  left: "auto",
                  right: "max(10px, env(safe-area-inset-right))",
                  top: "max(10px, env(safe-area-inset-top))",
                  width: `min(${floatingLessonDrawerWidth}px, calc(100dvw - 20px))`,
                }
              : {}),
        } as CSSProperties
      }
      className={[
        "learning-course-content-drawer overflow-hidden",
        phoneLessonDrawer
          ? // Square at the top: the sheet hangs from the player's bottom
            // edge, and rounded corners left a notch on each side through
            // which the page behind showed (reading mode's grain, as a
            // patch of noise beside the video). The list in it is not
            // rounded either.
            "[--drawer-bleed-background:var(--canvas)] bg-(--canvas) data-[swipe-direction=down]:border-t-0 data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] shadow-[0_-18px_48px_rgba(0,0,0,0.32)] [&_.learning-curriculum]:rounded-none!"
          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] [--drawer-bleed-background:color-mix(in_srgb,var(--app-shell)_74%,transparent)] overflow-hidden rounded-l-[12px]! rounded-r-(--learning-floating-curriculum-radius)! bg-[color-mix(in_srgb,var(--app-shell)_74%,transparent)] shadow-(--sidebar-menu-active-shadow) backdrop-blur-[calc(var(--sidebar-floating-base-blur,6px)+var(--sidebar-backdrop-blur,8px))] backdrop-saturate-[1.2] data-[swipe-direction=right]:rounded-l-[12px]! data-[swipe-direction=right]:rounded-r-(--learning-floating-curriculum-radius)! [&_.learning-curriculum]:rounded-none! [&_.learning-curriculum]:bg-transparent!",
      ].join(" ")}
    >
      {!phoneLessonDrawer && (
        <div
          data-base-ui-swipe-ignore=""
          data-floating-curriculum-resize=""
          data-resizing={floatingLessonDrawerResizing ? "" : undefined}
          data-learning-swipe-ignore=""
          className="group/resize absolute inset-y-0 left-0 z-40 flex w-5 cursor-ew-resize touch-none items-center justify-start focus-visible:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize floating course curriculum"
          aria-valuemin={LESSON_DRAWER_MIN_FLOATING_WIDTH}
          aria-valuemax={LESSON_DRAWER_MAX_FLOATING_WIDTH}
          aria-valuenow={Math.round(
            Math.max(
              LESSON_DRAWER_MIN_FLOATING_WIDTH,
              floatingLessonDrawerViewportWidth,
            ),
          )}
          aria-valuetext={`${Math.round(
            Math.max(
              LESSON_DRAWER_MIN_FLOATING_WIDTH,
              floatingLessonDrawerViewportWidth,
            ),
          )} pixels wide${
            floatingLessonDrawerSlidingClosed ? ", sliding closed" : ""
          }`}
          title="Resize or close floating course content"
          tabIndex={0}
          onKeyDown={handleFloatingLessonDrawerResizeKeyDown}
          onPointerDown={startFloatingLessonDrawerResize}
        >
          <span
            aria-hidden="true"
            className="h-[calc(100%-28px)] w-0.5 rounded-full bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)] opacity-0 shadow-[0_0_0_transparent] transition-opacity duration-160 group-hover/resize:opacity-70 group-focus-visible/resize:opacity-70 group-data-resizing/resize:opacity-100"
          />
        </div>
      )}
      <DrawerTitle className="sr-only">Course lessons</DrawerTitle>
      <DrawerDescription className="sr-only">
        Browse sections and choose a lesson.
      </DrawerDescription>
      <div
        className="min-h-0 flex-1 overflow-hidden"
        onTouchStartCapture={handleLessonDrawerTouchStartCapture}
      >
        <Curriculum
          sections={curriculumSections}
          lessonsById={curriculumLessonsById}
          scrollportRef={lessonDrawerScrollportRef}
          scrollportId="lesson-drawer-curriculum-scrollport"
          selectedLesson={selectedLesson}
          lessonProgress={lessonProgress}
          progressPending={progressPending}
          lockedLessonNumbers={lockedLessonNumbers}
          onSelectLesson={selectLesson}
          onOpenCourseOverview={onOpenCourseOverview}
          courseNavigationActionLabel={courseNavigationActionLabel}
          courseTitle={courseTitle}
          courseThumbnail={courseThumbnail}
          courseThumbnailSrcSet={courseThumbnailSrcSet}
          focusRequest={
            lessonDrawerScrollTarget === "current"
              ? lessonDrawerFocusRequest
              : 0
          }
          topRequest={
            lessonDrawerScrollTarget === "top" ? lessonDrawerTopRequest : 0
          }
          persistenceKey={coursePersistenceKey}
          lessonResources={curriculumLessonResources}
          resourceCourseKey={courseSlug}
          quizLessonNumbers={curriculumQuizLessonNumbers}
          activeQuizLesson={showingQuiz ? selectedLesson : null}
          onOpenLessonQuiz={handleOpenLessonQuiz}
          isLoading={isApiRoute && isCourseOverviewLoading}
          unavailable={courseUnavailable !== null}
          loadFailed={courseUnavailable === "failed"}
          onClose={closeLessonDrawer}
          onLessonSearchOpen={
            phoneLessonDrawer
              ? () => setLessonDrawerSnapPoint(1)
              : undefined
          }
          drawerHeroControlProps={
            phoneLessonDrawer ? lessonDrawerHeroControlProps : undefined
          }
        />
      </div>
    </DrawerContent>
  );
}
