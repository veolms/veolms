import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "../learning-feature.css";
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
  clearLearningPlayerWindowMinimizeMotion,
} from "./learningPlayerMotion";
import {
  recordDetachedLearningProgress,
  useDetachedLessonProgress,
  type DetachedProgressTarget,
} from "../detachedLearningProgress";
import { LearningExpandPlaceholderSheet } from "./LearningExpandPlaceholderSheet";
import {
  expandLearningPlayerFromRect,
  startLearningPlayerExpand,
  type LearningPagePartRect,
  type LearningPlayerExpandMotion,
  type LearningPlayerExpandTarget,
  type LearningPlayerMotionFinish,
} from "./learningPlayerExpandMotion";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";
import { MiniPlayerResizeHandles } from "./MiniPlayerResizeHandles";
import { MiniPlayerInfoBar } from "./MiniPlayerInfoBar";
import { MiniPlayerReadingModeEffects } from "./MiniPlayerReadingModeEffects";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { useMiniPlayerCurriculumSections } from "./useMiniPlayerCurriculumSections";
import { Curriculum } from "../Curriculum";
import type { CourseSection, Lesson } from "../courseContent";

import { courseRouteKeyFromLessonPath } from "./persistentMiniPlayerLesson";
import { getVideoPlaybackBootstrap } from "../videoPlaybackBootstrap";

const EMPTY_CURRICULUM_SECTIONS: CourseSection[] = [];
// The mini window's colours are scoped to the mini presentation in legacy
// CSS. The same bar is shown while the full player shrinks, so it carries
// matching colours of its own until the mini presentation takes over.
const MINI_INFO_BAR_SLOT_CLASS =
  "[&_[data-learning-mini-player-info-bar]]:border-t-[color-mix(in_srgb,var(--accent)_22%,transparent)] [&_[data-learning-mini-player-info-bar]]:bg-[color-mix(in_srgb,var(--accent)_24%,#0a0a0c)] [&_[data-learning-mini-player-info-caret]]:text-[color-mix(in_srgb,var(--text-secondary)_58%,var(--accent)_42%)] [&_[data-learning-mini-player-info-subtitle]]:text-[color-mix(in_srgb,var(--text-secondary)_68%,var(--accent)_32%)]";
const EMPTY_LESSONS_BY_ID: ReadonlyMap<number, Lesson> = new Map();
// The route change starts as soon as the first frame of the motion has been
// handed to the compositor; any longer only delays the lesson page.
const EXPAND_ROUTE_DELAY_MS = 0;
const EXPAND_ROUTE_FALLBACK_MS = 250;
// If the lesson page never takes the player back, the window returns to mini.
const EXPAND_ABANDON_MS = 5000;

interface RememberedLessonPageLayout extends LearningPlayerExpandTarget {
  viewportWidth: number;
  viewportHeight: number;
}

export type LearningPlayerPresentation = "full" | "mini";

// On a scrolled lesson page the player stays in view and the title,
// description and comments pass behind it. When the player shrinks away to
// the corner, that hidden part would show for a moment in the space it
// leaves. Cut it off for as long as the page stays where it is: the page is
// on its way out, and if the minimize is called off, the next scroll puts
// everything back.
function hideLessonContentBehindPlayer(scrollport: HTMLElement | null) {
  const slot = document.querySelector<HTMLElement>(
    ".learning-workspace__player-wrap",
  );
  const content = slot?.parentElement?.querySelector<HTMLElement>(
    ":scope > .learning-workspace__lesson-content-clip",
  );
  if (!slot || !content || !scrollport) return;
  const covered =
    slot.getBoundingClientRect().bottom - content.getBoundingClientRect().top;
  if (covered <= 0) return;
  content.style.clipPath = `inset(${covered.toFixed(1)}px 0 0 0)`;
  scrollport.addEventListener(
    "scroll",
    () => content.style.removeProperty("clip-path"),
    { once: true, passive: true },
  );
}

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
  /**
   * Where watched progress is recorded once the lesson page has unmounted
   * and the player lives on as the mini player.
   */
  progressTarget?: DetachedProgressTarget;
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
  onRetryMiniPlayerPlayback?: () => void;
  onOpenCourseOverview?: () => void;
}

export function PersistentLearningPlayerHost({
  onClose,
  onRestore,
  onSelectMiniPlayerLesson,
  onRetryMiniPlayerPlayback,
  onOpenCourseOverview,
  player,
  presentation,
}: PersistentLearningPlayerHostProps) {
  const hostRef = useRef<HTMLElement>(null);
  const mainScrollportRef = useRef<HTMLElement | null>(
    player.anchor?.closest<HTMLElement>(".courses-main") ?? null,
  );
  const resolvedScrollport =
    player.anchor?.closest<HTMLElement>(".courses-main") ??
    (typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(".courses-main")
      : null);
  if (resolvedScrollport) {
    mainScrollportRef.current = resolvedScrollport;
  }
  const lastMiniRectRef = useRef<DOMRect | null>(null);
  const previousPresentationRef = useRef(presentation);
  const restoreCleanupRef = useRef<LearningPlayerMotionFinish | null>(null);
  // Set when the expand is turned around before the lesson page arrives.
  const expandTurnedBackRef = useRef(false);
  const minimizeTriggerRef = useRef<(() => void) | null>(null);
  const setMinimizeTrigger = useCallback((trigger: (() => void) | null) => {
    minimizeTriggerRef.current = trigger;
  }, []);
  const lastFullRectRef = useRef<RememberedLessonPageLayout | null>(null);
  const expandMotionRef = useRef<LearningPlayerExpandMotion | null>(null);
  const expandTimersRef = useRef<number[]>([]);
  const clearExpandTimers = useCallback(() => {
    for (const timer of expandTimersRef.current) window.clearTimeout(timer);
    expandTimersRef.current = [];
  }, []);
  const restoreFromCurrentRect = useCallback(() => {
    if (expandMotionRef.current) {
      // Asked again while the window is still expanding: turn it around
      // from where it is. The lesson page is already on its way, so the
      // minimize itself completes once the page hands the player over.
      expandTurnedBackRef.current = !expandTurnedBackRef.current;
      expandMotionRef.current.reverse();
      return;
    }
    expandTurnedBackRef.current = false;
    const host = hostRef.current;
    if (host) lastMiniRectRef.current = host.getBoundingClientRect();
    const target = lastFullRectRef.current;
    const expand =
      host &&
      target &&
      host.hasAttribute("data-learning-mini-player") &&
      isDesktopLearningMinimizeViewport() &&
      target.viewportWidth === window.innerWidth &&
      target.viewportHeight === window.innerHeight
        ? startLearningPlayerExpand(
            host,
            target,
            mainScrollportRef.current?.querySelector<HTMLElement>(
              ":scope > [data-learning-expand-sheet]",
            ) ?? null,
          )
        : null;
    if (!expand) {
      onRestore();
      return;
    }

    // The window is already moving. Give that first frame to the compositor
    // before the route change takes over the main thread, so the click is
    // answered at once instead of after the lesson page has rendered.
    expandMotionRef.current = expand;
    let requested = false;
    const requestRestore = () => {
      if (requested) return;
      requested = true;
      onRestore();
    };
    window.requestAnimationFrame(() => {
      expandTimersRef.current.push(
        window.setTimeout(requestRestore, EXPAND_ROUTE_DELAY_MS),
      );
    });
    expandTimersRef.current.push(
      window.setTimeout(requestRestore, EXPAND_ROUTE_FALLBACK_MS),
      window.setTimeout(() => {
        if (expandMotionRef.current !== expand) return;
        expandMotionRef.current = null;
        expandTurnedBackRef.current = false;
        expand.cancel();
      }, EXPAND_ABANDON_MS),
    );
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
  // The host outlives a minimize/restore cycle. Every time the player is
  // minimized its lesson list starts collapsed, whatever it was last time.
  const [trackedPresentation, setTrackedPresentation] = useState(presentation);
  if (trackedPresentation !== presentation) {
    setTrackedPresentation(presentation);
    if (isExpanded) setIsExpanded(false);
  }

  const miniPlayer = useLearningMiniPlayerGestures(
    hostRef,
    onClose,
    presentation === "mini",
    restoreFromCurrentRect,
    isExpanded,
  );
  // Remembers where the full player sits so an expand can head there before
  // the lesson page is back. Stored as if the page were scrolled to the top,
  // which is how it reopens. Only a player that is truly at rest is measured:
  // a rectangle taken mid-motion would send the next expand to the wrong
  // place, and the error would grow with every cycle.
  const rememberFullPlayerRect = useCallback(() => {
    const host = hostRef.current;
    if (
      !host ||
      expandMotionRef.current ||
      host.hasAttribute("data-learning-mini-player") ||
      host.dataset.learningPlayerWindowMotion !== undefined ||
      host.dataset.learningPlayerRestorePhase !== undefined
    ) {
      return;
    }
    const style = window.getComputedStyle(host);
    if (
      style.transform !== "none" ||
      style.translate !== "none" ||
      style.scale !== "none"
    ) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const scrollTop = mainScrollportRef.current?.scrollTop ?? 0;
    // A player that stays in view while the page scrolls has not moved with
    // it, so the scroll distance is added to where its column starts rather
    // than to where the player is now.
    const columnTop = document
      .querySelector<HTMLElement>(".learning-workspace__lesson-column")
      ?.getBoundingClientRect().top;
    const top = Math.min(rect.top, columnTop ?? rect.top) + scrollTop;
    if (
      rect.width <= 0 ||
      rect.left < 0 ||
      top < 0 ||
      rect.right > window.innerWidth + 1
    ) {
      return;
    }
    // The page around the player, so its stand-ins can be laid out for the
    // next expand before the page itself exists.
    const measurePagePart = (selector: string): LearningPagePartRect | null => {
      const partRect = document
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect();
      return partRect && partRect.width > 0
        ? { left: partRect.left, top: partRect.top, width: partRect.width }
        : null;
    };
    const content = measurePagePart(".learning-workspace__lesson-content");
    lastFullRectRef.current = {
      left: rect.left,
      top,
      width: rect.width,
      // The column is pinned to the viewport; the content scrolls.
      column: measurePagePart(".learning-workspace__curriculum-column"),
      content: content ? { ...content, top: content.top + scrollTop } : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }, []);

  const finishRestoreBeforeMinimize = useCallback(() => {
    // A minimize that interrupts an expand picks the window up where it is
    // rather than letting it jump to its place first.
    restoreCleanupRef.current?.({
      hold: isDesktopLearningMinimizeViewport(),
    });
    // The player is about to leave: this is its resting place. (Skipped
    // while the window is held away from it.)
    rememberFullPlayerRect();
    hideLessonContentBehindPlayer(mainScrollportRef.current);
  }, [rememberFullPlayerRect]);

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
        target.closest(
          '.player-volume-group, [role="menu"], [role="dialog"], [data-lesson-chapters-panel]',
        )
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
      clearLearningPlayerWindowMinimizeMotion(host);
      lastMiniRectRef.current = host.getBoundingClientRect();
      clearLearningMiniPlayerVideoCornerRadius(host);
      return;
    }
    if (previousPresentation !== "mini") return;

    const expand = expandMotionRef.current;
    if (expand) {
      // The mini window has been expanding since the click; the full player
      // takes the same motion over from wherever it has reached.
      expandMotionRef.current = null;
      clearExpandTimers();
      const turnedBack = expandTurnedBackRef.current;
      expandTurnedBackRef.current = false;
      restoreCleanupRef.current = expand.handOff(host, { turnedBack });
      // The window was already heading back to the corner: carry on from
      // where it is with the ordinary minimize.
      if (turnedBack) minimizeTriggerRef.current?.();
      return;
    }

    const startRect = lastMiniRectRef.current;
    if (!startRect) {
      clearLearningPlayerMinimizeCornerRadius();
      return;
    }

    // Expand the host itself. Its transform runs on the compositor, so the
    // video keeps gliding while React is still rendering the lesson page;
    // moving the slot instead would re-lay out the player on every frame.
    restoreCleanupRef.current = isDesktopLearningMinimizeViewport()
      ? expandLearningPlayerFromRect(host, startRect)
      : runLearningPlayerFlipRestore(host, startRect);
  }, [clearExpandTimers, presentation]);

  // Also covers leaving the lesson without minimizing (the player is then
  // demoted to the mini window with no gesture). Declared after the
  // presentation effect so it never measures a hand-off in progress.
  useLayoutEffect(() => {
    if (presentation === "full") rememberFullPlayerRect();
  });

  useEffect(
    () => () => {
      restoreCleanupRef.current?.();
      clearExpandTimers();
      expandMotionRef.current?.cancel();
      expandMotionRef.current = null;
    },
    [clearExpandTimers],
  );

  const miniStyle: CSSProperties = miniPlayer.style;
  const mini = presentation === "mini";

  const miniLessonSequence = useMemo(() => {
    const sections = player.curriculumSections ?? EMPTY_CURRICULUM_SECTIONS;
    return sections.flatMap(({ lessons }) => lessons.map(([id]) => id));
  }, [player.curriculumSections]);
  const miniCurriculumSections =
    player.curriculumSections ?? EMPTY_CURRICULUM_SECTIONS;
  const miniSelectedLesson = player.selectedLesson ?? 1;
  const {
    sectionIds: miniSectionIds,
    expandedSectionIds: miniExpandedSectionIds,
    setExpandedSectionIds: setMiniExpandedSectionIds,
    expandAllSections: expandAllMiniSections,
    collapseAllSections: collapseAllMiniSections,
  } = useMiniPlayerCurriculumSections(
    miniCurriculumSections,
    miniSelectedLesson,
  );
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

  useEffect(() => {
    if (!mini) return;
    const courseSlug =
      player.courseSlug ??
      courseRouteKeyFromLessonPath(player.lessonPath) ??
      player.courseRouteKey;
    if (!courseSlug || !player.playerProps.protectedPlayback) return;

    if (miniNextLessonId !== undefined) {
      void getVideoPlaybackBootstrap({
        courseSlug,
        lessonNumber: miniNextLessonId,
      }).catch(() => undefined);
    }
    if (miniPreviousLessonId !== undefined) {
      void getVideoPlaybackBootstrap({
        courseSlug,
        lessonNumber: miniPreviousLessonId,
      }).catch(() => undefined);
    }
  }, [
    mini,
    miniNextLessonId,
    miniPreviousLessonId,
    player.courseRouteKey,
    player.courseSlug,
    player.lessonPath,
    player.playerProps.protectedPlayback,
  ]);

  const handleMiniSelectLesson = useCallback(
    (lessonNumber: number) => {
      onSelectMiniPlayerLesson?.(lessonNumber);
    },
    [onSelectMiniPlayerLesson],
  );

  // With no anchor the lesson page has unmounted: the progress callbacks it
  // handed over are bound to that page (and to the lesson it was showing) and
  // record nothing. Progress then goes straight to the learner's store.
  const detachedProgressTarget =
    player.anchor === null ? player.progressTarget : undefined;
  const detachedLessonNumber = player.selectedLesson;
  const recordDetachedProgress = useCallback(
    (progress: number) => {
      if (!detachedProgressTarget || detachedLessonNumber === undefined) return;
      recordDetachedLearningProgress(
        detachedProgressTarget,
        detachedLessonNumber,
        progress,
      );
    },
    [detachedLessonNumber, detachedProgressTarget],
  );
  const recordsDetachedProgress = Boolean(
    detachedProgressTarget && detachedLessonNumber !== undefined,
  );
  // The progress handed over with the player is a snapshot from the moment
  // the lesson page closed. While detached, the lesson list shows what has
  // been recorded since as well, so its rings move as the video plays.
  const liveDetachedProgress = useDetachedLessonProgress(
    detachedProgressTarget,
  );
  const registeredLessonProgress = player.lessonProgress;
  const miniLessonProgress = useMemo(() => {
    if (!detachedProgressTarget) return registeredLessonProgress;
    const merged: Record<number, number> = { ...registeredLessonProgress };
    for (const [lessonNumber, progress] of Object.entries(
      liveDetachedProgress,
    )) {
      const key = Number(lessonNumber);
      merged[key] = Math.max(merged[key] ?? 0, progress);
    }
    return merged;
  }, [detachedProgressTarget, liveDetachedProgress, registeredLessonProgress]);

  const lessonVideoPlayerProps = useMemo(() => {
    const retryPlayback = mini ? onRetryMiniPlayerPlayback : undefined;
    const registeredPlayerProps = recordsDetachedProgress
      ? {
          ...player.playerProps,
          onProgressChange: recordDetachedProgress,
          onLessonEnded: undefined,
        }
      : player.playerProps;
    const basePlayerProps =
      retryPlayback &&
      registeredPlayerProps.playbackAccessError?.kind === "retry"
        ? {
            ...registeredPlayerProps,
            playbackAccessError: {
              ...registeredPlayerProps.playbackAccessError,
              onAction: retryPlayback,
            },
            onRetryPlayback: retryPlayback,
          }
        : retryPlayback
          ? { ...registeredPlayerProps, onRetryPlayback: retryPlayback }
          : registeredPlayerProps;

    if (!mini || !onSelectMiniPlayerLesson) {
      return basePlayerProps;
    }

    return {
      ...basePlayerProps,
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
    onRetryMiniPlayerPlayback,
    player.playerProps,
    recordDetachedProgress,
    recordsDetachedProgress,
  ]);

  const curriculumSelectLesson =
    mini && onSelectMiniPlayerLesson
      ? handleMiniSelectLesson
      : (player.onSelectLesson ?? (() => {}));

  // A video area the viewer has dragged shorter (see LessonPlayerHeightHandle)
  // is wider than the picture. The player fills the area, the picture keeps
  // its shape in the middle, and the player itself goes see-through so the
  // ambient glow behind it shows in the space on either side (plain black
  // when the glow is off).
  // On a phone, a video dragged down to a compact height keeps only its
  // essential controls (play, time, fullscreen): the
  // lesson, chapter, autoplay, settings, sound and minimize buttons go.
  // On a wider screen a short video's timeline moves down onto the
  // video's bottom edge, where a phone has it.
  // Shorter than that, the two controls along its top (minimize and
  // chapters) go, leaving the picture to the control bar.
  // Smaller still, it keeps just a reduced play button.
  // On a phone the controls along the top step aside while the timeline is
  // being dragged, leaving the picture to the time-and-chapter pill.
  // The player's controls are put away while the video area is being
  // resized and while it is fully hidden: they are laid out for a video
  // of some height and would pile up over a sliver of one.
  // A zoomed picture is not cut off at its own shape: it grows into that
  // space too, up to the edges of the player.
  // While a drag changes the size of the picture on every frame (the
  // sidebar, the course content or the video area being resized), the
  // picture is a hair short of opaque. That makes Chrome draw it with the
  // rest of the page. Fully opaque, Chrome on Windows shows a video through
  // a surface of its own, the size of the picture, and builds a new one for
  // each new size: about 5ms of every frame, which cost those drags a third
  // of their frame rate. Against the black behind the picture the
  // difference cannot be seen.
  const playerHost = (
    <aside
      ref={hostRef}
      className={
        mini
          ? "fixed z-130 m-0 touch-none overflow-hidden rounded-xl border-0 bg-black p-0 shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none flex flex-col group/mini-player-shell data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          : "learning-persistent-player--full group/window-motion z-[39] overflow-visible bg-transparent min-[641px]:[.courses-main:has([data-learning-player-very-short])_&]:[&_:is([data-player-control-hit-area='chapters'],[data-learning-player-minimize-layer])]:hidden! min-[641px]:[.courses-main:has([data-learning-player-short])_&]:[&_[data-player-timeline-wrap]]:inset-x-0! min-[641px]:[.courses-main:has([data-learning-player-short])_&]:[&_[data-player-timeline-wrap]]:bottom-0! min-[641px]:[.courses-main:has([data-learning-player-short])_&]:[&_[data-player-timeline-wrap]]:translate-y-1/2! max-[640px]:[&:has([data-player-timeline-wrap]_[role=slider][data-scrubbing=true])]:[&_:is([data-learning-player-minimize-layer],[data-player-control-cluster]:has([aria-label='Autoplay_next_lesson']),[aria-label='Chapters'],[data-mobile-volume-control],[aria-label='Settings'])]:invisible! max-[640px]:[.courses-main:has([data-learning-player-tiny])_&]:[&_:is([data-player-control-hit-area]:has([aria-label*='elapsed']),[data-player-control-hit-area]:has([aria-label='Toggle_fullscreen']),[aria-label*='elapsed'],[aria-label='Toggle_fullscreen'])]:hidden! max-[640px]:[.courses-main:has([data-learning-player-tiny])_&]:[&_[data-player-control-cluster='mobile-play']]:scale-65 max-[640px]:[.courses-main:has([data-learning-player-compact])_&]:[&_:is([data-player-control-cluster]:has([aria-label='Previous_lesson']),[data-player-control-cluster]:has([aria-label='Next_lesson']),[aria-label='Autoplay_next_lesson'],[aria-label='Chapters'],[data-player-control-hit-area='chapters'],[aria-label='Settings'],[data-player-control-hit-area='course-lessons'],[data-learning-player-minimize-layer],[data-mobile-volume-control])]:hidden! [.courses-main:has([data-learning-player-resizing],[data-learning-player-hidden])_&]:[&_[data-video-player-control-layer]]:invisible! [.courses-main:has([data-learning-player-resizing],[data-learning-player-hidden])_&]:[&_[data-player-bottom-corner-controls-layer]]:invisible! [.courses-main:has([data-learning-player-resizing],[data-learning-player-hidden])_&]:[&_[data-player-timeline-wrap]]:invisible! [.courses-main:has([data-learning-player-shortened])_&]:[&_.video-shell]:h-full [.courses-main:has([data-learning-player-shortened])_&]:[&_.youtube-player]:aspect-auto! [.courses-main:has([data-learning-player-shortened])_&]:[&_.youtube-player]:h-full! [.courses-main:has([data-learning-player-shortened])_&]:[&_.video-shell]:bg-black [.courses-main:has([data-learning-player-shortened])_&]:[&_.youtube-player]:bg-transparent! [.courses-main:has([data-learning-player-shortened])_&]:[&_[data-player-zoom-viewport]]:right-auto! [.courses-main:has([data-learning-player-shortened])_&]:[&_[data-player-zoom-viewport]]:left-1/2! [.courses-main:has([data-learning-player-shortened])_&]:[&_[data-player-zoom-viewport]]:aspect-video [.courses-main:has([data-learning-player-shortened])_&]:[&_[data-player-zoom-viewport]]:-translate-x-1/2 [.courses-main:has([data-learning-player-shortened])_&]:[&_[data-player-zoom-viewport]]:overflow-visible! data-[learning-player-window-motion]:flex data-[learning-player-window-motion]:h-[calc(anchor-size(height)+52px*var(--learning-player-window-inverse-scale,1))]! data-[learning-player-window-motion]:flex-col [.courses-app--resizing_&]:[&_video]:opacity-[0.999] [.courses-main:has(.is-curriculum-resizing,[data-learning-player-resizing])_&]:[&_video]:opacity-[0.999]"
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
      {mini ? <MiniPlayerReadingModeEffects /> : null}
      <LessonVideoPlayer
        {...lessonVideoPlayerProps}
        minimizeMotionTarget={resolveMinimizeMotionTarget}
        onMinimizeGestureStart={finishRestoreBeforeMinimize}
        onMinimizeTriggerReady={setMinimizeTrigger}
        presentation={presentation}
        onMiniClose={onClose}
        onMiniRestore={restoreFromCurrentRect}
        onMiniPlayerRestoreReady={undefined}
      />
      {/* Rendered in both presentations so the bar that travels with the
          moving window is the same node the mini window keeps. While the
          window is scaled, `zoom` enlarges the bar by the inverse scale so
          it lands at its real size. */}
      <div
        className={
          mini
            ? "contents"
            : `hidden shrink-0 [zoom:var(--learning-player-window-inverse-scale,1)] transition-opacity duration-500 ease-out group-data-[learning-player-window-motion]/window-motion:block group-data-[learning-player-window-motion=minimizing]/window-motion:starting:opacity-0 group-data-[learning-player-window-motion=returning]/window-motion:opacity-0 motion-reduce:transition-none ${MINI_INFO_BAR_SLOT_CLASS}`
        }
        inert={mini ? undefined : true}
      >
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
      </div>
      {mini && isExpanded ? (
        <div
          className="hidden min-[641px]:flex flex-col w-full h-(--learning-mini-player-playlist-height,320px) shrink-0 overflow-hidden"
          data-learning-mini-player-gesture-ignore=""
          data-learning-mini-player-playlist-shell=""
        >
          <Curriculum
            hideHero
            sections={miniCurriculumSections}
            lessonsById={player.curriculumLessonsById ?? EMPTY_LESSONS_BY_ID}
            selectedLesson={miniSelectedLesson}
            lessonProgress={miniLessonProgress}
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

  // The stand-in for the lesson page waits, hidden, beside the player so an
  // expand can start moving it on the frame of the click. It stays mounted
  // in both presentations: it is still dissolving when the player turns full.
  const hostWithPlaceholders = (
    <>
      <LearningExpandPlaceholderSheet />
      {playerHost}
    </>
  );

  return mainScrollportRef.current
    ? createPortal(hostWithPlaceholders, mainScrollportRef.current)
    : hostWithPlaceholders;
}
