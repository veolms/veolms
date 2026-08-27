import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SidebarToggleIcon } from "../shell/SidebarToggleIcon";
import {
  FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
  FloatingScrollbar,
} from "../shell/FloatingScrollbar";
import type { FloatingScrollbarHorizontalDragDetail } from "../shell/FloatingScrollbar";
import { scrollApplicationTo } from "../shell/applicationScroll";
import { isEditingShortcutTarget } from "../keyboardShortcuts";
import { useShortcutPlatform } from "../useShortcutPlatform";
import { VideoPlayer as YouTubeVideoPlayer } from "../VideoPlayer";
import {
  createCurriculumSections,
  createLessonsById,
  getCourseVideoForLesson,
} from "./courseContent";
import { Curriculum } from "./Curriculum";
import { getCourseThumbnail, getCourseTitle } from "./courseMetadata";
import { Discussion } from "./Discussion";
import { useCurriculumTestPreferences } from "./useCurriculumTestPreferences";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

const CURRICULUM_COLLAPSED_WIDTH = 0;
const CURRICULUM_MIN_WIDTH = 300;
const CURRICULUM_DEFAULT_WIDTH = 400;
const CURRICULUM_MAX_WIDTH = 560;
const CURRICULUM_SNAP_WIDTH = CURRICULUM_MIN_WIDTH / 2;
const LESSON_DRAWER_FALLBACK_SNAP_POINT = 0.72;
const CURRICULUM_SWIPE_ACTIVATION_DISTANCE = 12;
const CURRICULUM_SWIPE_DIRECTION_RATIO = 1.2;
const CURRICULUM_SWIPE_COMMIT_DISTANCE = 72;
const CURRICULUM_SWIPE_FLING_DISTANCE = 24;
const CURRICULUM_SWIPE_FLING_VELOCITY = 0.3;
const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

const CURRICULUM_SWIPE_EXCLUSION_SELECTOR = [
  ".learning-curriculum__resize-rail",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="slider"]',
  "[data-sidebar-swipe-ignore]",
  "[data-learning-swipe-ignore]",
].join(",");

const isCurriculumSwipeExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(CURRICULUM_SWIPE_EXCLUSION_SELECTOR));

const clampCurriculumWidth = (value: number) =>
  Math.min(CURRICULUM_MAX_WIDTH, Math.max(CURRICULUM_MIN_WIDTH, value));

const getInitialCurriculumWidth = () => {
  if (typeof window === "undefined") return CURRICULUM_DEFAULT_WIDTH;

  try {
    const storedWidth = window.localStorage.getItem("veolms-curriculum-width");
    if (storedWidth === null) return CURRICULUM_DEFAULT_WIDTH;

    const savedWidth = Number(storedWidth);
    return Number.isFinite(savedWidth)
      ? clampCurriculumWidth(savedWidth)
      : CURRICULUM_DEFAULT_WIDTH;
  } catch {
    return CURRICULUM_DEFAULT_WIDTH;
  }
};

interface LearningWorkspaceProps {
  courseSlug: string | undefined;
  lessonId: number;
  backLabel: string;
  onSelectLesson: (lessonId: number) => void;
  onOpenCourseOverview: () => void;
  onNavigateBack: () => void;
}

interface CurriculumResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  collapsedAtStart: boolean;
  collapsed: boolean;
  collapsedAnchorX: number;
  collapsedAnchorWidth: number;
  expandedAnchorX: number | null;
  previewWidth: number;
  handle: HTMLElement;
}

interface CurriculumPointerEvent {
  pointerId: number;
  clientX: number;
}

interface CurriculumScreenSwipe {
  pointerId: number;
  active: boolean;
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  closedAtStart: boolean;
  expandedWidthAtStart: number;
  handle: HTMLDivElement;
}

interface LessonDrawerViewportBounds {
  left: number;
  width: number;
}

type LearningWorkspaceStyle = CSSProperties & {
  "--learning-curriculum-width": string;
  "--learning-curriculum-expanded-width": string;
};

export function LearningWorkspace({
  courseSlug,
  lessonId,
  backLabel,
  onSelectLesson,
  onOpenCourseOverview,
  onNavigateBack,
}: LearningWorkspaceProps) {
  const lessonStorageKey = `veolms-last-lesson-${encodeURIComponent(courseSlug || "default")}`;
  const shortcutPlatform = useShortcutPlatform();
  const [selectedLesson, setSelectedLesson] = useState(lessonId);
  const pendingLessonSelectionRef = useRef<number | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<number, number>>(
    {},
  );
  const [autoPlayOnLessonChange, setAutoPlayOnLessonChange] = useState(false);
  const courseTitle = getCourseTitle(courseSlug);
  const coursePersistenceKey = encodeURIComponent(courseSlug || "default");
  const discussionPersistenceKey = `${coursePersistenceKey}-lesson-${selectedLesson}`;
  const [lessonDrawer, setLessonDrawer] = useState(false);
  const [lessonDrawerSnapPoint, setLessonDrawerSnapPoint] = useState<
    number | string | null
  >(LESSON_DRAWER_FALLBACK_SNAP_POINT);
  const [lessonDrawerCollapsedSnapPoint, setLessonDrawerCollapsedSnapPoint] =
    useState(LESSON_DRAWER_FALLBACK_SNAP_POINT);
  const [lessonDrawerViewportBounds, setLessonDrawerViewportBounds] =
    useState<LessonDrawerViewportBounds | null>(null);
  const lessonDrawerSnapPoints = useMemo(
    () => [lessonDrawerCollapsedSnapPoint, 1],
    [lessonDrawerCollapsedSnapPoint],
  );
  const [curriculumFocusRequest, setCurriculumFocusRequest] = useState(0);
  const [curriculumWidth, setCurriculumWidth] = useState(
    getInitialCurriculumWidth,
  );
  const [curriculumCollapsed, setCurriculumCollapsed] = useState(false);
  const [curriculumResizing, setCurriculumResizing] = useState(false);
  const [curriculumResizePreviewWidth, setCurriculumResizePreviewWidth] =
    useState<number | null>(null);
  const { preferences: curriculumTestPreferences } =
    useCurriculumTestPreferences();
  const [theaterMode, setTheaterMode] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const lessonTriggerRef = useRef<HTMLButtonElement>(null);
  const curriculumScrollportRef = useRef<HTMLElement>(null);
  const lessonDrawerScrollportRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lessonDrawerSkipFinalFocusRef = useRef(false);
  const curriculumResizeRef = useRef<CurriculumResize | null>(null);
  const curriculumResizeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumResizeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeRef = useRef<CurriculumScreenSwipe | null>(null);
  const curriculumScreenSwipeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumScreenSwipeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeConsumedUntilRef = useRef(0);
  const isCourseContentDrawerLayout = useCallback(
    () => window.matchMedia("(max-width: 1080px)").matches,
    [],
  );
  const curriculumSections = useMemo(
    () =>
      createCurriculumSections(
        curriculumTestPreferences.sectionCount,
        curriculumTestPreferences.lectureCount,
      ),
    [
      curriculumTestPreferences.lectureCount,
      curriculumTestPreferences.sectionCount,
    ],
  );
  const curriculumLessonsById = useMemo(
    () => createLessonsById(curriculumSections),
    [curriculumSections],
  );
  const firstCurriculumLessonId = curriculumSections
    .find(({ lessons }) => lessons.length > 0)
    ?.lessons.at(0)?.[0];
  const firstCurriculumLesson = firstCurriculumLessonId
    ? curriculumLessonsById.get(firstCurriculumLessonId)
    : undefined;
  const currentLesson =
    curriculumLessonsById.get(selectedLesson) || firstCurriculumLesson!;
  const courseThumbnail = getCourseThumbnail(courseSlug);
  const curriculumShortcutLabel = shortcutPlatform === "mac" ? "⌥+C" : "Alt+C";

  useLayoutEffect(() => {
    const main = mainRef.current;
    const playerWrap = playerWrapRef.current;
    if (!main || !playerWrap) return undefined;

    const stickyCompactLayout = window.matchMedia("(max-width: 840px)");
    let frame: number | null = null;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => schedulePlayerHeightSync());

    const syncPlayerHeight = () => {
      frame = null;
      if (!stickyCompactLayout.matches) {
        main.style.removeProperty("--learning-mobile-player-height");
        return;
      }

      const nextHeight = playerWrap.getBoundingClientRect().height;
      if (!Number.isFinite(nextHeight)) return;
      main.style.setProperty(
        "--learning-mobile-player-height",
        `${Math.round(nextHeight * 2) / 2}px`,
      );
    };

    function schedulePlayerHeightSync() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(syncPlayerHeight);
    }

    const syncObservation = () => {
      observer?.disconnect();
      if (stickyCompactLayout.matches) {
        observer?.observe(playerWrap);
        schedulePlayerHeightSync();
      } else {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        main.style.removeProperty("--learning-mobile-player-height");
      }
    };

    syncObservation();
    stickyCompactLayout.addEventListener("change", syncObservation);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      stickyCompactLayout.removeEventListener("change", syncObservation);
    };
  }, [theaterMode]);

  const getLessonDrawerCollapsedSnapPoint = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const playerBottom = playerWrapRef.current?.getBoundingClientRect().bottom;
    if (playerBottom === undefined || !Number.isFinite(playerBottom)) {
      return LESSON_DRAWER_FALLBACK_SNAP_POINT;
    }

    return Math.max(2, Math.round(viewportHeight - playerBottom));
  }, []);

  const getLessonDrawerViewportBounds = useCallback(() => {
    if (!isCourseContentDrawerLayout()) return null;

    const playerBounds = playerWrapRef.current?.getBoundingClientRect();
    if (
      !playerBounds ||
      !Number.isFinite(playerBounds.left) ||
      !Number.isFinite(playerBounds.width) ||
      playerBounds.width <= 0
    ) {
      return null;
    }

    const left = Math.max(0, playerBounds.left);
    const width = Math.min(
      playerBounds.width,
      Math.max(0, window.innerWidth - left),
    );
    return width > 0 ? { left, width } : null;
  }, [isCourseContentDrawerLayout]);

  const selectLesson = (lessonNumber: number) => {
    if (lessonNumber === selectedLesson) return;
    pendingLessonSelectionRef.current = lessonNumber;
    setAutoPlayOnLessonChange(true);
    setSelectedLesson(lessonNumber);
    onSelectLesson(lessonNumber);
  };

  const updateSelectedLessonProgress = useCallback(
    (progress: number) => {
      const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
      const nextProgress =
        roundedProgress >= LESSON_PROGRESS_COMPLETE_THRESHOLD
          ? 100
          : roundedProgress;
      setLessonProgress((current) => {
        if (current[selectedLesson] === nextProgress) return current;
        return { ...current, [selectedLesson]: nextProgress };
      });
    },
    [selectedLesson],
  );

  useEffect(() => {
    const pendingLessonSelection = pendingLessonSelectionRef.current;
    if (pendingLessonSelection !== null) {
      if (lessonId !== pendingLessonSelection) return;
      pendingLessonSelectionRef.current = null;
    }

    const nextLessonId = curriculumLessonsById.has(lessonId)
      ? lessonId
      : firstCurriculumLessonId;
    if (nextLessonId === undefined || nextLessonId === selectedLesson) return;
    setAutoPlayOnLessonChange(true);
    setSelectedLesson(nextLessonId);
    if (nextLessonId !== lessonId) onSelectLesson(nextLessonId);
  }, [
    curriculumLessonsById,
    firstCurriculumLessonId,
    lessonId,
    onSelectLesson,
    selectedLesson,
  ]);

  const toggleTheaterMode = () => {
    setLessonDrawer(false);
    setLessonDrawerViewportBounds(null);
    const nextMode = !theaterMode;
    setTheaterMode(nextMode);

    if (nextMode) {
      window.requestAnimationFrame(() => {
        scrollApplicationTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      });
    }
  };

  const openLessonDrawer = useCallback(() => {
    if (!isCourseContentDrawerLayout()) {
      setCurriculumCollapsed(false);
    }
    setCurriculumFocusRequest((request) => request + 1);
    if (!isCourseContentDrawerLayout()) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const collapsedSnapPoint = getLessonDrawerCollapsedSnapPoint();
    setLessonDrawerCollapsedSnapPoint(collapsedSnapPoint);
    setLessonDrawerSnapPoint(collapsedSnapPoint);
    setLessonDrawerViewportBounds(getLessonDrawerViewportBounds());
    setLessonDrawer(true);
  }, [
    getLessonDrawerCollapsedSnapPoint,
    getLessonDrawerViewportBounds,
    isCourseContentDrawerLayout,
  ]);

  const closeLessonDrawer = useCallback(() => {
    setLessonDrawer(false);
    setLessonDrawerViewportBounds(null);
  }, []);

  useEffect(() => {
    if (!lessonDrawer) return undefined;
    const compactWorkspace = window.matchMedia("(max-width: 1080px)");
    const appShell =
      playerWrapRef.current?.closest(".courses-app") ??
      document.querySelector(".courses-app");
    let resizeTimer: number | null = null;

    const syncDrawerGeometry = () => {
      if (!isCourseContentDrawerLayout()) {
        setLessonDrawerViewportBounds(null);
        return;
      }

      setLessonDrawerViewportBounds(getLessonDrawerViewportBounds());
      const collapsedSnapPoint = getLessonDrawerCollapsedSnapPoint();
      setLessonDrawerCollapsedSnapPoint(collapsedSnapPoint);
      setLessonDrawerSnapPoint((currentSnapPoint) =>
        currentSnapPoint === 1 ? 1 : collapsedSnapPoint,
      );
    };

    const scheduleCollapsedSnapPoint = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        syncDrawerGeometry();
      }, 120);
    };

    const syncWorkspaceLayout = () => {
      if (!isCourseContentDrawerLayout()) {
        lessonDrawerSkipFinalFocusRef.current = true;
        setLessonDrawer(false);
        setLessonDrawerViewportBounds(null);
        return;
      }
      scheduleCollapsedSnapPoint();
    };

    syncDrawerGeometry();
    const playerResizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleCollapsedSnapPoint);
    if (playerWrapRef.current)
      playerResizeObserver?.observe(playerWrapRef.current);

    compactWorkspace.addEventListener("change", syncWorkspaceLayout);
    const appShellObserver =
      typeof MutationObserver === "undefined" || !appShell
        ? null
        : new MutationObserver(syncWorkspaceLayout);
    if (appShell && appShellObserver) {
      appShellObserver.observe(appShell, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    window.addEventListener("resize", scheduleCollapsedSnapPoint);
    window.visualViewport?.addEventListener(
      "resize",
      scheduleCollapsedSnapPoint,
    );
    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      playerResizeObserver?.disconnect();
      compactWorkspace.removeEventListener("change", syncWorkspaceLayout);
      appShellObserver?.disconnect();
      window.removeEventListener("resize", scheduleCollapsedSnapPoint);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleCollapsedSnapPoint,
      );
    };
  }, [
    getLessonDrawerCollapsedSnapPoint,
    getLessonDrawerViewportBounds,
    isCourseContentDrawerLayout,
    lessonDrawer,
  ]);

  const startCurriculumScreenSwipe = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      isCourseContentDrawerLayout() ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      event.clientX < window.innerWidth / 2 ||
      curriculumResizeRef.current ||
      curriculumScreenSwipeRef.current ||
      isCurriculumSwipeExcludedTarget(event.target)
    )
      return;

    curriculumScreenSwipeRef.current = {
      pointerId: event.pointerId,
      active: false,
      startedAt: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      closedAtStart: curriculumCollapsed,
      expandedWidthAtStart: curriculumWidth,
      handle: event.currentTarget,
    };
  };

  const moveCurriculumScreenSwipe = (event: PointerEvent) => {
    const swipe = curriculumScreenSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (!swipe.active) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);
      if (
        verticalDistance >= CURRICULUM_SWIPE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * CURRICULUM_SWIPE_DIRECTION_RATIO
      ) {
        curriculumScreenSwipeRef.current = null;
        return;
      }
      if (horizontalDistance < CURRICULUM_SWIPE_ACTIVATION_DISTANCE) return;
      if (
        horizontalDistance <=
        verticalDistance * CURRICULUM_SWIPE_DIRECTION_RATIO
      )
        return;

      const opensClosedCurriculum = swipe.closedAtStart && deltaX < 0;
      const closesOpenCurriculum = !swipe.closedAtStart && deltaX > 0;
      if (!opensClosedCurriculum && !closesOpenCurriculum) {
        curriculumScreenSwipeRef.current = null;
        return;
      }

      swipe.active = true;
      setCurriculumResizePreviewWidth(
        swipe.closedAtStart ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
      );
      setCurriculumResizing(true);
      try {
        swipe.handle.setPointerCapture?.(swipe.pointerId);
      } catch {
        // Window-level listeners keep the swipe active without pointer capture.
      }
    }

    event.preventDefault();
    const eventTimestamp = event.timeStamp || performance.now();
    const timestamp = Math.max(eventTimestamp, swipe.lastTimestamp + 1);
    const elapsed = timestamp - swipe.lastTimestamp;
    const instantaneousVelocity = (event.clientX - swipe.lastX) / elapsed;
    swipe.velocityX =
      swipe.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : swipe.velocityX * 0.35 + instantaneousVelocity * 0.65;
    swipe.lastX = event.clientX;
    swipe.lastTimestamp = timestamp;

    const startWidth = swipe.closedAtStart
      ? CURRICULUM_COLLAPSED_WIDTH
      : swipe.expandedWidthAtStart;
    setCurriculumResizePreviewWidth(
      Math.min(
        swipe.expandedWidthAtStart,
        Math.max(CURRICULUM_COLLAPSED_WIDTH, startWidth - deltaX),
      ),
    );
  };

  const endCurriculumScreenSwipe = (event: PointerEvent, cancelled = false) => {
    const swipe = curriculumScreenSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    curriculumScreenSwipeRef.current = null;
    try {
      swipe.handle.releasePointerCapture?.(swipe.pointerId);
    } catch {
      // Capture may already have been released when the swipe ends.
    }
    if (!swipe.active) return;

    event.preventDefault();
    curriculumScreenSwipeConsumedUntilRef.current = performance.now() + 450;
    setCurriculumResizing(false);
    setCurriculumResizePreviewWidth(null);
    if (cancelled) return;

    const totalDistance = swipe.lastX - swipe.startX;
    const finishedAt = event.timeStamp || performance.now();
    const averageVelocity =
      totalDistance / Math.max(1, finishedAt - swipe.startedAt);
    const fastFling =
      Math.abs(totalDistance) >= CURRICULUM_SWIPE_FLING_DISTANCE &&
      Math.max(Math.abs(swipe.velocityX), Math.abs(averageVelocity)) >=
        CURRICULUM_SWIPE_FLING_VELOCITY;
    const shouldCommit =
      fastFling || Math.abs(totalDistance) >= CURRICULUM_SWIPE_COMMIT_DISTANCE;
    if (!shouldCommit) return;

    setCurriculumCollapsed(!swipe.closedAtStart);
  };

  curriculumScreenSwipeMoveRef.current = moveCurriculumScreenSwipe;
  curriculumScreenSwipeFinishRef.current = endCurriculumScreenSwipe;

  useEffect(() => {
    const continueSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeMoveRef.current?.(event);
    const finishSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event);
    const cancelSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueSwipe, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishSwipe, true);
    window.addEventListener("pointercancel", cancelSwipe, true);
    return () => {
      window.removeEventListener("pointermove", continueSwipe, true);
      window.removeEventListener("pointerup", finishSwipe, true);
      window.removeEventListener("pointercancel", cancelSwipe, true);
    };
  }, []);

  const suppressCurriculumSwipeClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (performance.now() > curriculumScreenSwipeConsumedUntilRef.current)
      return;
    curriculumScreenSwipeConsumedUntilRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const handleCurriculumShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== "KeyC" && event.key.toLowerCase() !== "c") ||
        isEditingShortcutTarget(event.target)
      )
        return;

      event.preventDefault();
      if (isCourseContentDrawerLayout()) {
        if (lessonDrawer) closeLessonDrawer();
        else openLessonDrawer();
        return;
      }

      setCurriculumCollapsed((collapsed) => !collapsed);
    };

    window.addEventListener("keydown", handleCurriculumShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleCurriculumShortcut, true);
  }, [
    closeLessonDrawer,
    isCourseContentDrawerLayout,
    lessonDrawer,
    openLessonDrawer,
  ]);

  const commitCurriculumWidth = useCallback((value: number) => {
    const nextWidth = clampCurriculumWidth(value);
    setCurriculumWidth(nextWidth);
    try {
      localStorage.setItem(
        "veolms-curriculum-width",
        String(Math.round(nextWidth)),
      );
    } catch {
      // Resizing remains available when browser storage is unavailable.
    }
  }, []);

  const beginCurriculumResize = useCallback(
    (pointerId: number, clientX: number, handle: HTMLElement) => {
      if (isCourseContentDrawerLayout()) return;
      curriculumResizeRef.current = {
        pointerId,
        startX: clientX,
        startWidth: curriculumCollapsed
          ? CURRICULUM_COLLAPSED_WIDTH
          : curriculumWidth,
        expandedWidthAtStart: curriculumWidth,
        collapsedAtStart: curriculumCollapsed,
        collapsed: curriculumCollapsed,
        collapsedAnchorX: clientX,
        collapsedAnchorWidth: curriculumCollapsed
          ? CURRICULUM_COLLAPSED_WIDTH
          : curriculumWidth,
        expandedAnchorX: null,
        previewWidth: curriculumCollapsed
          ? CURRICULUM_COLLAPSED_WIDTH
          : curriculumWidth,
        handle,
      };
      setCurriculumResizePreviewWidth(
        curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
      );
      setCurriculumResizing(true);
    },
    [curriculumCollapsed, curriculumWidth, isCourseContentDrawerLayout],
  );

  const startCurriculumResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isCourseContentDrawerLayout()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginCurriculumResize(event.pointerId, event.clientX, event.currentTarget);
  };

  const moveCurriculumResize = useCallback((event: CurriculumPointerEvent) => {
    const resize = curriculumResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    let previewWidth: number;

    if (resize.collapsed) {
      const candidateWidth = Math.min(
        CURRICULUM_MAX_WIDTH,
        Math.max(
          CURRICULUM_COLLAPSED_WIDTH,
          resize.collapsedAnchorWidth + resize.collapsedAnchorX - event.clientX,
        ),
      );

      if (candidateWidth >= CURRICULUM_SNAP_WIDTH) {
        resize.collapsed = false;
        resize.expandedAnchorX = event.clientX;
        previewWidth = CURRICULUM_MIN_WIDTH;
        setCurriculumCollapsed(false);
      } else {
        previewWidth = candidateWidth;
      }
    } else {
      const candidateWidth =
        resize.expandedAnchorX === null
          ? resize.startWidth + resize.startX - event.clientX
          : CURRICULUM_MIN_WIDTH + resize.expandedAnchorX - event.clientX;
      previewWidth = Math.min(
        CURRICULUM_MAX_WIDTH,
        Math.max(CURRICULUM_COLLAPSED_WIDTH, candidateWidth),
      );

      if (candidateWidth <= CURRICULUM_SNAP_WIDTH) {
        resize.collapsed = true;
        resize.collapsedAnchorX = event.clientX;
        resize.collapsedAnchorWidth = previewWidth;
        resize.expandedAnchorX = null;
        setCurriculumCollapsed(true);
      }
    }

    resize.previewWidth = previewWidth;
    setCurriculumResizePreviewWidth(previewWidth);

    if (!resize.collapsed && previewWidth >= CURRICULUM_MIN_WIDTH) {
      setCurriculumWidth(previewWidth);
    }
  }, []);

  const endCurriculumResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = curriculumResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      curriculumResizeRef.current = null;
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
      resize.handle?.releasePointerCapture?.(resize.pointerId);

      if (cancelled) {
        setCurriculumCollapsed(resize.collapsedAtStart);
        setCurriculumWidth(resize.expandedWidthAtStart);
        return;
      }
      if (resize.collapsed) {
        setCurriculumCollapsed(true);
        setCurriculumWidth(resize.expandedWidthAtStart);
        return;
      }
      setCurriculumCollapsed(false);
      commitCurriculumWidth(resize.previewWidth);
    },
    [commitCurriculumWidth],
  );

  useEffect(() => {
    const handleScrollbarHorizontalDrag = (event: Event) => {
      const { detail } =
        event as CustomEvent<FloatingScrollbarHorizontalDragDetail>;
      if (detail.ariaControls !== "courses-main-scrollport") return;

      if (detail.phase === "start") {
        beginCurriculumResize(detail.pointerId, detail.clientX, detail.handle);
      } else if (detail.phase === "move") {
        moveCurriculumResize(detail);
      } else {
        endCurriculumResize(detail, detail.phase === "cancel");
      }
    };

    window.addEventListener(
      FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
      handleScrollbarHorizontalDrag,
    );
    return () =>
      window.removeEventListener(
        FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
        handleScrollbarHorizontalDrag,
      );
  }, [beginCurriculumResize, endCurriculumResize, moveCurriculumResize]);

  useLayoutEffect(() => {
    curriculumResizeMoveRef.current = moveCurriculumResize;
    curriculumResizeFinishRef.current = endCurriculumResize;

    return () => {
      if (curriculumResizeMoveRef.current === moveCurriculumResize) {
        curriculumResizeMoveRef.current = null;
      }
      if (curriculumResizeFinishRef.current === endCurriculumResize) {
        curriculumResizeFinishRef.current = null;
      }
    };
  }, [moveCurriculumResize, endCurriculumResize]);

  useEffect(() => {
    if (!curriculumResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      curriculumResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [curriculumResizing]);

  const handleCurriculumResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (curriculumCollapsed && event.key === "ArrowLeft") {
        setCurriculumCollapsed(false);
        commitCurriculumWidth(CURRICULUM_MIN_WIDTH);
        return;
      }
      if (!curriculumCollapsed) {
        const direction = event.key === "ArrowRight" ? -16 : 16;
        commitCurriculumWidth(curriculumWidth + direction);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurriculumCollapsed(true);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurriculumCollapsed(false);
      commitCurriculumWidth(CURRICULUM_MAX_WIDTH);
    }
  };

  const toggleCurriculumFromResizeRail = () => {
    if (isCourseContentDrawerLayout()) return;
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  const toggleCurriculumFromPlayer = () => {
    if (isCourseContentDrawerLayout()) return;
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  useEffect(() => {
    try {
      localStorage.setItem(lessonStorageKey, String(selectedLesson));
    } catch {
      // Lesson selection remains usable when browser storage is unavailable.
    }
  }, [lessonStorageKey, selectedLesson]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("veolms-course-autostart");
      localStorage.removeItem("veolms-player-autoplay");
    } catch {
      // Retired preferences are cleaned up on a best-effort basis.
    }
  }, []);

  const curriculumViewportWidth =
    curriculumResizePreviewWidth ??
    (curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth);
  const curriculumAccessibleWidth = Math.max(
    CURRICULUM_MIN_WIDTH,
    curriculumResizePreviewWidth ?? curriculumWidth,
  );

  return (
    <div
      className={`learning-workspace ${theaterMode ? "is-theater" : ""} ${curriculumResizing ? "is-curriculum-resizing" : ""}`}
      onPointerDownCapture={startCurriculumScreenSwipe}
      onClickCapture={suppressCurriculumSwipeClick}
    >
      <link
        rel="preload"
        as="image"
        href={courseThumbnail}
        fetchPriority="high"
      />
      <main
        ref={mainRef}
        className={`learning-workspace__main ${curriculumCollapsed ? "is-curriculum-collapsed" : ""}`}
        inert={lessonDrawer ? true : undefined}
        aria-hidden={lessonDrawer || undefined}
        style={
          {
            "--learning-curriculum-width": `${curriculumViewportWidth}px`,
            "--learning-curriculum-expanded-width": `${curriculumWidth}px`,
          } as LearningWorkspaceStyle
        }
      >
        <section className="learning-workspace__lesson-column">
          <div ref={playerWrapRef} className="learning-workspace__player-wrap">
            <button
              type="button"
              className="learning-workspace__back"
              aria-label={backLabel}
              onClick={onNavigateBack}
            >
              <ArrowLeft size={22} />
            </button>
            <button
              type="button"
              className="learning-workspace__curriculum-toggle"
              aria-label={
                curriculumCollapsed
                  ? "Expand course content"
                  : "Collapse course content"
              }
              aria-expanded={!curriculumCollapsed}
              aria-controls="learning-course-content"
              aria-keyshortcuts="Alt+C"
              title={`${curriculumCollapsed ? "Expand" : "Collapse"} (${curriculumShortcutLabel})`}
              onClick={toggleCurriculumFromPlayer}
            >
              <span
                className="learning-workspace__curriculum-toggle-icon"
                aria-hidden="true"
              >
                <SidebarToggleIcon
                  direction={curriculumCollapsed ? "left" : "right"}
                />
              </span>
            </button>
            <YouTubeVideoPlayer
              media={getCourseVideoForLesson(currentLesson[0])}
              lessonTitle={currentLesson[1]}
              theaterMode={theaterMode}
              onTheaterToggle={toggleTheaterMode}
              autoPlayOnMediaChange={autoPlayOnLessonChange}
              onProgressChange={updateSelectedLessonProgress}
              resumePersistenceKey={`${coursePersistenceKey}-lesson-${selectedLesson}`}
            />
          </div>

          <article
            className="learning-workspace__lesson-content"
            aria-labelledby="learning-lesson-title"
          >
            <header>
              <button
                id="learning-course-content-trigger"
                ref={lessonTriggerRef}
                type="button"
                className="learning-workspace__lesson-heading"
                aria-label={`Open course lessons for ${currentLesson[1]}`}
                aria-expanded={lessonDrawer}
                onClick={openLessonDrawer}
              >
                <div className="min-w-0">
                  <h1 id="learning-lesson-title">{currentLesson[1]}</h1>
                </div>
              </button>
            </header>
            <Discussion
              key={discussionPersistenceKey}
              persistenceKey={discussionPersistenceKey}
            />
          </article>
        </section>

        <div
          className={`learning-workspace__curriculum-column ${curriculumCollapsed ? "is-collapsed" : ""}`}
        >
          <div
            className="learning-curriculum__resize-rail"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize course curriculum"
            aria-keyshortcuts="Alt+C"
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
                    curriculumViewportWidth < CURRICULUM_MIN_WIDTH
                      ? ", sliding closed"
                      : ""
                  }`
            }
            tabIndex={0}
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
            <Curriculum
              sections={curriculumSections}
              lessonsById={curriculumLessonsById}
              scrollportRef={curriculumScrollportRef}
              scrollportId="learning-course-curriculum-scrollport"
              selectedLesson={selectedLesson}
              lessonProgress={lessonProgress}
              onSelectLesson={selectLesson}
              onOpenCourseOverview={onOpenCourseOverview}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              focusRequest={curriculumFocusRequest}
              persistenceKey={coursePersistenceKey}
            />
          </div>
        </div>
      </main>

      <FloatingScrollbar
        scrollportRef={curriculumScrollportRef}
        ariaControls="learning-course-curriculum-scrollport"
        ariaLabel="Course curriculum scroll position"
        className="floating-scrollbar--curriculum"
        disabled={curriculumCollapsed || theaterMode || lessonDrawer}
      />

      <Drawer
        open={lessonDrawer}
        onOpenChange={(open) => {
          if (open) openLessonDrawer();
          else closeLessonDrawer();
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setLessonDrawerSnapPoint(lessonDrawerCollapsedSnapPoint);
        }}
        snapPoints={lessonDrawerSnapPoints}
        snapPoint={lessonDrawerSnapPoint}
        onSnapPointChange={setLessonDrawerSnapPoint}
        snapToSequentialPoints
        showSwipeHandle
        swipeHandleClassName="absolute inset-x-0 top-0 z-30 pt-2 group-data-[swipe-axis=y]/drawer-popup:h-7 group-data-[swipe-direction=down]/drawer-popup:items-start after:bg-white/75 after:shadow-[0_1px_3px_rgba(0,0,0,0.48)]"
        triggerId="learning-course-content-trigger"
      >
        <DrawerContent
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
              ...(lessonDrawerCollapsedSnapPoint > 1
                ? {
                    "--learning-drawer-collapsed-height": `${lessonDrawerCollapsedSnapPoint}px`,
                  }
                : {}),
              ...(lessonDrawerViewportBounds
                ? {
                    left: `${lessonDrawerViewportBounds.left}px`,
                    right: "auto",
                    width: `${lessonDrawerViewportBounds.width}px`,
                  }
                : {}),
            } as CSSProperties
          }
          className="learning-course-content-drawer overflow-hidden data-expanded:rounded-none data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] [--drawer-bleed-background:var(--canvas)] bg-(--canvas) shadow-[0_-18px_48px_rgba(0,0,0,0.32)]"
        >
          <DrawerTitle className="sr-only">Course lessons</DrawerTitle>
          <DrawerDescription className="sr-only">
            Browse sections and choose a lesson.
          </DrawerDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Curriculum
              sections={curriculumSections}
              lessonsById={curriculumLessonsById}
              scrollportRef={lessonDrawerScrollportRef}
              scrollportId="lesson-drawer-curriculum-scrollport"
              selectedLesson={selectedLesson}
              lessonProgress={lessonProgress}
              onSelectLesson={selectLesson}
              onOpenCourseOverview={onOpenCourseOverview}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              focusRequest={curriculumFocusRequest}
              persistenceKey={coursePersistenceKey}
              onClose={closeLessonDrawer}
            />
          </div>
        </DrawerContent>
      </Drawer>
      <FloatingScrollbar
        scrollportRef={lessonDrawerScrollportRef}
        ariaControls="lesson-drawer-curriculum-scrollport"
        ariaLabel="Course curriculum scroll position"
        className="floating-scrollbar--curriculum floating-scrollbar--drawer"
        disabled={!lessonDrawer}
      />
    </div>
  );
}
