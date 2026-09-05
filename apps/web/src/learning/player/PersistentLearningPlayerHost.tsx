import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  LessonVideoPlayer,
  type LessonVideoPlayerProps,
} from "./LessonVideoPlayer";
import {
  getLearningPlayerMotionTargetElement,
  isDesktopLearningMinimizeViewport,
  LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE,
  runLearningPlayerFlipRestore,
  clearLearningMiniPlayerVideoCornerRadius,
  clearLearningPlayerMinimizeCornerRadius,
} from "./learningPlayerMotion";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";
import { MiniPlayerResizeHandles } from "./MiniPlayerResizeHandles";
import { MiniPlayerInfoBar } from "./MiniPlayerInfoBar";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { useMiniPlayerCurriculumSections } from "./useMiniPlayerCurriculumSections";
import { Curriculum } from "../Curriculum";
import {
  lessonsById as defaultLessonsById,
  sections as defaultSections,
} from "../courseContent";
import type { CourseSection, Lesson } from "../courseContent";

export type LearningPlayerPresentation = "full" | "mini";

export interface PersistentLearningPlayerRegistration {
  anchor: HTMLElement | null;
  courseRouteKey: string;
  lessonPath: string;
  mediaKey: string;
  playerProps: LessonVideoPlayerProps;
  returnPath: string;
  courseSlug?: string;
  selectedLesson?: number;
  onSelectLesson?: (lessonNumber: number) => void;
  curriculumSections?: readonly CourseSection[];
  curriculumLessonsById?: ReadonlyMap<number, Lesson>;
  lessonProgress?: Readonly<Record<number, number>>;
  isLessonAvailable?: (lessonNumber: number) => boolean;
}

export type RegisterPersistentLearningPlayer = (
  registration: PersistentLearningPlayerRegistration & { anchor: HTMLElement },
) => () => void;

export interface PersistentLearningPlayerHostProps {
  player: PersistentLearningPlayerRegistration;
  presentation: LearningPlayerPresentation;
  onClose: () => void;
  onRestore: () => void;
  onSelectMiniPlayerLesson?: (lessonNumber: number) => void;
  onOpenCourseOverview?: () => void;
}

export function PersistentLearningPlayerHost({
  onClose,
  onRestore,
  onSelectMiniPlayerLesson,
  onOpenCourseOverview,
  player,
  presentation,
}: PersistentLearningPlayerHostProps) {
  const hostRef = useRef<HTMLElement>(null);
  const mainScrollportRef = useRef<HTMLElement | null>(
    player.anchor?.closest<HTMLElement>(".courses-main") ?? null,
  );
  const lastMiniRectRef = useRef<DOMRect | null>(null);
  const previousPresentationRef = useRef(presentation);
  const restoreCleanupRef = useRef<(() => void) | null>(null);
  const restoreFromCurrentRect = useCallback(() => {
    const host = hostRef.current;
    if (host) lastMiniRectRef.current = host.getBoundingClientRect();
    onRestore();
  }, [onRestore]);

  const resolveMinimizeMotionTarget = useCallback(() => {
    if (isDesktopLearningMinimizeViewport()) {
      return (
        player.anchor?.closest<HTMLElement>(
          "[data-learning-player-motion-target]",
        ) ??
        getLearningPlayerMotionTargetElement() ??
        hostRef.current
      );
    }
    return hostRef.current;
  }, [player.anchor]);

  useLearningPlayerMinimizeShortcut({
    enabled: presentation === "mini",
    onTrigger: restoreFromCurrentRect,
    onClose,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const miniPlayer = useLearningMiniPlayerGestures(
    hostRef,
    onClose,
    presentation === "mini",
    restoreFromCurrentRect,
    isExpanded,
  );
  const finishRestoreBeforeMinimize = useCallback(() => {
    restoreCleanupRef.current?.();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || presentation !== "full") {
      return undefined;
    }

    const forwardWheelToMainScrollport = (event: WheelEvent) => {
      const scrollport = mainScrollportRef.current;
      if (
        !scrollport ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.deltaY === 0 ||
        window.innerWidth <= 640 ||
        host.querySelector('[data-player-mobile-interaction="true"]')
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('.player-volume-group, [role="menu"], [role="dialog"]')
      ) {
        return;
      }

      const deltaUnit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scrollport.clientHeight
            : 1;
      const maxScrollTop = Math.max(
        0,
        scrollport.scrollHeight - scrollport.clientHeight,
      );
      const nextScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, scrollport.scrollTop + event.deltaY * deltaUnit),
      );
      if (nextScrollTop === scrollport.scrollTop) return;

      event.preventDefault();
      scrollport.scrollTop = nextScrollTop;
    };

    host.addEventListener("wheel", forwardWheelToMainScrollport, {
      passive: false,
    });
    return () => {
      host.removeEventListener("wheel", forwardWheelToMainScrollport);
    };
  }, [presentation]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const previousPresentation = previousPresentationRef.current;
    previousPresentationRef.current = presentation;
    restoreCleanupRef.current?.();
    restoreCleanupRef.current = null;
    if (!host) return;

    if (presentation === "mini") {
      lastMiniRectRef.current = host.getBoundingClientRect();
      clearLearningMiniPlayerVideoCornerRadius(host);
      return;
    }
    if (previousPresentation !== "mini") return;

    const playerWrap = player.anchor?.closest<HTMLElement>(
      "[data-learning-player-motion-target]",
    );
    const startRect = lastMiniRectRef.current;
    if (!startRect) {
      clearLearningPlayerMinimizeCornerRadius();
      return;
    }

    if (isDesktopLearningMinimizeViewport() && playerWrap) {
      restoreCleanupRef.current = runLearningPlayerFlipRestore(
        playerWrap,
        startRect,
      );
      return;
    }

    restoreCleanupRef.current = runLearningPlayerFlipRestore(host, startRect);
  }, [presentation]);

  useEffect(
    () => () => {
      restoreCleanupRef.current?.();
    },
    [],
  );

  const miniStyle: CSSProperties = miniPlayer.style;
  const mini = presentation === "mini";

  const miniLessonSequence = useMemo(() => {
    const sections = player.curriculumSections ?? defaultSections;
    return sections.flatMap(({ lessons }) => lessons.map(([id]) => id));
  }, [player.curriculumSections]);
  const miniCurriculumSections = player.curriculumSections ?? defaultSections;
  const miniSelectedLesson = player.selectedLesson ?? 1;
  const {
    sectionIds: miniSectionIds,
    expandedSectionIds: miniExpandedSectionIds,
    setExpandedSectionIds: setMiniExpandedSectionIds,
    expandAllSections: expandAllMiniSections,
    collapseAllSections: collapseAllMiniSections,
  } = useMiniPlayerCurriculumSections(miniCurriculumSections, miniSelectedLesson);
  const miniSelectedLessonIndex =
    miniLessonSequence.indexOf(miniSelectedLesson);
  const miniPreviousLessonId =
    miniSelectedLessonIndex > 0
      ? miniLessonSequence[miniSelectedLessonIndex - 1]
      : undefined;
  const miniNextLessonId =
    miniSelectedLessonIndex >= 0 &&
    miniSelectedLessonIndex < miniLessonSequence.length - 1
      ? miniLessonSequence[miniSelectedLessonIndex + 1]
      : undefined;

  const handleMiniSelectLesson = useCallback(
    (lessonNumber: number) => {
      onSelectMiniPlayerLesson?.(lessonNumber);
    },
    [onSelectMiniPlayerLesson],
  );

  const lessonVideoPlayerProps = useMemo(() => {
    if (!mini || !onSelectMiniPlayerLesson) {
      return player.playerProps;
    }

    return {
      ...player.playerProps,
      onGoNext: () => {
        if (miniNextLessonId !== undefined) {
          handleMiniSelectLesson(miniNextLessonId);
        }
      },
      onGoPrevious: () => {
        if (miniPreviousLessonId !== undefined) {
          handleMiniSelectLesson(miniPreviousLessonId);
        }
      },
    };
  }, [
    handleMiniSelectLesson,
    mini,
    miniNextLessonId,
    miniPreviousLessonId,
    onSelectMiniPlayerLesson,
    player.playerProps,
  ]);

  const curriculumSelectLesson =
    mini && onSelectMiniPlayerLesson
      ? handleMiniSelectLesson
      : (player.onSelectLesson ?? (() => {}));

  const playerHost = (
    <aside
      ref={hostRef}
      className={
        mini
          ? "fixed z-130 m-0 touch-none overflow-hidden rounded-xl border-0 bg-black p-0 shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none flex flex-col group/mini-player-shell data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          : "learning-persistent-player--full z-[39] overflow-visible bg-transparent"
      }
      style={mini ? miniStyle : undefined}
      aria-label={
        mini ? `Mini player for ${player.playerProps.lessonTitle}` : undefined
      }
      aria-describedby={mini ? "learning-mini-player-gesture-help" : undefined}
      popover={mini ? "manual" : undefined}
      data-learning-persistent-player=""
      data-learning-mini-player={mini ? "" : undefined}
      data-mini-player-mode={mini ? miniPlayer.mode : undefined}
      {...(mini ? miniPlayer.gestureProps : {})}
    >
      {mini ? (
        <span id="learning-mini-player-gesture-help" className="sr-only">
          Drag to move, resize from an edge, pinch to resize, or swipe down
          quickly to close.
        </span>
      ) : null}
      {mini ? <MiniPlayerResizeHandles expanded={isExpanded} /> : null}
      <LessonVideoPlayer
        {...lessonVideoPlayerProps}
        minimizeMotionTarget={resolveMinimizeMotionTarget}
        onMinimizeGestureStart={finishRestoreBeforeMinimize}
        presentation={presentation}
        onMiniClose={onClose}
        onMiniRestore={restoreFromCurrentRect}
        onMiniPlayerRestoreReady={undefined}
      />
      {mini ? (
        <MiniPlayerInfoBar
          lessonTitle={player.playerProps.lessonTitle}
          courseTitle={player.playerProps.courseTitle}
          lessonIndex={player.playerProps.lessonIndex}
          totalLessons={player.playerProps.totalLessons}
          expanded={isExpanded}
          onToggleExpand={toggleExpanded}
          onRestore={restoreFromCurrentRect}
          sectionIds={miniSectionIds}
          expandedSectionIds={miniExpandedSectionIds}
          onExpandAllSections={expandAllMiniSections}
          onCollapseAllSections={collapseAllMiniSections}
          onOpenCourseOverview={onOpenCourseOverview}
          contextMenuPortalHostRef={hostRef}
        />
      ) : null}
      {mini && isExpanded ? (
        <div
          className="hidden min-[641px]:flex flex-col w-full h-(--learning-mini-player-playlist-height,320px) shrink-0 overflow-hidden"
          data-learning-mini-player-gesture-ignore=""
          data-learning-mini-player-playlist-shell=""
        >
          <Curriculum
            hideHero
            sections={miniCurriculumSections}
            lessonsById={player.curriculumLessonsById ?? defaultLessonsById}
            selectedLesson={miniSelectedLesson}
            lessonProgress={player.lessonProgress}
            onSelectLesson={curriculumSelectLesson}
            courseTitle={player.playerProps.courseTitle ?? ""}
            persistenceKey={player.courseRouteKey}
            isLessonAvailable={player.isLessonAvailable}
            scrollControlBottomClearance={
              LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE
            }
            expandedSectionIds={miniExpandedSectionIds}
            onExpandedSectionIdsChange={(sectionIds) =>
              setMiniExpandedSectionIds([...sectionIds])
            }
            onOpenCourseOverview={onOpenCourseOverview}
          />
        </div>
      ) : null}
    </aside>
  );

  return mainScrollportRef.current
    ? createPortal(playerHost, mainScrollportRef.current)
    : playerHost;
}
