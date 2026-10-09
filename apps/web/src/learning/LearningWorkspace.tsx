import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import "./learning-feature.css";
import "./learning-split-layout.css";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  LessonResource,
  MyQuizAssignment,
  VideoPlaybackBootstrap,
} from "@veolms/contracts";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import {
  DRAWER_SWIPE_THROUGH_VIEWPORT_CLASS,
  claimPointerGesture,
  getLearningPlayerSwipeSplitX,
  isFullLearningPlayerSwipeTarget,
  subscribeToPointerGestureClaims,
} from "../gestures/pointerGestureOwnership";
import { useSecondPressHold } from "../gestures/useSecondPressHold";
import {
  FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
  FloatingScrollbar,
} from "../shell/FloatingScrollbar";
import type { FloatingScrollbarHorizontalDragDetail } from "../shell/FloatingScrollbar";
import { scrollApplicationTo } from "../shell/applicationScroll";
import { isEditingShortcutTarget } from "../keyboardShortcuts";
import { ALLOW_GUEST_LEARNING } from "../routing/routeAccess";
import { useShortcutPlatform } from "../useShortcutPlatform";
import { LessonVideoPlayer } from "./player/LessonVideoPlayer";
import { LessonPlayerChromePlaceholder } from "./player/LessonPlayerChromePlaceholder";
import type {
  LessonPlayerMinimizeGestureState,
  LessonVideoPlayerProps,
  NextLessonInfo,
  RegisterPersistentLearningPlayer,
} from "./player";
import type { LearningMiniPlayerRequest } from "./player/learningMiniPlayerTypes";
import {
  isDesktopLearningMinimizeViewport,
  LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY,
} from "./player/learningPlayerMotion";
import {
  LESSON_PLAYER_COMPACT_HEIGHT,
  LESSON_PLAYER_MAX_HEIGHT_PROPERTY,
  LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT,
  LESSON_PLAYER_SHORT_HEIGHT,
  LESSON_PLAYER_TINY_HEIGHT,
  LessonPlayerHeightHandle,
  useLessonHiddenVideoPullDown,
  useLessonPlayerHeight,
  useLessonTitleHeightSwipe,
} from "./player/LessonPlayerHeightHandle";
import {
  DEFAULT_LEARNING_PLAYER_PREFERENCES,
  getInitialLearningPlayerPreferences,
  publishLearningPlayerBootstrap,
} from "./learningPlayerPreferences";
import { writeAutoplayPreference } from "./player/lessonPlayerPersistence";
import {
  type Lesson,
  createLessonVideo,
  createLessonsById,
} from "./courseContent";
import { mediaService } from "../services/media";
import { Curriculum } from "./Curriculum";
import {
  applyCurriculumDragWidth,
  clearCurriculumDragWidth,
} from "./curriculumDragWidth";
import { CurriculumResizeGrip } from "./CurriculumResizeGrip";
import {
  FULLSCREEN_VIDEO_WIDTH_DEFAULT_PERCENT,
  FullscreenLandscapeCurriculumPanel,
} from "./FullscreenLandscapeCurriculumPanel";
import {
  getCourseThumbnail,
  getCourseThumbnailSrcSet,
  getCourseTitle,
} from "./courseMetadata";
import {
  canPlayCourseLesson,
  getPublicPreviewLessonNumbers,
} from "./coursePlayerAccess";
import { useAuthStore } from "../store/auth.store";
import {
  QuizAttemptPanel,
  QuizStageMessage,
} from "../quizzes/QuizAttemptPanel";
import { useCourseOverview } from "../services/courses";
import { useCurrentUser } from "../services/auth";
import { useEnrolledCourses } from "../services/enrollments";
import { useCourseQuizAssignments } from "../services/quizzes/quizzes.queries";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
import { adaptCourseOverviewToCurriculum } from "./courseCurriculumAdapter";
import {
  getCachedVideoPlaybackBootstrap,
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
  VideoPlaybackBootstrapError,
} from "./videoPlaybackBootstrap";
import {
  Discussion,
  PrerenderedMobileCommentComposer,
  type InteractionCapabilities,
  type LessonContentAccessState,
  type LessonParticipationState,
} from "./Discussion";
import {
  clampLearningCurriculumWidth,
  CURRICULUM_COLLAPSED_STORAGE_KEY,
  CURRICULUM_COLLAPSED_WIDTH,
  CURRICULUM_MAX_WIDTH,
  CURRICULUM_MIN_WIDTH,
  CURRICULUM_WIDTH_STORAGE_KEY,
  applyLearningShellToDocument,
  getInitialLearningShellState,
} from "./learningShellPreferences";
import { useLearningProgress } from "./useLearningProgress";
import {
  getPhoneLessonDrawerCollapsedSnapPoint,
  getSideLessonDrawerBounds,
  LESSON_DRAWER_DEFAULT_FLOATING_WIDTH,
  LESSON_DRAWER_MAX_FLOATING_WIDTH,
  LESSON_DRAWER_MIN_FLOATING_WIDTH,
  useLessonDrawerHeroControl,
} from "./useLessonDrawerHeroControl";
import type { LessonDrawerViewportBounds } from "./useLessonDrawerHeroControl";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

const CURRICULUM_SNAP_WIDTH = CURRICULUM_MIN_WIDTH / 2;
const FLOATING_LESSON_DRAWER_SNAP_WIDTH = LESSON_DRAWER_MIN_FLOATING_WIDTH / 2;
const LESSON_DRAWER_FALLBACK_SNAP_POINT = 0.72;
const CURRICULUM_SWIPE_ACTIVATION_DISTANCE = 12;
const CURRICULUM_SWIPE_DIRECTION_RATIO = 1.2;
const CURRICULUM_SWIPE_COMMIT_DISTANCE = 72;
const CURRICULUM_SWIPE_FLING_DISTANCE = 24;
const CURRICULUM_SWIPE_FLING_VELOCITY = 0.3;
const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;
const COURSE_CONTENT_DRAWER_QUERY = "(max-width: 1080px)";
const PHONE_LESSON_DRAWER_QUERY = "(max-width: 640px)";
const FLOATING_LESSON_DRAWER_WIDTH_KEY = "veolms-floating-curriculum-width";
const IDLE_PLAYER_MINIMIZE_GESTURE: LessonPlayerMinimizeGestureState = {
  offsetY: 0,
  phase: "idle",
  progress: 0,
};

const subscribeToCourseContentDrawerViewport = (onStoreChange: () => void) => {
  const media = window.matchMedia(COURSE_CONTENT_DRAWER_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getCourseContentDrawerViewportSnapshot = () =>
  window.matchMedia(COURSE_CONTENT_DRAWER_QUERY).matches;

const getCourseContentDrawerViewportServerSnapshot = () => false;

const subscribeToPhoneLessonDrawerViewport = (onStoreChange: () => void) => {
  const media = window.matchMedia(PHONE_LESSON_DRAWER_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getPhoneLessonDrawerViewportSnapshot = () =>
  window.matchMedia(PHONE_LESSON_DRAWER_QUERY).matches;

const getPhoneLessonDrawerViewportServerSnapshot = () => false;

const subscribeToDesktopLearningMinimizeViewport = (
  onStoreChange: () => void,
) => {
  const media = window.matchMedia(LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getDesktopLearningMinimizeViewportSnapshot = () =>
  window.matchMedia(LEARNING_DESKTOP_MINIMIZE_MEDIA_QUERY).matches;

const getDesktopLearningMinimizeViewportServerSnapshot = () => false;

const CURRICULUM_SWIPE_EXCLUSION_SELECTOR = [
  ".learning-curriculum__resize-rail",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="slider"]',
  "[data-player-control]",
  "[data-player-menu]",
  "[data-sidebar-swipe-ignore]",
  "[data-learning-swipe-ignore]",
].join(",");

const LESSON_DRAWER_REVEAL_EXCLUSION_SELECTOR = [
  ".learning-curriculum__resize-rail",
  ".elastic-scroller",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="slider"]',
  "[data-player-control]",
  "[data-player-menu]",
].join(",");

const safeResumeVideo = (video: HTMLVideoElement | null) => {
  if (!video || !video.paused) return;
  try {
    const playResult = video.play?.();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => undefined);
    }
  } catch {
    // Ignore environments where play() is unsupported (e.g. JSDOM) or rejected by browser policies
  }
};

const isCurriculumSwipeExcludedTarget = (
  target: EventTarget | null,
  selector = CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
) => target instanceof Element && Boolean(target.closest(selector));

const getInitialFloatingLessonDrawerWidth = () => {
  if (typeof window === "undefined")
    return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;

  try {
    const storedWidth = window.localStorage.getItem(
      FLOATING_LESSON_DRAWER_WIDTH_KEY,
    );
    if (storedWidth === null) return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;

    const savedWidth = Number(storedWidth);
    return Number.isFinite(savedWidth)
      ? Math.min(
          LESSON_DRAWER_MAX_FLOATING_WIDTH,
          Math.max(LESSON_DRAWER_MIN_FLOATING_WIDTH, savedWidth),
        )
      : LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;
  } catch {
    return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;
  }
};

interface LearningWorkspaceProps {
  courseSlug: string | undefined;
  userId?: string;
  lessonId: number;
  deepLinkLessonUuid?: string | null;
  isDiscussionDeepLink?: boolean;
  deepLinkRouteSettled?: boolean;
  noteDeepLinkId?: string | null;
  courseNavigationActionLabel?: string;
  initialLessonView?: "video" | "quiz";
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden?: boolean;
  onSelectLesson: (lessonId: number, view?: "video" | "quiz") => void;
  onOpenCourseOverview: () => void;
  onOpenLogin: () => void;
  onMinimizePlayer?: (request: LearningMiniPlayerRequest) => void;
  onMinimizeGestureChange?: (state: LessonPlayerMinimizeGestureState) => void;
  onMiniPlayerRestoreReady?: () => void;
  persistentPlayerCourseRouteKey?: string;
  persistentPlayerLessonPath?: string;
  persistentPlayerReturnPath?: string;
  persistentPlayerMounted?: boolean;
  registerPersistentPlayer?: RegisterPersistentLearningPlayer;
  quizAssignment?: MyQuizAssignment | null;
  quizAssignments?: readonly MyQuizAssignment[] | null;
  quizAssignmentLoading?: boolean;
}

interface CurriculumResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  collapsedAtStart: boolean;
  collapsed: boolean;
  previewWidth: number;
  /** The width its content is laid out at: the last one at or over the minimum. */
  expandedWidth: number;
  handle: HTMLElement;
}

/**
 * How long the pointer rests in a drag of the course content before React is
 * told the width the drag has reached (see moveCurriculumResize).
 */
const CURRICULUM_RESIZE_STATE_SYNC_MS = 140;

interface CurriculumPointerEvent {
  pointerId: number;
  clientX: number;
}

interface FloatingLessonDrawerResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  originalWidth: number;
  previewWidth: number;
  dismissOnEnd: boolean;
  handle: HTMLElement;
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
  target: "curriculum" | "lesson-drawer";
  /** The touch began on the course content panel itself. */
  startedOnPanel: boolean;
  handle: HTMLDivElement;
}

interface CurriculumScreenSwipeStartEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  timeStamp: number;
  target: EventTarget | null;
  handle: HTMLDivElement;
  splitX?: number;
}

export function LearningWorkspace({
  courseSlug,
  userId,
  lessonId,
  deepLinkLessonUuid = null,
  isDiscussionDeepLink = false,
  deepLinkRouteSettled = true,
  noteDeepLinkId = null,
  courseNavigationActionLabel,
  initialLessonView = "video",
  mobileBottomNavigation,
  mobileBottomNavigationHidden = false,
  onSelectLesson,
  onOpenCourseOverview,
  onOpenLogin,
  onMinimizePlayer,
  onMinimizeGestureChange,
  onMiniPlayerRestoreReady,
  persistentPlayerCourseRouteKey,
  persistentPlayerLessonPath,
  persistentPlayerReturnPath,
  persistentPlayerMounted = false,
  registerPersistentPlayer,
  quizAssignment = null,
  quizAssignments = null,
  quizAssignmentLoading = false,
}: LearningWorkspaceProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const storedAuthUser = useAuthStore((state) => state.user);
  const { data: currentUser, isFetched: isCurrentUserFetched } =
    useCurrentUser();
  const resolvedAuthUser =
    currentUser === undefined ? storedAuthUser : currentUser;
  const isAuthResolutionPending = !isCurrentUserFetched && !storedAuthUser;
  const enrolledCoursesQuery = useEnrolledCourses({
    enabled: isAuthenticated,
  });
  const isApiRoute = Boolean(courseSlug);
  const {
    data: courseOverview,
    isLoading: isCourseOverviewLoading,
    isError: isCourseOverviewError,
    isFetching: isCourseOverviewFetching,
    refetch: refetchCourseOverview,
  } = useCourseOverview(courseSlug, {
    enabled: isApiRoute,
  });
  const isInteractionCapabilitiesLoading =
    isApiRoute && isCourseOverviewLoading && !courseOverview;
  const allowComments = courseOverview?.settings?.allowComments ?? true;
  const allowNotes = courseOverview?.settings?.allowNotes ?? true;
  const allowQa = courseOverview?.settings?.allowQa ?? true;

  const interactionCapabilities: InteractionCapabilities = useMemo(() => {
    return {
      allowComments,
      allowNotes,
      allowQa,
    };
  }, [allowComments, allowNotes, allowQa]);
  const publicPreviewLessonNumbers = useMemo(
    () => getPublicPreviewLessonNumbers(courseOverview),
    [courseOverview],
  );
  const publicPreviewLessonSet = useMemo(
    () => new Set(publicPreviewLessonNumbers),
    [publicPreviewLessonNumbers],
  );
  const isLessonAvailable = useCallback(
    (lessonNumber: number) =>
      canPlayCourseLesson({
        allowGuestLearning: ALLOW_GUEST_LEARNING,
        isAuthenticated,
        lessonNumber,
        publicPreviewLessonNumbers: publicPreviewLessonSet,
      }),
    [isAuthenticated, publicPreviewLessonSet],
  );
  const lessonStorageKey = `veolms-last-lesson-${encodeURIComponent(courseSlug || "default")}`;
  const shortcutPlatform = useShortcutPlatform();
  const [selectedLesson, setSelectedLesson] = useState(lessonId);
  const [deepLinkInitializationPending, setDeepLinkInitializationPending] =
    useState(Boolean(deepLinkLessonUuid));
  const pendingLessonSelectionRef = useRef<number | null>(null);
  const [localLessonProgress, setLocalLessonProgress] = useState<
    Record<number, number>
  >({});
  const [autoPlayOnLessonChange, setAutoPlayOnLessonChange] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(
    DEFAULT_LEARNING_PLAYER_PREFERENCES.autoplay,
  );
  const courseTitle = useMemo(() => {
    if (courseOverview?.course.title) {
      return courseOverview.course.title;
    }
    if (isCourseOverviewError) {
      return courseSlug || "";
    }
    return isApiRoute ? courseSlug || "" : getCourseTitle(courseSlug);
  }, [
    courseOverview?.course.title,
    courseSlug,
    isApiRoute,
    isCourseOverviewError,
  ]);
  const coursePersistenceKey = encodeURIComponent(courseSlug || "default");
  const discussionPersistenceKey = `${coursePersistenceKey}-lesson-${selectedLesson}`;
  const [lessonDrawer, setLessonDrawer] = useState(false);
  const [mobileLandscapeFullscreen, setMobileLandscapeFullscreen] =
    useState(false);
  const [fullscreenLessonPanelOpen, setFullscreenLessonPanelOpen] =
    useState(false);
  const [fullscreenVideoWidthPercent, setFullscreenVideoWidthPercent] =
    useState(FULLSCREEN_VIDEO_WIDTH_DEFAULT_PERCENT);
  const [
    fullscreenVideoWidthPreviewPercent,
    setFullscreenVideoWidthPreviewPercent,
  ] = useState<number | null>(null);
  const [
    fullscreenCurriculumFocusRequest,
    setFullscreenCurriculumFocusRequest,
  ] = useState(0);
  const [lessonDrawerForcedFloating, setLessonDrawerForcedFloating] =
    useState(false);
  const [lessonDrawerSnapPoint, setLessonDrawerSnapPoint] = useState<
    number | string | null
  >(LESSON_DRAWER_FALLBACK_SNAP_POINT);
  const [lessonDrawerCollapsedSnapPoint, setLessonDrawerCollapsedSnapPoint] =
    useState(LESSON_DRAWER_FALLBACK_SNAP_POINT);
  const [lessonDrawerViewportBounds, setLessonDrawerViewportBounds] =
    useState<LessonDrawerViewportBounds | null>(null);
  const [floatingLessonDrawerWidth, setFloatingLessonDrawerWidth] = useState(
    getInitialFloatingLessonDrawerWidth,
  );
  const [floatingLessonDrawerResizing, setFloatingLessonDrawerResizing] =
    useState(false);
  const courseContentDrawerViewport = useSyncExternalStore(
    subscribeToCourseContentDrawerViewport,
    getCourseContentDrawerViewportSnapshot,
    getCourseContentDrawerViewportServerSnapshot,
  );
  const phoneLessonDrawerViewport = useSyncExternalStore(
    subscribeToPhoneLessonDrawerViewport,
    getPhoneLessonDrawerViewportSnapshot,
    getPhoneLessonDrawerViewportServerSnapshot,
  );
  const desktopLearningMinimizeViewport = useSyncExternalStore(
    subscribeToDesktopLearningMinimizeViewport,
    getDesktopLearningMinimizeViewportSnapshot,
    getDesktopLearningMinimizeViewportServerSnapshot,
  );
  const phoneLessonDrawer = mobileBottomNavigation && phoneLessonDrawerViewport;
  const lessonDrawerSnapPoints = useMemo(
    () => [lessonDrawerCollapsedSnapPoint, 1],
    [lessonDrawerCollapsedSnapPoint],
  );
  const [curriculumFocusRequest, setCurriculumFocusRequest] = useState(0);
  const [lessonDrawerFocusRequest, setLessonDrawerFocusRequest] = useState(0);
  const [lessonDrawerTopRequest, setLessonDrawerTopRequest] = useState(0);
  const [lessonDrawerScrollTarget, setLessonDrawerScrollTarget] = useState<
    "current" | "keep" | "top"
  >("current");
  const [curriculumWidth, setCurriculumWidth] = useState(
    () => getInitialLearningShellState().curriculumWidth,
  );
  const [curriculumCollapsed, setCurriculumCollapsed] = useState(
    () => getInitialLearningShellState().curriculumCollapsed,
  );
  const learningShellHydratedRef = useRef(false);
  const [curriculumResizing, setCurriculumResizing] = useState(false);
  const [curriculumResizePreviewWidth, setCurriculumResizePreviewWidth] =
    useState<number | null>(null);

  useLayoutEffect(() => {
    let shellState = {
      curriculumCollapsed,
      curriculumWidth,
    };
    const isInitialShellSync = !learningShellHydratedRef.current;
    if (isInitialShellSync) {
      learningShellHydratedRef.current = true;
      shellState = getInitialLearningShellState();
      if (shellState.curriculumCollapsed !== curriculumCollapsed) {
        setCurriculumCollapsed(shellState.curriculumCollapsed);
      }
      if (shellState.curriculumWidth !== curriculumWidth) {
        setCurriculumWidth(shellState.curriculumWidth);
      }
    }

    const rootWidth = isInitialShellSync
      ? shellState.curriculumCollapsed
        ? CURRICULUM_COLLAPSED_WIDTH
        : shellState.curriculumWidth
      : (curriculumResizePreviewWidth ??
        (curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth));
    applyLearningShellToDocument({
      curriculumCollapsed: shellState.curriculumCollapsed,
      curriculumWidth: shellState.curriculumWidth,
    });
    if (rootWidth !== shellState.curriculumWidth) {
      document.documentElement.style.setProperty(
        "--learning-curriculum-width",
        `${rootWidth}px`,
      );
    }
  }, [curriculumCollapsed, curriculumResizePreviewWidth, curriculumWidth]);

  useLayoutEffect(() => {
    const autoplay = getInitialLearningPlayerPreferences().autoplay;
    setAutoplayEnabled(autoplay);
    publishLearningPlayerBootstrap({ autoplay });
  }, []);

  useEffect(() => {
    if (courseContentDrawerViewport || !learningShellHydratedRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(
        CURRICULUM_COLLAPSED_STORAGE_KEY,
        String(curriculumCollapsed),
      );
    } catch {
      // Course-content toggling remains available without browser storage.
    }
  }, [courseContentDrawerViewport, curriculumCollapsed]);

  const [theaterMode, setTheaterMode] = useState(false);
  const [chaptersPanelHost, setChaptersPanelHost] =
    useState<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const lessonContentRef = useRef<HTMLElement>(null);
  const playerMinimizeActiveRef = useRef(false);
  const updatePlayerMinimizeGesture = useCallback(
    (state: LessonPlayerMinimizeGestureState) => {
      const active = state.phase !== "idle";
      if (playerMinimizeActiveRef.current !== active) {
        playerMinimizeActiveRef.current = active;
        const workspace = workspaceRef.current;
        const main = mainRef.current;
        const playerWrap = playerWrapRef.current;
        const lessonContent = lessonContentRef.current;
        const desktopUnifiedMotion = isDesktopLearningMinimizeViewport();
        if (active) {
          workspace?.style.setProperty("background", "transparent");
          playerWrap?.style.setProperty("background", "transparent");
          playerWrap?.style.setProperty("box-shadow", "none");
          playerWrap?.style.setProperty("z-index", "190");
          if (desktopUnifiedMotion && main) {
            main.inert = true;
            main.style.pointerEvents = "none";
          } else if (lessonContent) {
            lessonContent.inert = true;
            lessonContent.style.pointerEvents = "none";
            lessonContent.style.willChange = "transform, opacity";
          }
        } else {
          workspace?.style.removeProperty("background");
          playerWrap?.style.removeProperty("background");
          playerWrap?.style.removeProperty("box-shadow");
          playerWrap?.style.removeProperty("z-index");
          if (main) {
            main.inert = lessonDrawer ? true : false;
            main.style.removeProperty("pointer-events");
            main.style.removeProperty("will-change");
          }
          if (lessonContent) {
            lessonContent.inert = false;
            lessonContent.style.removeProperty("pointer-events");
            lessonContent.style.removeProperty("will-change");
          }
        }
      }
      onMinimizeGestureChange?.(state);
    },
    [lessonDrawer, onMinimizeGestureChange],
  );
  useEffect(
    () => () => updatePlayerMinimizeGesture(IDLE_PLAYER_MINIMIZE_GESTURE),
    [updatePlayerMinimizeGesture],
  );
  const lessonTriggerRef = useRef<HTMLButtonElement>(null);
  const curriculumScrollportRef = useRef<HTMLElement>(null);
  const fullscreenCurriculumScrollportRef = useRef<HTMLElement>(null);
  const lessonDrawerSurfaceRef = useRef<HTMLDivElement>(null);
  const lessonDrawerScrollportRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lessonDrawerSkipFinalFocusRef = useRef(false);
  const curriculumResizeRef = useRef<CurriculumResize | null>(null);
  const curriculumResizeSyncTimerRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => window.clearTimeout(curriculumResizeSyncTimerRef.current),
    [],
  );
  // While the course content is dragged, the width the pointer has reached is
  // written onto the elements sized from it, ahead of React's state (see
  // moveCurriculumResize). It is put back after every render of a drag, in
  // case the render replaced one of those elements, and taken off by the
  // render that ends the drag: the same commit that gives the document the
  // width the content settles at, so the page never shows a width in between.
  const curriculumDragWidthAppliedRef = useRef(false);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const resize = curriculumResizeRef.current;
    if (resize) {
      curriculumDragWidthAppliedRef.current = true;
      applyCurriculumDragWidth(workspace, resize);
    } else if (curriculumDragWidthAppliedRef.current) {
      curriculumDragWidthAppliedRef.current = false;
      clearCurriculumDragWidth(workspace);
    }
  });
  // Two of those elements belong to the shell and outlive this page.
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    return () => {
      if (workspace) clearCurriculumDragWidth(workspace);
    };
  }, []);
  const floatingLessonDrawerResizeRef =
    useRef<FloatingLessonDrawerResize | null>(null);
  const curriculumResizeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumResizeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeRef = useRef<CurriculumScreenSwipe | null>(null);
  const curriculumScreenSwipeStartRef = useRef<
    ((event: CurriculumScreenSwipeStartEvent) => void) | null
  >(null);

  // True only while this page is announcing a claim of its own. The claim
  // is heard by everything that listens for one, this page included, and
  // the listener below used to cancel the very swipe that had just claimed
  // the pointer: the course content moved once, froze, and stayed in its
  // resizing state for good. Only somebody else's claim cancels the swipe.
  const claimingOwnPointerGestureRef = useRef(false);
  const claimCurriculumPointerGesture = (pointerId: number) => {
    claimingOwnPointerGestureRef.current = true;
    try {
      claimPointerGesture({ owner: "curriculum", pointerId });
    } finally {
      claimingOwnPointerGestureRef.current = false;
    }
  };
  useEffect(
    () =>
      subscribeToPointerGestureClaims(({ owner, pointerId }) => {
        if (owner !== "curriculum") return;
        if (claimingOwnPointerGestureRef.current) return;
        if (curriculumScreenSwipeRef.current?.pointerId === pointerId) {
          curriculumScreenSwipeRef.current = null;
        }
      }),
    [],
  );
  // Lets the screen swipe hand a touch over to the resize rail's own drag
  // (defined further down).
  const beginCurriculumResizeRef = useRef<
    ((pointerId: number, clientX: number, handle: HTMLElement) => void) | null
  >(null);
  const curriculumScreenSwipeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumScreenSwipeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeConsumedUntilRef = useRef(0);
  const isCourseContentDrawerLayout = useCallback(
    () => window.matchMedia(COURSE_CONTENT_DRAWER_QUERY).matches,
    [],
  );

  const adaptedCurriculum = useMemo(() => {
    if (!courseOverview) return null;
    return adaptCourseOverviewToCurriculum(courseOverview);
  }, [courseOverview]);

  const curriculumSections = useMemo(
    () => adaptedCurriculum?.sections ?? [],
    [adaptedCurriculum],
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
  const fallbackEmptyLesson = useMemo<Lesson>(
    () => [selectedLesson || 1, "", "", "todo"],
    [selectedLesson],
  );
  const currentLesson =
    curriculumLessonsById.get(selectedLesson) ||
    firstCurriculumLesson ||
    fallbackEmptyLesson;
  const courseQuizAssignments = useCourseQuizAssignments(
    courseOverview?.course.id,
    { enabled: isAuthenticated },
  );
  const [activeLessonView, setActiveLessonView] = useState<"video" | "quiz">(
    initialLessonView,
  );

  useEffect(() => {
    setActiveLessonView((currentView) =>
      currentView === initialLessonView ? currentView : initialLessonView,
    );
  }, [initialLessonView]);

  const getLessonUuid = useCallback(
    (lessonNumber: number): string | undefined => {
      const les = curriculumLessonsById.get(lessonNumber);
      if (les && les[6]) return les[6];
      return adaptedCurriculum?.lessonsByNumber.get(lessonNumber)?.id;
    },
    [curriculumLessonsById, adaptedCurriculum],
  );

  const hasLessonQuiz = useCallback(
    (lessonNumber: number): boolean => {
      const lesson = curriculumLessonsById.get(lessonNumber);
      if (lesson?.[5] === "quiz") return true;
      const uuid = getLessonUuid(lessonNumber);
      if (!uuid) {
        return lessonNumber === selectedLesson
          ? Boolean(quizAssignment)
          : false;
      }
      return Boolean(
        quizAssignments?.some((a) => a.lessonId === uuid) ||
        courseQuizAssignments.data?.some((a) => a.lessonId === uuid) ||
        (lessonNumber === selectedLesson &&
          quizAssignment &&
          (!quizAssignment.lessonId || quizAssignment.lessonId === uuid)),
      );
    },
    [
      curriculumLessonsById,
      getLessonUuid,
      selectedLesson,
      quizAssignment,
      quizAssignments,
      courseQuizAssignments.data,
    ],
  );

  const curriculumLessonResources = useMemo(() => {
    const resourcesByLesson = new Map<number, readonly LessonResource[]>();
    for (const [lessonNumber, lesson] of adaptedCurriculum?.lessonsByNumber ??
      []) {
      if (lesson.resources?.length) {
        resourcesByLesson.set(lessonNumber, lesson.resources);
      }
    }
    return resourcesByLesson;
  }, [adaptedCurriculum]);
  const curriculumQuizLessonNumbers = useMemo(
    () =>
      new Set(
        [...curriculumLessonsById.keys()].filter((lessonNumber) =>
          hasLessonQuiz(lessonNumber),
        ),
      ),
    [curriculumLessonsById, hasLessonQuiz],
  );

  const currentLessonUuid = getLessonUuid(selectedLesson);
  const currentQuizAssignment = useMemo(() => {
    if (currentLessonUuid && quizAssignments) {
      const found = quizAssignments.find(
        (a) => a.lessonId === currentLessonUuid,
      );
      if (found) return found;
    }
    if (currentLessonUuid && courseQuizAssignments.data) {
      const foundCourse = courseQuizAssignments.data.find(
        (a) => a.lessonId === currentLessonUuid,
      );
      if (foundCourse) {
        // Only what the attempt panel is given; this list carries no
        // attempt state, so the panel starts without an active attempt.
        return {
          id: foundCourse.id,
          courseId: foundCourse.courseId,
          quizTitle: foundCourse.quizTitle,
          maxAttempts: foundCourse.maxAttempts,
          activeAttemptId: null,
          attemptCount: 0,
          bestScore: null,
          latestPassed: null,
        };
      }
    }
    if (
      quizAssignment &&
      (!currentLessonUuid || quizAssignment.lessonId === currentLessonUuid)
    ) {
      return quizAssignment;
    }
    return null;
  }, [
    currentLessonUuid,
    quizAssignments,
    courseQuizAssignments.data,
    quizAssignment,
  ]);

  const isDedicatedQuizLesson = currentLesson[5] === "quiz";
  const hasQuizContent =
    Boolean(currentQuizAssignment) ||
    (isDedicatedQuizLesson && !currentLessonUuid);
  const showingQuiz = activeLessonView === "quiz";
  const isQuizLesson = showingQuiz;

  useLayoutEffect(() => {
    const main = playerWrapRef.current?.closest<HTMLElement>(".courses-main");
    if (!main) return;
    if (showingQuiz) {
      main.setAttribute("data-learning-quiz-active", "true");
      const video = document.querySelector<HTMLVideoElement>("video");
      if (video && !video.paused) {
        video.pause();
      }
    } else {
      main.removeAttribute("data-learning-quiz-active");
      if (autoPlayOnLessonChange) {
        const video = document.querySelector<HTMLVideoElement>("video");
        safeResumeVideo(video);
      }
    }
    return () => {
      main.removeAttribute("data-learning-quiz-active");
    };
  }, [autoPlayOnLessonChange, showingQuiz]);

  useEffect(() => {
    if (!showingQuiz) return;

    const pauseAllMedia = () => {
      if (typeof document === "undefined") return;
      const mediaElements =
        document.querySelectorAll<HTMLMediaElement>("video, audio");
      for (const el of mediaElements) {
        if (!el.paused && typeof el.pause === "function") {
          try {
            el.pause();
          } catch {
            // ignore error
          }
        }
      }
    };

    pauseAllMedia();

    const handlePlayCapture = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLMediaElement &&
        typeof target.pause === "function"
      ) {
        try {
          target.pause();
        } catch {
          // ignore error
        }
      }
    };

    window.addEventListener("play", handlePlayCapture, true);
    window.addEventListener("playing", handlePlayCapture, true);

    return () => {
      window.removeEventListener("play", handlePlayCapture, true);
      window.removeEventListener("playing", handlePlayCapture, true);
    };
  }, [showingQuiz]);
  const protectedPlayback = Boolean(courseSlug);
  const playbackRequestKey = `${courseSlug ?? ""}\u0000${selectedLesson}\u0000${isAuthenticated ? "authenticated" : "guest"}`;
  const [playbackBootstrap, setPlaybackBootstrap] =
    useState<VideoPlaybackBootstrap | null>(() => {
      if (!courseSlug) return null;
      return getCachedVideoPlaybackBootstrap({
        courseSlug,
        lessonNumber: selectedLesson,
      });
    });
  const [playbackBootstrapError, setPlaybackBootstrapError] =
    useState<VideoPlaybackBootstrapError | null>(null);
  const [playbackBootstrapAttempt, setPlaybackBootstrapAttempt] = useState(0);
  const playbackRequestKeyRef = useRef<string | null>(null);
  const refreshPlaybackToken = useCallback(async () => {
    if (!courseSlug) {
      throw new Error("A course is required to refresh playback access.");
    }
    return refreshVideoPlaybackToken({
      courseSlug,
      lessonNumber: selectedLesson,
    });
  }, [courseSlug, selectedLesson]);

  const retryPlaybackBootstrap = useCallback(() => {
    playbackRequestKeyRef.current = null;
    setPlaybackBootstrapError(null);
    setPlaybackBootstrap(null);
    setPlaybackBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  // There is no lesson to show: the course did not load (a wrong address,
  // or a course that has been unpublished), or it has no lessons. The page
  // used to carry on as if a lesson were there, with an empty title, a video
  // that could only be retried in vain and discussions that never finished
  // checking access. A discussion link reports a course that fails to load
  // in its own way.
  const courseUnavailable: "not-found" | "no-lessons" | null =
    !isApiRoute || isDiscussionDeepLink
      ? null
      : isCourseOverviewError && !isCourseOverviewFetching && !courseOverview
        ? "not-found"
        : courseOverview && firstCurriculumLessonId === undefined
          ? "no-lessons"
          : null;
  const retryCourseOverview = useCallback(() => {
    // The video was asked for while the course was failing, so it is asked
    // for again along with the course.
    retryPlaybackBootstrap();
    void refetchCourseOverview();
  }, [refetchCourseOverview, retryPlaybackBootstrap]);

  useEffect(() => {
    setPlaybackBootstrapError(null);
    if (!courseSlug) {
      setPlaybackBootstrap(null);
      setPlaybackBootstrapError(null);
      playbackRequestKeyRef.current = null;
      return;
    }

    if (playbackRequestKeyRef.current === playbackRequestKey) return;
    playbackRequestKeyRef.current = playbackRequestKey;

    const cached = getCachedVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber: selectedLesson,
    });
    if (cached) {
      setPlaybackBootstrap(cached);
      setPlaybackBootstrapError(null);
      return;
    }

    setPlaybackBootstrap(null);
    setPlaybackBootstrapError(null);
    let active = true;
    let settled = false;
    void getVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber: selectedLesson,
    })
      .then((bootstrap) => {
        if (active) {
          settled = true;
          setPlaybackBootstrap(bootstrap);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        settled = true;
        setPlaybackBootstrap(null);
        setPlaybackBootstrapError(
          error instanceof VideoPlaybackBootstrapError
            ? error
            : new VideoPlaybackBootstrapError(
                0,
                "PLAYBACK_BOOTSTRAP_FAILED",
                "Unable to prepare this video.",
              ),
        );
      });

    return () => {
      active = false;
      // This effect also re-runs for the same lesson, for example when the
      // sign-in state resolves while the request is still out. The answer to
      // this request is now ignored, so forget the key: otherwise the re-run
      // sees the lesson as already requested and the player waits forever.
      if (!settled && playbackRequestKeyRef.current === playbackRequestKey) {
        playbackRequestKeyRef.current = null;
      }
    };
  }, [
    courseSlug,
    isAuthenticated,
    playbackRequestKey,
    playbackBootstrapAttempt,
    selectedLesson,
  ]);
  const playbackAccessError = useMemo<
    LessonVideoPlayerProps["playbackAccessError"]
  >(() => {
    if (courseUnavailable === "no-lessons") {
      return {
        kind: "retry",
        title: "No lessons yet",
        message: "This course doesn't have any lessons to watch yet.",
        actionLabel: "Try again",
        link: { label: "Browse courses", href: "/courses" },
      };
    }
    const courseNotFound: LessonVideoPlayerProps["playbackAccessError"] =
      courseUnavailable === "not-found"
        ? {
            kind: "retry",
            title: "Course not found",
            message:
              "It may have been unpublished, or the address may be wrong.",
            actionLabel: "Try again",
            onAction: retryCourseOverview,
            link: { label: "Browse courses", href: "/courses" },
          }
        : null;

    if (!playbackBootstrapError) return courseNotFound;

    // Asked to log in, a visitor is still asked to: a course that is not
    // public may load once they have.
    if (
      playbackBootstrapError.status === 401 ||
      playbackBootstrapError.code === "UNAUTHORIZED" ||
      playbackBootstrapError.code === "MFA_REQUIRED"
    ) {
      return {
        kind: "login",
        message: "Log in to access the lesson.",
        actionLabel: "Log in",
        onAction: onOpenLogin,
      };
    }

    if (courseNotFound) return courseNotFound;

    if (playbackBootstrapError.status === 403) {
      return {
        kind: "access",
        message: "Get access to this course to watch this lesson.",
        actionLabel: "Get access",
        onAction: onOpenCourseOverview,
      };
    }

    // A video that is still being processed, and a lesson with no video,
    // used to get the same "couldn't prepare" message as a real failure. The
    // first is worth trying again later; the second can never play, so it
    // offers no retry.
    if (playbackBootstrapError.code === "MEDIA_NOT_READY") {
      return {
        kind: "retry",
        title: "Video not ready yet",
        message:
          "This video is still being prepared. Please check back in a few minutes.",
        actionLabel: "Try again",
        onAction: retryPlaybackBootstrap,
      };
    }

    if (playbackBootstrapError.code === "MEDIA_NOT_FOUND") {
      return {
        kind: "retry",
        title: "No video",
        message: "This lesson has no video.",
        actionLabel: "Try again",
      };
    }

    return {
      kind: "retry",
      message: "We couldn't prepare this video.",
      actionLabel: "Retry",
      onAction: retryPlaybackBootstrap,
    };
  }, [
    courseUnavailable,
    onOpenCourseOverview,
    onOpenLogin,
    playbackBootstrapError,
    retryCourseOverview,
    retryPlaybackBootstrap,
  ]);
  const playbackBootstrapPending = Boolean(
    protectedPlayback && !playbackBootstrap && !playbackBootstrapError,
  );
  const lessonContentAccess = useMemo<LessonContentAccessState>(() => {
    if (!courseOverview || !adaptedCurriculum) return "pending";

    const lesson = adaptedCurriculum.lessonsByNumber.get(selectedLesson);
    if (!lesson) return "pending";

    // Anyone may read a public lesson's discussions, so they do not wait to
    // learn who the visitor is: they load alongside the rest of the lesson.
    const isPublicLesson =
      courseOverview.course.status === "published" &&
      lesson.isPublished &&
      (lesson.isPreview || courseOverview.pricing?.pricingType === "free");
    if (isPublicLesson) return "granted";
    if (isAuthResolutionPending) return "pending";
    if (!isAuthenticated) return "denied";

    const isCourseOwner =
      resolvedAuthUser?.id === courseOverview.course.creatorId;
    const isAdmin = resolvedAuthUser?.roles?.some(
      (role) => role.trim().toLowerCase() === "admin",
    );
    if (isCourseOwner || isAdmin) return "granted";
    if (!enrolledCoursesQuery.isFetched) return "pending";

    return enrolledCoursesQuery.data?.courses.some(
      (course) => course.courseId === courseOverview.course.id,
    )
      ? "granted"
      : "denied";
  }, [
    adaptedCurriculum,
    courseOverview,
    enrolledCoursesQuery.data?.courses,
    enrolledCoursesQuery.isFetched,
    isAuthResolutionPending,
    isAuthenticated,
    resolvedAuthUser?.id,
    resolvedAuthUser?.roles,
    selectedLesson,
  ]);
  /**
   * The lessons this visitor cannot play, by the same rules the server
   * applies to video: a free preview is open to everyone; a free course is
   * open to anyone signed in, and its first lesson to everyone; anything
   * else needs access to the course. Nothing is marked while the session or
   * the visitor's courses are still loading, so locks never flash on and off.
   */
  const lockedLessonNumbers = useMemo<ReadonlySet<number>>(() => {
    const locked = new Set<number>();
    if (!courseOverview || !adaptedCurriculum || isAuthResolutionPending) {
      return locked;
    }
    const isCourseOwner =
      resolvedAuthUser?.id === courseOverview.course.creatorId;
    const isAdmin = resolvedAuthUser?.roles?.some(
      (role) => role.trim().toLowerCase() === "admin",
    );
    if (isCourseOwner || isAdmin) return locked;

    const isFreeCourse = courseOverview.pricing?.pricingType === "free";
    if (isFreeCourse && isAuthenticated) return locked;
    if (!isFreeCourse && isAuthenticated) {
      if (!enrolledCoursesQuery.isFetched) return locked;
      const hasCourse = enrolledCoursesQuery.data?.courses.some(
        (course) => course.courseId === courseOverview.course.id,
      );
      if (hasCourse) return locked;
    }

    const firstLessonNumber = Math.min(
      ...adaptedCurriculum.lessonsByNumber.keys(),
    );
    for (const [number, lesson] of adaptedCurriculum.lessonsByNumber) {
      if (lesson.isPreview) continue;
      if (isFreeCourse && number === firstLessonNumber) continue;
      locked.add(number);
    }
    return locked;
  }, [
    adaptedCurriculum,
    courseOverview,
    enrolledCoursesQuery.data?.courses,
    enrolledCoursesQuery.isFetched,
    isAuthResolutionPending,
    isAuthenticated,
    resolvedAuthUser?.id,
    resolvedAuthUser?.roles,
  ]);
  const lessonContentAccessReason =
    lessonContentAccess === "denied"
      ? isAuthenticated
        ? "access"
        : "login"
      : null;
  const lessonParticipationState = useMemo<LessonParticipationState>(() => {
    if (isAuthResolutionPending || !courseOverview || !adaptedCurriculum) {
      return "pending";
    }

    if (!isAuthenticated) return "denied";

    const isCourseOwner =
      resolvedAuthUser?.id === courseOverview.course.creatorId;
    const isAdmin = resolvedAuthUser?.roles?.some(
      (role) => role.trim().toLowerCase() === "admin",
    );
    if (isCourseOwner || isAdmin) return "granted";
    if (!enrolledCoursesQuery.isFetched) return "pending";

    return enrolledCoursesQuery.data?.courses.some(
      (course) => course.courseId === courseOverview.course.id,
    )
      ? "granted"
      : "denied";
  }, [
    adaptedCurriculum,
    courseOverview,
    enrolledCoursesQuery.data?.courses,
    enrolledCoursesQuery.isFetched,
    isAuthResolutionPending,
    isAuthenticated,
    resolvedAuthUser?.id,
    resolvedAuthUser?.roles,
  ]);
  const canParticipateInLessonDiscussion =
    lessonContentAccess === "granted" && lessonParticipationState === "granted";
  const lessonSequence = useMemo(
    () =>
      curriculumSections.flatMap(({ lessons }) => lessons.map(([id]) => id)),
    [curriculumSections],
  );
  const lessonIdsByNumber = useMemo<ReadonlyMap<number, string> | undefined>(
    () =>
      adaptedCurriculum
        ? new Map(
            [...adaptedCurriculum.lessonsByNumber.entries()].map(
              ([lessonNumber, lesson]) => [lessonNumber, lesson.id] as const,
            ),
          )
        : undefined,
    [adaptedCurriculum],
  );
  const { lessonProgress: persistedLessonProgress, recordProgress } =
    useLearningProgress({
      courseKey: courseOverview?.course.slug,
      userId,
      lessonIdsByNumber,
      enabled: Boolean(courseOverview?.course.slug),
    });
  // Handed to the persistent player so progress is still recorded while it
  // plays as the mini player, after this page has unmounted.
  const progressCourseKey = courseOverview?.course.slug;
  const detachedProgressTarget = useMemo(
    () =>
      userId && progressCourseKey
        ? { userId, courseKey: progressCourseKey, lessonIdsByNumber }
        : undefined,
    [lessonIdsByNumber, progressCourseKey, userId],
  );
  const lessonProgress = useMemo(() => {
    if (Object.keys(localLessonProgress).length === 0) {
      return persistedLessonProgress;
    }
    const merged = { ...persistedLessonProgress };
    for (const [lessonNumber, progress] of Object.entries(
      localLessonProgress,
    )) {
      const number = Number(lessonNumber);
      merged[number] = Math.max(merged[number] ?? 0, progress);
    }
    return merged;
  }, [localLessonProgress, persistedLessonProgress]);
  // Every lesson is finished, by the rule that gives a lesson its check mark
  // in the list. The end screen says the course is complete only then.
  const courseComplete = useMemo(
    () =>
      lessonSequence.every(
        (lessonNumber) =>
          curriculumLessonsById.get(lessonNumber)?.[3] === "done" ||
          (lessonProgress[lessonNumber] ?? 0) >=
            LESSON_PROGRESS_COMPLETE_THRESHOLD,
      ),
    [curriculumLessonsById, lessonProgress, lessonSequence],
  );
  const currentLessonIndex = lessonSequence.indexOf(selectedLesson);
  const previousLessonId =
    currentLessonIndex > 0 ? lessonSequence[currentLessonIndex - 1] : undefined;
  const nextLessonId =
    currentLessonIndex >= 0 && currentLessonIndex < lessonSequence.length - 1
      ? lessonSequence[currentLessonIndex + 1]
      : undefined;
  const courseThumbnail = useMemo(() => {
    if (courseOverview) {
      return courseOverview.course.thumbnailUrl || undefined;
    }
    if (isCourseOverviewError) {
      return undefined;
    }
    return isApiRoute ? undefined : getCourseThumbnail(courseSlug);
  }, [courseOverview, courseSlug, isApiRoute, isCourseOverviewError]);
  const courseThumbnailSrcSet =
    courseOverview?.course.thumbnailSrcSet
      ?.map(({ url, width }) => `${url} ${width}w`)
      .join(", ") ||
    (!isApiRoute && !isCourseOverviewError
      ? getCourseThumbnailSrcSet(courseSlug)
      : undefined);
  const nextLessonInfo = useMemo<NextLessonInfo | undefined>(() => {
    if (nextLessonId === undefined) return undefined;
    const lesson = curriculumLessonsById.get(nextLessonId);
    if (!lesson) return undefined;
    const section = curriculumSections.find(({ lessons }) =>
      lessons.some(([id]) => id === nextLessonId),
    );
    const nextLessonMediaId =
      adaptedCurriculum?.lessonsByNumber.get(nextLessonId)?.contentMediaId;
    const nextIndex = lessonSequence.indexOf(nextLessonId);
    return {
      id: nextLessonId,
      title: lesson[1],
      duration: lesson[2],
      sectionTitle: section?.title,
      thumbnailSrc: nextLessonMediaId
        ? mediaService.getVideoThumbnailUrl(nextLessonMediaId)
        : courseThumbnail,
      lectureNumber: nextIndex >= 0 ? nextIndex + 1 : undefined,
      totalLessons: lessonSequence.length,
    };
  }, [
    adaptedCurriculum,
    courseThumbnail,
    curriculumLessonsById,
    curriculumSections,
    lessonSequence,
    nextLessonId,
  ]);

  // The video is not kept in view for a quiz (there is none) or in theater
  // mode (it already fills the page).
  const stickyPlayer = !showingQuiz && !theaterMode;
  // The viewer can drag the video area shorter to see more of the page.
  const [playerHeight, setPlayerHeight] = useLessonPlayerHeight();
  const appliedPlayerHeight = theaterMode ? null : playerHeight;
  const shortPlayer =
    appliedPlayerHeight !== null &&
    appliedPlayerHeight <= LESSON_PLAYER_SHORT_HEIGHT;
  const seekTimeOnly =
    appliedPlayerHeight !== null &&
    appliedPlayerHeight <= LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT;
  // Touch: a shortened or hidden video is pulled back out from the page
  // under it.
  useLessonHiddenVideoPullDown(
    stickyPlayer ? appliedPlayerHeight : null,
    setPlayerHeight,
  );
  // Touch: swiping the lesson title up or down resizes the video too.
  const { onHeaderPointerMove, onHeaderPointerLeave, ...titleSwipeHandlers } =
    useLessonTitleHeightSwipe(playerHeight, setPlayerHeight);
  // Where the page's elastic scroller sits. With the video showing, it goes
  // a little below the middle of the space left under the video. With the
  // video put away, it sits where the course content's own scroller does.
  //
  // The video's height changes on every frame of a resize (of the video, the
  // course content or the sidebar). A variable set on the page is inherited
  // by everything in it, so setting it there restyles the whole page; done
  // each frame, that halved the frame rate of those resizes. So while the
  // height is changing the scroller alone is told, and the page hears once
  // it has settled, for a scroller that is only mounted later.
  useEffect(() => {
    const playerWrap = playerWrapRef.current;
    const main = playerWrap?.closest<HTMLElement>(".courses-main");
    if (!playerWrap || !main) return undefined;
    const property = "--learning-elastic-scroller-clearance";
    const findScroller = () =>
      main.querySelector<HTMLElement>(":scope > .elastic-scroller");
    let settleTimer: number | undefined;
    let clearance = "";
    const tellPage = () => {
      window.clearTimeout(settleTimer);
      if (main.style.getPropertyValue(property) !== clearance) {
        main.style.setProperty(property, clearance);
      }
    };
    const place = () => {
      const videoHeight = playerWrap.getBoundingClientRect().height;
      clearance = `${Math.round(
        videoHeight <= 0
          ? 268
          : Math.max(96, (main.clientHeight - videoHeight) * 0.45),
      )}px`;
      findScroller()?.style.setProperty(property, clearance);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(tellPage, 160);
    };
    const sizes = new ResizeObserver(place);
    sizes.observe(playerWrap);
    sizes.observe(main);
    place();
    tellPage();
    return () => {
      sizes.disconnect();
      window.clearTimeout(settleTimer);
      findScroller()?.style.removeProperty(property);
      main.style.removeProperty(property);
    };
  }, []);

  // Alt+V: a video at full height is put away at the top; one that is
  // shortened or put away goes back to full height (like double-clicking
  // the resize grip).
  useEffect(() => {
    if (!stickyPlayer) return undefined;
    const handleToggleVideoShortcut = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyV" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }
      event.preventDefault();
      setPlayerHeight(playerHeight === null ? 0 : null);
    };
    window.addEventListener("keydown", handleToggleVideoShortcut);
    return () =>
      window.removeEventListener("keydown", handleToggleVideoShortcut);
  }, [playerHeight, setPlayerHeight, stickyPlayer]);
  // Putting the video away at the top also stops it: nothing would show
  // that it is still running. It plays again from the keyboard shortcut,
  // or once it is dragged back into view and played there.
  useEffect(() => {
    if (appliedPlayerHeight !== 0) return;
    const video = document.querySelector<HTMLVideoElement>(
      ".learning-persistent-player--full video",
    );
    if (video && !video.paused) video.pause();
  }, [appliedPlayerHeight]);
  const selectedLessonRecord = useMemo(() => {
    if (!adaptedCurriculum) return null;
    return adaptedCurriculum.lessonsByNumber.get(selectedLesson) ?? null;
  }, [adaptedCurriculum, selectedLesson]);
  const selectedLessonDescription = selectedLessonRecord?.description ?? null;
  const courseId = courseOverview?.course.id;
  const backendLessonId = selectedLessonRecord?.id;
  const isLearningDeepLinkReady =
    !isDiscussionDeepLink ||
    Boolean(
      deepLinkRouteSettled &&
      !deepLinkInitializationPending &&
      courseId &&
      backendLessonId &&
      selectedLesson === lessonId,
    );
  const isLearningDeepLinkError =
    isDiscussionDeepLink &&
    isCourseOverviewError &&
    !isCourseOverviewFetching &&
    !courseOverview;
  const isLearningBootstrapLoading =
    isInteractionCapabilitiesLoading ||
    (!isLearningDeepLinkReady && !isLearningDeepLinkError);
  useEffect(() => {
    if (deepLinkLessonUuid) {
      setDeepLinkInitializationPending(true);
    }
  }, [deepLinkLessonUuid]);

  useEffect(() => {
    if (
      !deepLinkInitializationPending ||
      !deepLinkRouteSettled ||
      !courseId ||
      !backendLessonId ||
      selectedLesson !== lessonId
    ) {
      return;
    }
    setDeepLinkInitializationPending(false);
  }, [
    backendLessonId,
    courseId,
    deepLinkRouteSettled,
    lessonId,
    selectedLesson,
    deepLinkInitializationPending,
  ]);
  const curriculumShortcutLabel = shortcutPlatform === "mac" ? "⌥+C" : "Alt+C";

  const getLessonDrawerCollapsedSnapPoint = useCallback(() => {
    return getPhoneLessonDrawerCollapsedSnapPoint(
      window.innerHeight,
      playerWrapRef.current?.getBoundingClientRect().bottom,
      LESSON_DRAWER_FALLBACK_SNAP_POINT,
    );
  }, []);

  const getLessonDrawerViewportBounds = useCallback(
    (preferredWidth: number) => {
      if (phoneLessonDrawer) return null;

      const playerBounds = playerWrapRef.current?.getBoundingClientRect();
      if (
        !playerBounds ||
        !Number.isFinite(playerBounds.left) ||
        !Number.isFinite(playerBounds.width) ||
        playerBounds.width <= 0
      ) {
        return null;
      }

      const mainSurface =
        playerWrapRef.current?.closest<HTMLElement>(".courses-main");
      const frameSurface =
        playerWrapRef.current?.closest<HTMLElement>(".courses-main-frame") ??
        mainSurface;
      const mainSurfaceBounds = mainSurface?.getBoundingClientRect();
      const horizontalSurfaceBounds =
        mainSurfaceBounds && mainSurfaceBounds.width > 0
          ? mainSurfaceBounds
          : playerBounds;
      const sideBounds = getSideLessonDrawerBounds(
        horizontalSurfaceBounds,
        window.innerWidth,
        preferredWidth,
      );
      if (!sideBounds) return null;

      const verticalSurfaceBounds = mainSurfaceBounds ?? playerBounds;
      const readVisibleRadius = (element: HTMLElement | null | undefined) => {
        if (!element) return null;
        const radius = window.getComputedStyle(element).borderTopRightRadius;
        const pixels = Number.parseFloat(radius);
        return Number.isFinite(pixels) && pixels > 0 ? radius : null;
      };

      return {
        ...sideBounds,
        top: Math.max(0, verticalSurfaceBounds.top),
        bottom: Math.max(0, window.innerHeight - verticalSurfaceBounds.bottom),
        borderRadius:
          readVisibleRadius(frameSurface) ??
          readVisibleRadius(mainSurface) ??
          "18px",
      };
    },
    [phoneLessonDrawer],
  );

  const resumeLessonVideoPlayback = useCallback(() => {
    setActiveLessonView("video");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("view")) {
        url.searchParams.delete("view");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }
    setAutoPlayOnLessonChange(true);
    requestAnimationFrame(() => {
      const video = document.querySelector<HTMLVideoElement>("video");
      safeResumeVideo(video);
    });
  }, []);

  const selectLesson = useCallback(
    (lessonNumber: number, view?: "video" | "quiz") => {
      const targetLesson = curriculumLessonsById.get(lessonNumber);
      const isTargetDedicatedQuiz = targetLesson?.[5] === "quiz";
      const targetHasQuiz = hasLessonQuiz(lessonNumber);

      if (
        view === "quiz" ||
        (view === undefined && isTargetDedicatedQuiz && targetHasQuiz)
      ) {
        setActiveLessonView("quiz");
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("view", "quiz");
          window.history.replaceState(
            null,
            "",
            `${url.pathname}${url.search}${url.hash}`,
          );
        }
      } else {
        resumeLessonVideoPlayback();
      }
      if (lessonNumber === selectedLesson) return;
      pendingLessonSelectionRef.current = lessonNumber;
      setSelectedLesson(lessonNumber);
      if (view !== undefined) {
        onSelectLesson(lessonNumber, view);
      } else {
        onSelectLesson(lessonNumber);
      }
    },
    [
      curriculumLessonsById,
      hasLessonQuiz,
      onSelectLesson,
      resumeLessonVideoPlayback,
      selectedLesson,
    ],
  );

  const handleOpenLessonQuiz = useCallback(
    (lessonNumber: number) => {
      setActiveLessonView("quiz");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "quiz");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      if (lessonNumber !== selectedLesson) {
        selectLesson(lessonNumber, "quiz");
      }
      if (phoneLessonDrawer && lessonDrawer) {
        setLessonDrawer(false);
      }
    },
    [lessonDrawer, phoneLessonDrawer, selectLesson, selectedLesson],
  );

  const updateAutoplayEnabled = useCallback((enabled: boolean) => {
    setAutoplayEnabled(enabled);
    writeAutoplayPreference(enabled);
    publishLearningPlayerBootstrap({ autoplay: enabled });
  }, []);

  const goToPreviousLesson = useCallback(() => {
    if (previousLessonId !== undefined) selectLesson(previousLessonId);
  }, [previousLessonId, selectLesson]);

  const goToNextLesson = useCallback(() => {
    if (nextLessonId !== undefined) selectLesson(nextLessonId);
  }, [nextLessonId, selectLesson]);

  const updateSelectedLessonProgress = useCallback(
    (progress: number) => {
      const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
      const nextProgress =
        roundedProgress >= LESSON_PROGRESS_COMPLETE_THRESHOLD
          ? 100
          : roundedProgress;
      setLocalLessonProgress((current) => {
        if (current[selectedLesson] === nextProgress) return current;
        const updated = { ...current, [selectedLesson]: nextProgress };
        try {
          // Merge with any previously stored map so a single watched lesson
          // cannot wipe catalogue % derived from this legacy key.
          const storageKey = `veolms-learning-${coursePersistenceKey}-progress`;
          let merged: Record<string, number> = { ...updated };
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const existing = JSON.parse(raw) as Record<string, unknown>;
              if (existing && typeof existing === "object") {
                merged = {};
                for (const [key, value] of Object.entries(existing)) {
                  if (typeof value === "number" && Number.isFinite(value)) {
                    merged[key] = value;
                  }
                }
                for (const [key, value] of Object.entries(updated)) {
                  merged[key] = Math.max(merged[key] ?? 0, value);
                }
              }
            }
          } catch {
            merged = { ...updated };
          }
          localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
          // Ignore storage write errors
        }
        return updated;
      });
      recordProgress(selectedLesson, nextProgress);
    },
    [coursePersistenceKey, recordProgress, selectedLesson],
  );

  const handleLessonEnded = useCallback(() => {
    updateSelectedLessonProgress(100);
  }, [updateSelectedLessonProgress]);

  useEffect(() => {
    const pendingLessonSelection = pendingLessonSelectionRef.current;
    if (pendingLessonSelection !== null) {
      if (lessonId !== pendingLessonSelection) return;
      pendingLessonSelectionRef.current = null;
    }

    const requestedLessonId = lessonId;
    const nextLessonId = curriculumLessonsById.has(requestedLessonId)
      ? requestedLessonId
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

  const toggleTheaterMode = useCallback(() => {
    setLessonDrawer(false);
    setLessonDrawerForcedFloating(false);
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
  }, [theaterMode]);

  const showLessonDrawer = useCallback(
    (scrollTarget: "current" | "keep" | "top") => {
      setFullscreenLessonPanelOpen(false);
      setLessonDrawerForcedFloating(false);
      if (!isCourseContentDrawerLayout()) {
        setCurriculumCollapsed(false);
        if (scrollTarget === "current") {
          setCurriculumFocusRequest((request) => request + 1);
        }
        return;
      }

      setLessonDrawerScrollTarget(scrollTarget);
      if (scrollTarget === "current") {
        setLessonDrawerFocusRequest((request) => request + 1);
      } else if (scrollTarget === "top") {
        setLessonDrawerTopRequest((request) => request + 1);
      }
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      if (phoneLessonDrawer) {
        const collapsedSnapPoint = getLessonDrawerCollapsedSnapPoint();
        setLessonDrawerCollapsedSnapPoint(collapsedSnapPoint);
        setLessonDrawerSnapPoint(collapsedSnapPoint);
      }
      setLessonDrawerViewportBounds(
        getLessonDrawerViewportBounds(floatingLessonDrawerWidth),
      );
      setLessonDrawer(true);
    },
    [
      getLessonDrawerCollapsedSnapPoint,
      getLessonDrawerViewportBounds,
      floatingLessonDrawerWidth,
      isCourseContentDrawerLayout,
      phoneLessonDrawer,
    ],
  );

  const openLessonDrawer = useCallback(
    () => showLessonDrawer("current"),
    [showLessonDrawer],
  );

  // The lesson title opens the course content without moving its list.
  // Clicked again while the content is already open, it brings the lecture
  // that is playing into view.
  const openLessonDrawerInPlace = useCallback(() => {
    const alreadyOpen = isCourseContentDrawerLayout()
      ? lessonDrawer
      : !curriculumCollapsed;
    showLessonDrawer(alreadyOpen ? "current" : "keep");
  }, [
    curriculumCollapsed,
    isCourseContentDrawerLayout,
    lessonDrawer,
    showLessonDrawer,
  ]);

  const openLessonDrawerAtTop = useCallback(
    () => showLessonDrawer("top"),
    [showLessonDrawer],
  );

  const closeLessonDrawer = useCallback(() => {
    setLessonDrawer(false);
    setLessonDrawerForcedFloating(false);
  }, []);

  const toggleLessonDrawerFromPlayer = useCallback(
    (presentation: "drawer" | "side") => {
      if (presentation === "side") {
        setLessonDrawer(false);
        setLessonDrawerForcedFloating(false);

        if (mobileLandscapeFullscreen) {
          if (!fullscreenLessonPanelOpen) {
            setFullscreenCurriculumFocusRequest((request) => request + 1);
          }
          setFullscreenLessonPanelOpen(!fullscreenLessonPanelOpen);
          return;
        }

        if (isCourseContentDrawerLayout()) {
          if (lessonDrawer) closeLessonDrawer();
          else openLessonDrawer();
          return;
        }

        setFullscreenLessonPanelOpen(false);
        setCurriculumCollapsed((collapsed) => !collapsed);
        return;
      }

      setFullscreenLessonPanelOpen(false);
      if (lessonDrawer) closeLessonDrawer();
      else openLessonDrawerAtTop();
    },
    [
      closeLessonDrawer,
      fullscreenLessonPanelOpen,
      isCourseContentDrawerLayout,
      lessonDrawer,
      mobileLandscapeFullscreen,
      openLessonDrawer,
      openLessonDrawerAtTop,
    ],
  );

  const handleMobileLandscapeFullscreenChange = useCallback(
    (active: boolean) => {
      setMobileLandscapeFullscreen(active);
      if (!active) setFullscreenLessonPanelOpen(false);
    },
    [],
  );

  const closeFullscreenLessonPanel = useCallback(() => {
    setFullscreenVideoWidthPreviewPercent(null);
    setFullscreenLessonPanelOpen(false);
  }, []);

  const openFloatingLessonDrawer = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setCurriculumCollapsed(true);
    setLessonDrawerScrollTarget("current");
    setLessonDrawerFocusRequest((request) => request + 1);
    setLessonDrawerForcedFloating(true);
    if (phoneLessonDrawer) {
      const collapsedSnapPoint = getLessonDrawerCollapsedSnapPoint();
      setLessonDrawerCollapsedSnapPoint(collapsedSnapPoint);
      setLessonDrawerSnapPoint(collapsedSnapPoint);
    }
    setLessonDrawerViewportBounds(
      getLessonDrawerViewportBounds(floatingLessonDrawerWidth),
    );
    setLessonDrawer(true);
  }, [
    getLessonDrawerCollapsedSnapPoint,
    getLessonDrawerViewportBounds,
    floatingLessonDrawerWidth,
    phoneLessonDrawer,
  ]);

  const lessonDrawerHeroControlProps = useLessonDrawerHeroControl({
    open: lessonDrawer,
    expanded: lessonDrawerSnapPoint === 1,
    onExpand: () => setLessonDrawerSnapPoint(1),
    onCollapse: () => setLessonDrawerSnapPoint(lessonDrawerCollapsedSnapPoint),
    onClose: closeLessonDrawer,
  });

  useEffect(() => {
    if (!lessonDrawer) return undefined;
    const compactWorkspace = window.matchMedia(COURSE_CONTENT_DRAWER_QUERY);
    const appShell =
      playerWrapRef.current?.closest(".courses-app") ??
      document.querySelector(".courses-app");
    let resizeTimer: number | null = null;

    const syncDrawerGeometry = () => {
      if (!isCourseContentDrawerLayout() && !lessonDrawerForcedFloating) {
        setLessonDrawerViewportBounds(null);
        return;
      }

      setLessonDrawerViewportBounds(
        getLessonDrawerViewportBounds(floatingLessonDrawerWidth),
      );
      if (!phoneLessonDrawer) return;
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
      if (!isCourseContentDrawerLayout() && !lessonDrawerForcedFloating) {
        lessonDrawerSkipFinalFocusRef.current = true;
        setLessonDrawer(false);
        setLessonDrawerForcedFloating(false);
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
    floatingLessonDrawerWidth,
    isCourseContentDrawerLayout,
    lessonDrawer,
    lessonDrawerForcedFloating,
    phoneLessonDrawer,
  ]);

  const startCurriculumScreenSwipe = (
    event: CurriculumScreenSwipeStartEvent,
  ) => {
    const drawerLayout = isCourseContentDrawerLayout();
    const revealsTabletDrawer = drawerLayout && !phoneLessonDrawer;
    const target = revealsTabletDrawer ? "lesson-drawer" : "curriculum";
    if (
      (drawerLayout && !revealsTabletDrawer) ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      event.clientX < (event.splitX ?? window.innerWidth / 2) ||
      curriculumResizeRef.current ||
      curriculumScreenSwipeRef.current ||
      isCurriculumSwipeExcludedTarget(
        event.target,
        revealsTabletDrawer
          ? LESSON_DRAWER_REVEAL_EXCLUSION_SELECTOR
          : CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
      )
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
      closedAtStart:
        target === "lesson-drawer" ? !lessonDrawer : curriculumCollapsed,
      expandedWidthAtStart: curriculumWidth,
      target,
      startedOnPanel:
        target === "curriculum" &&
        event.target instanceof Element &&
        Boolean(event.target.closest(".learning-curriculum")),
      handle: event.handle,
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

      // A sideways swipe that begins on the open panel is a drag of its
      // resize rail, wherever on the panel the finger is: it widens and
      // narrows the panel with the finger, and closes it when let go
      // narrow enough. The rail's own drag takes the touch from here.
      if (swipe.startedOnPanel && !swipe.closedAtStart) {
        curriculumScreenSwipeRef.current = null;
        claimCurriculumPointerGesture(swipe.pointerId);
        try {
          swipe.handle.setPointerCapture?.(swipe.pointerId);
        } catch {
          // Window-level listeners keep the drag going without capture.
        }
        // A tap that follows the drag ending is not a tap on a lesson.
        curriculumScreenSwipeConsumedUntilRef.current =
          performance.now() + 60_000;
        beginCurriculumResizeRef.current?.(
          swipe.pointerId,
          event.clientX,
          swipe.handle,
        );
        event.preventDefault();
        return;
      }

      const opensClosedCurriculum = swipe.closedAtStart && deltaX < 0;
      const closesOpenCurriculum = !swipe.closedAtStart && deltaX > 0;
      if (!opensClosedCurriculum && !closesOpenCurriculum) {
        curriculumScreenSwipeRef.current = null;
        return;
      }

      swipe.active = true;
      claimCurriculumPointerGesture(swipe.pointerId);
      if (swipe.target === "curriculum") {
        setCurriculumResizePreviewWidth(
          swipe.closedAtStart ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
        );
        setCurriculumResizing(true);
      }
      try {
        swipe.handle.setPointerCapture?.(swipe.pointerId);
      } catch {
        // Window-level listeners keep the swipe active without pointer capture.
      }
    }

    event.preventDefault();
    if (swipe.target === "lesson-drawer") event.stopPropagation();
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

    if (swipe.target === "lesson-drawer") return;

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
    if (swipe.target === "curriculum") {
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
    }
    if (cancelled && swipe.target !== "lesson-drawer") return;

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

    if (swipe.target === "lesson-drawer") {
      if (swipe.closedAtStart) openLessonDrawer();
      else closeLessonDrawer();
      return;
    }

    setCurriculumCollapsed(!swipe.closedAtStart);
  };

  curriculumScreenSwipeStartRef.current = startCurriculumScreenSwipe;
  curriculumScreenSwipeMoveRef.current = moveCurriculumScreenSwipe;
  curriculumScreenSwipeFinishRef.current = endCurriculumScreenSwipe;

  useEffect(() => {
    const startSwipeFromHostedPlayer = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      const playerAnchor = playerWrapRef.current;
      if (
        !workspace ||
        !playerAnchor ||
        !isFullLearningPlayerSwipeTarget(event.target, event, playerAnchor)
      )
        return;

      curriculumScreenSwipeStartRef.current?.({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        target: event.target,
        handle: workspace,
        splitX: getLearningPlayerSwipeSplitX(playerAnchor),
      });
    };
    const continueSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeMoveRef.current?.(event);
    const finishSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event);
    const cancelSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event, true);
    window.addEventListener("pointerdown", startSwipeFromHostedPlayer, true);
    window.addEventListener("pointermove", continueSwipe, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishSwipe, true);
    window.addEventListener("pointercancel", cancelSwipe, true);
    return () => {
      window.removeEventListener(
        "pointerdown",
        startSwipeFromHostedPlayer,
        true,
      );
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
    const nextWidth = clampLearningCurriculumWidth(value);
    setCurriculumWidth(nextWidth);
    try {
      localStorage.setItem(
        CURRICULUM_WIDTH_STORAGE_KEY,
        String(Math.round(nextWidth)),
      );
    } catch {
      // Resizing remains available when browser storage is unavailable.
    }
  }, []);

  const previewFloatingLessonDrawerWidth = useCallback(
    (value: number, allowCollapsePreview = false) => {
      const bounds = getLessonDrawerViewportBounds(
        Math.max(LESSON_DRAWER_MIN_FLOATING_WIDTH, value),
      );
      if (!bounds) return null;
      const previewWidth = allowCollapsePreview
        ? Math.max(0, Math.min(bounds.width, value))
        : bounds.width;
      const previewBounds =
        previewWidth < bounds.width
          ? {
              ...bounds,
              left: bounds.left + bounds.width - previewWidth,
              width: previewWidth,
            }
          : bounds;
      if (!allowCollapsePreview) {
        setFloatingLessonDrawerWidth(previewBounds.width);
      }
      setLessonDrawerViewportBounds(previewBounds);
      return previewBounds.width;
    },
    [getLessonDrawerViewportBounds],
  );

  const commitFloatingLessonDrawerWidth = useCallback(
    (value: number) => {
      const nextWidth = previewFloatingLessonDrawerWidth(value);
      if (nextWidth === null) return;
      try {
        window.localStorage.setItem(
          FLOATING_LESSON_DRAWER_WIDTH_KEY,
          String(Math.round(nextWidth)),
        );
      } catch {
        // Floating resizing remains available without browser storage.
      }
    },
    [previewFloatingLessonDrawerWidth],
  );

  const startFloatingLessonDrawerResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (phoneLessonDrawer) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startWidth =
      lessonDrawerViewportBounds?.width ?? floatingLessonDrawerWidth;
    floatingLessonDrawerResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      originalWidth: startWidth,
      previewWidth: startWidth,
      dismissOnEnd: false,
      handle: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFloatingLessonDrawerResizing(true);
  };

  const moveFloatingLessonDrawerResize = useCallback(
    (event: CurriculumPointerEvent) => {
      const resize = floatingLessonDrawerResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      const requestedWidth = resize.startWidth + resize.startX - event.clientX;
      const nextWidth = previewFloatingLessonDrawerWidth(requestedWidth, true);
      if (nextWidth !== null) {
        resize.previewWidth = nextWidth;
        resize.dismissOnEnd =
          requestedWidth <= FLOATING_LESSON_DRAWER_SNAP_WIDTH;
      }
    },
    [previewFloatingLessonDrawerWidth],
  );

  const endFloatingLessonDrawerResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = floatingLessonDrawerResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      floatingLessonDrawerResizeRef.current = null;
      setFloatingLessonDrawerResizing(false);
      resize.handle.releasePointerCapture?.(resize.pointerId);
      if (cancelled) {
        previewFloatingLessonDrawerWidth(resize.originalWidth);
        return;
      }
      if (resize.dismissOnEnd) {
        closeLessonDrawer();
        return;
      }
      commitFloatingLessonDrawerWidth(resize.previewWidth);
    },
    [
      closeLessonDrawer,
      commitFloatingLessonDrawerWidth,
      previewFloatingLessonDrawerWidth,
    ],
  );

  useEffect(() => {
    if (!floatingLessonDrawerResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      moveFloatingLessonDrawerResize(event);
    const finishResize = (event: PointerEvent) =>
      endFloatingLessonDrawerResize(event);
    const cancelResize = (event: PointerEvent) =>
      endFloatingLessonDrawerResize(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [
    endFloatingLessonDrawerResize,
    floatingLessonDrawerResizing,
    moveFloatingLessonDrawerResize,
  ]);

  const handleFloatingLessonDrawerResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? 20 : -20;
      commitFloatingLessonDrawerWidth(floatingLessonDrawerWidth + direction);
    } else if (event.key === "Home") {
      event.preventDefault();
      closeLessonDrawer();
    } else if (event.key === "End") {
      event.preventDefault();
      commitFloatingLessonDrawerWidth(LESSON_DRAWER_MAX_FLOATING_WIDTH);
    }
  };

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
        previewWidth: curriculumCollapsed
          ? CURRICULUM_COLLAPSED_WIDTH
          : curriculumWidth,
        expandedWidth: curriculumWidth,
        handle,
      };
      setCurriculumResizePreviewWidth(
        curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
      );
      setCurriculumResizing(true);
    },
    [curriculumCollapsed, curriculumWidth, isCourseContentDrawerLayout],
  );

  useLayoutEffect(() => {
    beginCurriculumResizeRef.current = beginCurriculumResize;
  }, [beginCurriculumResize]);

  const startCurriculumResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isCourseContentDrawerLayout()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginCurriculumResize(event.pointerId, event.clientX, event.currentTarget);
  };

  // While the gutter is held, the course content is exactly as wide as the
  // pointer makes it, from nothing to the maximum: it never jumps to a
  // width of its own. Where it settles (closed, its minimum, or the width
  // it was dragged to) is decided when the pointer is released.
  //
  // The width is written directly onto the elements sized from it (see
  // curriculumDragWidth.ts), so the split is laid out for it in this same
  // frame. It used to travel through React state alone, which re-rendered
  // the whole workspace for every movement of the pointer; those renders
  // took several frames each, so the layout followed the pointer in jumps.
  // React still hears the width at once where it changes what is rendered
  // (closed or open, sliding closed or not), and otherwise when the pointer
  // comes to rest.
  const moveCurriculumResize = useCallback((event: CurriculumPointerEvent) => {
    const resize = curriculumResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const previewWidth = Math.min(
      CURRICULUM_MAX_WIDTH,
      Math.max(
        CURRICULUM_COLLAPSED_WIDTH,
        resize.startWidth + resize.startX - event.clientX,
      ),
    );

    // The content itself shows for as long as there is any width to show it
    // in, so it slides out from the edge instead of appearing at a threshold.
    const hidden = previewWidth <= CURRICULUM_COLLAPSED_WIDTH;
    if (resize.collapsed !== hidden) {
      resize.collapsed = hidden;
      setCurriculumCollapsed(hidden);
    }

    const slidingClosed = previewWidth < CURRICULUM_MIN_WIDTH;
    const rendersDifferently =
      resize.previewWidth < CURRICULUM_MIN_WIDTH !== slidingClosed;
    resize.previewWidth = previewWidth;
    if (!slidingClosed) resize.expandedWidth = previewWidth;
    const workspace = workspaceRef.current;
    if (workspace) {
      curriculumDragWidthAppliedRef.current = true;
      applyCurriculumDragWidth(workspace, resize);
    }

    const syncState = () => {
      const current = curriculumResizeRef.current;
      if (current !== resize) return;
      setCurriculumResizePreviewWidth(resize.previewWidth);
      setCurriculumWidth(resize.expandedWidth);
    };
    window.clearTimeout(curriculumResizeSyncTimerRef.current);
    if (rendersDifferently) {
      syncState();
    } else {
      curriculumResizeSyncTimerRef.current = window.setTimeout(
        syncState,
        CURRICULUM_RESIZE_STATE_SYNC_MS,
      );
    }
  }, []);
  const endCurriculumResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = curriculumResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      curriculumResizeRef.current = null;
      window.clearTimeout(curriculumResizeSyncTimerRef.current);
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
      resize.handle?.releasePointerCapture?.(resize.pointerId);
      // A drag handed over from a swipe on the panel swallows taps while it
      // lasts; from here they are swallowed only for a moment longer.
      if (curriculumScreenSwipeConsumedUntilRef.current > performance.now()) {
        curriculumScreenSwipeConsumedUntilRef.current = performance.now() + 450;
      }

      if (cancelled) {
        setCurriculumCollapsed(resize.collapsedAtStart);
        setCurriculumWidth(resize.expandedWidthAtStart);
        return;
      }
      // Let go less than half-way to the minimum width, it closes (and
      // keeps the width it had for next time). Anything wider stays open,
      // at the minimum width if it was let go narrower than that.
      if (resize.previewWidth < CURRICULUM_SNAP_WIDTH) {
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
    if (isCourseContentDrawerLayout()) {
      if (lessonDrawer) closeLessonDrawer();
      else openLessonDrawer();
      return;
    }
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  const curriculumToggleGesture = useSecondPressHold<HTMLButtonElement>({
    onPress: toggleCurriculumFromPlayer,
    onSecondPressHold: openFloatingLessonDrawer,
    secondPressWindow: courseContentDrawerViewport ? 700 : undefined,
  });

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
    } catch {
      // Retired preferences are cleaned up on a best-effort basis.
    }
  }, []);

  const curriculumAccessibleWidth = Math.max(
    CURRICULUM_MIN_WIDTH,
    curriculumResizePreviewWidth ?? curriculumWidth,
  );
  const playerCourseLessonsSidePanel = !courseContentDrawerViewport;
  const playerCourseLessonsSecondPressHold = useMemo(
    () =>
      courseContentDrawerViewport
        ? undefined
        : {
            isSecondPressHolding: curriculumToggleGesture.isSecondPressHolding,
            handlers: curriculumToggleGesture.handlers,
          },
    [
      courseContentDrawerViewport,
      curriculumToggleGesture.handlers,
      curriculumToggleGesture.isSecondPressHolding,
    ],
  );
  const floatingLessonDrawerViewportWidth =
    lessonDrawerViewportBounds?.width ?? floatingLessonDrawerWidth;
  const floatingLessonDrawerSlidingClosed =
    floatingLessonDrawerResizing &&
    floatingLessonDrawerViewportWidth < LESSON_DRAWER_MIN_FLOATING_WIDTH;
  const playerCourseLessonsOpen = mobileLandscapeFullscreen
    ? fullscreenLessonPanelOpen
    : courseContentDrawerViewport
      ? lessonDrawer
      : !curriculumCollapsed;
  const fullscreenVideoLayoutWidthPercent =
    fullscreenVideoWidthPreviewPercent ?? fullscreenVideoWidthPercent;
  const fullscreenCoursePanel = useMemo(
    () => (
      <FullscreenLandscapeCurriculumPanel
        onClose={closeFullscreenLessonPanel}
        videoWidthPercent={fullscreenVideoWidthPercent}
        onVideoWidthPercentChange={setFullscreenVideoWidthPercent}
        onVideoWidthPreviewChange={setFullscreenVideoWidthPreviewPercent}
      >
        <Curriculum
          sections={curriculumSections}
          lessonsById={curriculumLessonsById}
          scrollportRef={fullscreenCurriculumScrollportRef}
          scrollportId="learning-fullscreen-course-curriculum-scrollport"
          scrollControlBottomClearance="calc(100dvh - 228px)"
          selectedLesson={selectedLesson}
          lessonProgress={lessonProgress}
          lockedLessonNumbers={lockedLessonNumbers}
          onSelectLesson={selectLesson}
          onOpenCourseOverview={onOpenCourseOverview}
          courseNavigationActionLabel={courseNavigationActionLabel}
          courseTitle={courseTitle}
          courseThumbnail={courseThumbnail}
          courseThumbnailSrcSet={courseThumbnailSrcSet}
          focusRequest={fullscreenCurriculumFocusRequest}
          persistenceKey={coursePersistenceKey}
          lessonResources={curriculumLessonResources}
          resourceCourseKey={courseSlug}
          quizLessonNumbers={curriculumQuizLessonNumbers}
          activeQuizLesson={showingQuiz ? selectedLesson : null}
          onOpenLessonQuiz={handleOpenLessonQuiz}
        />
      </FullscreenLandscapeCurriculumPanel>
    ),
    [
      coursePersistenceKey,
      closeFullscreenLessonPanel,
      courseNavigationActionLabel,
      courseThumbnail,
      courseThumbnailSrcSet,
      courseTitle,
      courseSlug,
      curriculumLessonResources,
      curriculumLessonsById,
      curriculumQuizLessonNumbers,
      curriculumSections,
      fullscreenCurriculumFocusRequest,
      fullscreenVideoWidthPercent,
      handleOpenLessonQuiz,
      lessonProgress,
      lockedLessonNumbers,
      onOpenCourseOverview,
      selectLesson,
      selectedLesson,
      showingQuiz,
    ],
  );
  const lessonPlayerSeekRef = useRef<((seconds: number) => void) | null>(null);
  const registerLessonPlayerSeek = useCallback(
    (seekToTimestamp: (seconds: number) => void) => {
      lessonPlayerSeekRef.current = seekToTimestamp;
      return () => {
        if (lessonPlayerSeekRef.current === seekToTimestamp) {
          lessonPlayerSeekRef.current = null;
        }
      };
    },
    [],
  );
  const seekCurrentLessonToTimestamp = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    lessonPlayerSeekRef.current?.(seconds);
  }, []);

  const currentLessonTitle = currentLesson[1];
  const selectedLessonDurationSeconds = selectedLessonRecord?.durationSeconds;
  const selectedLessonMediaId = selectedLessonRecord?.contentMediaId;
  const currentLessonMedia = useMemo(
    () =>
      createLessonVideo(currentLessonTitle, {
        durationSeconds: selectedLessonDurationSeconds,
        thumbnailSrc: selectedLessonMediaId
          ? mediaService.getVideoThumbnailUrl(selectedLessonMediaId)
          : courseThumbnail,
      }),
    [
      courseThumbnail,
      currentLessonTitle,
      selectedLessonDurationSeconds,
      selectedLessonMediaId,
    ],
  );

  const lessonPlayerProps = useMemo<LessonVideoPlayerProps>(
    () => ({
      shortPlayer,
      seekTimeOnly,
      media: currentLessonMedia,
      description: selectedLessonDescription,
      playbackBootstrap,
      playbackAccessError,
      playbackBootstrapPending,
      playbackUnavailableMessage: playbackBootstrapError?.message ?? null,
      onRetryPlayback: retryPlaybackBootstrap,
      refreshPlaybackToken,
      protectedPlayback,
      lessonTitle: currentLesson[1],
      courseTitle,
      lessonIndex: currentLessonIndex >= 0 ? currentLessonIndex + 1 : 1,
      totalLessons: lessonSequence.length,
      theaterMode,
      onTheaterToggle: toggleTheaterMode,
      autoPlayOnMediaChange: showingQuiz ? false : autoPlayOnLessonChange,
      autoplayEnabled,
      playbackSuspended: showingQuiz,
      canGoNext: nextLessonId !== undefined,
      canGoPrevious: previousLessonId !== undefined,
      nextLessonInfo,
      courseComplete,
      courseLessonsOpen: playerCourseLessonsOpen,
      courseLessonsDrawerOpen: lessonDrawer,
      courseLessonsPanel: fullscreenCoursePanel,
      courseLessonsSecondPressHold: playerCourseLessonsSecondPressHold,
      courseLessonsShortcutLabel: curriculumShortcutLabel,
      courseLessonsSidePanel: playerCourseLessonsSidePanel,
      courseLessonsBottomSheet: phoneLessonDrawer,
      courseLessonsVideoWidthPercent: fullscreenVideoLayoutWidthPercent,
      // Only a visible content column can host the chapters panel; otherwise
      // the player slides it over its own right edge.
      chaptersPanelHost:
        curriculumCollapsed || theaterMode || courseContentDrawerViewport
          ? null
          : chaptersPanelHost,
      onAutoplayEnabledChange: updateAutoplayEnabled,
      onCourseLessonsToggle: toggleLessonDrawerFromPlayer,
      onGoNext: goToNextLesson,
      onGoPrevious: goToPreviousLesson,
      onLessonEnded: handleLessonEnded,
      onMinimize: onMinimizePlayer
        ? (request) => {
            onMinimizePlayer({
              ...request,
              courseSlug,
              selectedLesson,
            });
          }
        : undefined,
      onMinimizeGestureChange: updatePlayerMinimizeGesture,
      onMiniPlayerRestoreReady,
      onMobileLandscapeFullscreenChange: handleMobileLandscapeFullscreenChange,
      onProgressChange: updateSelectedLessonProgress,
      onSeekToTimestampReady: registerLessonPlayerSeek,
      resumePersistenceKey: `${coursePersistenceKey}-lesson-${selectedLesson}`,
    }),
    [
      shortPlayer,
      seekTimeOnly,
      autoPlayOnLessonChange,
      autoplayEnabled,
      chaptersPanelHost,
      courseComplete,
      courseContentDrawerViewport,
      coursePersistenceKey,
      courseSlug,
      courseTitle,
      curriculumCollapsed,
      currentLesson,
      currentLessonMedia,
      currentLessonIndex,
      curriculumShortcutLabel,
      fullscreenCoursePanel,
      fullscreenVideoLayoutWidthPercent,
      goToNextLesson,
      goToPreviousLesson,
      handleLessonEnded,
      handleMobileLandscapeFullscreenChange,
      lessonDrawer,
      lessonSequence.length,
      nextLessonId,
      nextLessonInfo,
      onMiniPlayerRestoreReady,
      onMinimizePlayer,
      playbackBootstrap,
      playbackAccessError,
      playbackBootstrapPending,
      playbackBootstrapError,
      protectedPlayback,
      registerLessonPlayerSeek,
      retryPlaybackBootstrap,
      refreshPlaybackToken,
      playerCourseLessonsOpen,
      playerCourseLessonsSecondPressHold,
      playerCourseLessonsSidePanel,
      phoneLessonDrawer,
      previousLessonId,
      selectedLesson,
      selectedLessonDescription,
      showingQuiz,
      theaterMode,
      toggleLessonDrawerFromPlayer,
      toggleTheaterMode,
      updateAutoplayEnabled,
      updatePlayerMinimizeGesture,
      updateSelectedLessonProgress,
    ],
  );

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
      lessonProgress,
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
    lessonProgress,
    persistentPlayerCourseRouteKey,
    persistentPlayerLessonPath,
    persistentPlayerReturnPath,
    registerPersistentPlayer,
    selectLesson,
    selectedLesson,
  ]);

  const lessonHeader = (contained = false, titleLoading = false) => (
    <header
      className="learning-workspace__lesson-header"
      // Tells the video's resize grip when a mouse is over its strip (at
      // phone width the strip lies over the top of this header).
      onPointerMove={stickyPlayer ? onHeaderPointerMove : undefined}
      onPointerLeave={stickyPlayer ? onHeaderPointerLeave : undefined}
    >
      <button
        id="learning-course-content-trigger"
        ref={lessonTriggerRef}
        type="button"
        className={`learning-workspace__lesson-heading ${appliedPlayerHeight === null ? "touch-pan-up" : "touch-none"}`}
        {...(stickyPlayer ? titleSwipeHandlers : undefined)}
        style={
          contained
            ? {
                width: "100%",
                minWidth: 0,
                marginInline: 0,
                paddingInline: 0,
              }
            : undefined
        }
        aria-label={`Open course lessons for ${currentLesson[1]}`}
        aria-expanded={lessonDrawer}
        onClick={openLessonDrawerInPlace}
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
      {/* No quiz button here: the course content list marks a lesson that
          has a quiz and opens it, and the open quiz carries its own way
          back to the video. */}
    </header>
  );

  return (
    <div
      ref={workspaceRef}
      className={`learning-workspace ${theaterMode ? "is-theater" : ""} ${curriculumResizing ? "is-curriculum-resizing" : ""} ${floatingLessonDrawerResizing ? "is-floating-curriculum-resizing select-none" : ""}`}
      onPointerDownCapture={(event) =>
        startCurriculumScreenSwipe({
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          clientX: event.clientX,
          clientY: event.clientY,
          timeStamp: event.timeStamp,
          target: event.target,
          handle: event.currentTarget,
        })
      }
      onClickCapture={suppressCurriculumSwipeClick}
    >
      <main
        ref={mainRef}
        data-learning-motion-surface=""
        data-learning-split-lesson=""
        data-learning-quiz-active={showingQuiz ? "true" : undefined}
        className={`learning-workspace__main ${curriculumCollapsed ? "is-curriculum-collapsed" : ""}`}
        inert={lessonDrawer ? true : undefined}
        aria-hidden={lessonDrawer || undefined}
      >
        <section className="learning-workspace__lesson-column">
          <div
            ref={playerWrapRef}
            // Above phone width the video stays at the top of the page while
            // the title and description scroll away beneath it. (On a phone
            // the page does not scroll; the area under the video does.) The
            // player itself is positioned on this slot, so it follows. The
            // slot sits above the page that scrolls behind it, so the strip
            // that resizes the video is never covered.
            className={`learning-workspace__player-wrap ${stickyPlayer ? "min-[641px]:sticky! min-[641px]:top-0 min-[641px]:z-40" : ""}`}
            data-learning-player-motion-target=""
          >
            {showingQuiz ? (
              // The quiz takes the video's place edge to edge, as the video
              // does. It used to sit in a padded box holding a second card.
              <div className="w-full min-w-0">
                {currentQuizAssignment ? (
                  <QuizAttemptPanel
                    key={`${currentQuizAssignment.id}-${currentLessonUuid ?? selectedLesson}`}
                    assignmentId={currentQuizAssignment.id}
                    courseId={courseId ?? currentQuizAssignment.courseId}
                    quizTitle={currentQuizAssignment.quizTitle}
                    activeAttemptId={currentQuizAssignment.activeAttemptId}
                    maxAttempts={currentQuizAssignment.maxAttempts}
                    attemptCount={currentQuizAssignment.attemptCount}
                    bestScore={currentQuizAssignment.bestScore}
                    latestPassed={currentQuizAssignment.latestPassed}
                    onBackToVideo={resumeLessonVideoPlayback}
                    onPassed={() => updateSelectedLessonProgress(100)}
                    lessonBadge={`Lesson ${selectedLesson} Quiz`}
                    onContinueCourse={
                      nextLessonId === undefined
                        ? undefined
                        : () => {
                            resumeLessonVideoPlayback();
                            onSelectLesson(nextLessonId);
                          }
                    }
                  />
                ) : (
                  <QuizStageMessage
                    lessonBadge={`Lesson ${selectedLesson} Quiz`}
                    onBackToVideo={resumeLessonVideoPlayback}
                    role={
                      quizAssignmentLoading || courseQuizAssignments.isLoading
                        ? "status"
                        : "alert"
                    }
                    label={
                      quizAssignmentLoading || courseQuizAssignments.isLoading
                        ? "Loading quiz assignment"
                        : undefined
                    }
                    visual={
                      quizAssignmentLoading ||
                      courseQuizAssignments.isLoading ? (
                        <span className="text-(--muted)">
                          <LoadingSpinnerIcon size={26} />
                        </span>
                      ) : undefined
                    }
                    title={
                      quizAssignmentLoading || courseQuizAssignments.isLoading
                        ? undefined
                        : "This quiz is not available to you"
                    }
                  >
                    {quizAssignmentLoading || courseQuizAssignments.isLoading
                      ? null
                      : "It is not currently assigned to your course access."}
                  </QuizStageMessage>
                )}
              </div>
            ) : isDedicatedQuizLesson && !hasLessonQuiz(selectedLesson) ? (
              <div className="w-full max-w-4xl mx-auto p-8 sm:p-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
                  <Exam size={28} weight="duotone" />
                </div>
                <h2 className="text-base font-semibold text-(--text)">
                  Quiz Assessment Not Available
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-(--muted) max-w-md mx-auto">
                  This lesson does not currently have an active quiz assessment
                  assigned.
                </p>
              </div>
            ) : registerPersistentPlayer ? (
              <div
                className="pointer-events-none relative z-10 aspect-video w-full overflow-visible bg-black max-h-(--learning-player-max-height)"
                aria-hidden="true"
                data-learning-player-anchor=""
                data-learning-player-shortened={
                  appliedPlayerHeight === null ? undefined : ""
                }
                data-learning-player-hidden={
                  appliedPlayerHeight === 0 ? "" : undefined
                }
                data-learning-player-tiny={
                  appliedPlayerHeight !== null &&
                  appliedPlayerHeight <= LESSON_PLAYER_TINY_HEIGHT
                    ? ""
                    : undefined
                }
                data-learning-player-short={shortPlayer ? "" : undefined}
                data-learning-player-very-short={seekTimeOnly ? "" : undefined}
                data-learning-player-compact={
                  appliedPlayerHeight !== null &&
                  appliedPlayerHeight <= LESSON_PLAYER_COMPACT_HEIGHT
                    ? ""
                    : undefined
                }
                style={
                  appliedPlayerHeight === null
                    ? undefined
                    : ({
                        [LESSON_PLAYER_MAX_HEIGHT_PROPERTY]: `${appliedPlayerHeight}px`,
                      } as CSSProperties)
                }
              >
                {persistentPlayerMounted ? null : (
                  <div
                    className="absolute inset-0 z-10 overflow-visible text-white"
                    data-learning-player-initial-loader=""
                  >
                    <LessonPlayerChromePlaceholder {...lessonPlayerProps} />
                  </div>
                )}
              </div>
            ) : (
              <LessonVideoPlayer {...lessonPlayerProps} />
            )}
            {stickyPlayer && registerPersistentPlayer ? (
              <LessonPlayerHeightHandle
                height={playerHeight}
                onChange={setPlayerHeight}
              />
            ) : null}
          </div>

          <div className="learning-workspace__lesson-content-clip">
            <article
              ref={lessonContentRef}
              className="learning-workspace__lesson-content"
              data-discussion-panel-anchor=""
              data-learning-lesson-content=""
              aria-labelledby="learning-lesson-title"
              style={
                desktopLearningMinimizeViewport
                  ? undefined
                  : {
                      opacity: "var(--learning-player-content-opacity, 1)",
                      transform:
                        "translate3d(0, var(--learning-player-content-offset-y, 0px), 0)",
                      transition:
                        "transform var(--learning-player-content-motion-duration, 0ms) cubic-bezier(0.16, 1, 0.3, 1), opacity var(--learning-player-content-motion-duration, 0ms) cubic-bezier(0.16, 1, 0.3, 1)",
                    }
              }
            >
              {!courseUnavailable &&
                !phoneLessonDrawerViewport &&
                lessonHeader(false, isLearningBootstrapLoading)}
              {courseUnavailable ? null : isLearningDeepLinkReady ||
                isLearningBootstrapLoading ? (
                <Discussion
                  key={discussionPersistenceKey}
                  persistenceKey={discussionPersistenceKey}
                  courseSlug={courseSlug}
                  courseId={courseId}
                  lessonId={backendLessonId}
                  noteDeepLinkId={noteDeepLinkId}
                  isThreadDeepLinkReady={isLearningDeepLinkReady}
                  mobileBottomNavigation={mobileBottomNavigation}
                  mobileBottomNavigationHidden={mobileBottomNavigationHidden}
                  mobileLessonHeader={lessonHeader(
                    true,
                    isLearningBootstrapLoading,
                  )}
                  lessonDescription={selectedLessonDescription}
                  isLessonDescriptionLoading={
                    (isApiRoute && isCourseOverviewLoading) ||
                    isLearningBootstrapLoading
                  }
                  interactionCapabilities={interactionCapabilities}
                  isInteractionCapabilitiesLoading={isLearningBootstrapLoading}
                  lessonContentAccess={lessonContentAccess}
                  lessonContentAccessReason={lessonContentAccessReason}
                  canParticipate={canParticipateInLessonDiscussion}
                  participationState={lessonParticipationState}
                  participationActionLabel={
                    isAuthenticated ? "Get access" : "Log in"
                  }
                  onParticipationAction={
                    isAuthenticated ? onOpenCourseOverview : onOpenLogin
                  }
                  onSeekToTimestamp={seekCurrentLessonToTimestamp}
                />
              ) : isLearningDeepLinkError ? (
                <div>
                  {phoneLessonDrawerViewport &&
                    lessonHeader(true, isLearningBootstrapLoading)}
                  <div
                    className="py-12 text-center"
                    data-testid="learning-discussion-error"
                  >
                    <p className="font-semibold text-(--text)">
                      Failed to load discussion
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
                      There was a problem loading the course for this
                      discussion.
                    </p>
                    <button
                      type="button"
                      onClick={() => void refetchCourseOverview()}
                      className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {phoneLessonDrawerViewport &&
                    lessonHeader(true, isLearningBootstrapLoading)}
                  <div
                    className="flex min-h-48 flex-col items-center justify-center py-12 text-sm text-(--text-secondary)"
                    data-testid="learning-discussion-loading"
                    role="status"
                    aria-label="Loading discussion"
                  >
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
                  </div>
                </div>
              )}
            </article>
          </div>
        </section>

        {/* On desktop this is the second card of the page. Theater mode hides
            the course content, so the lesson card takes the full width. */}
        <div
          className="learning-workspace__curriculum-clip"
          data-learning-split-pane={theaterMode ? undefined : ""}
        >
          <div
            className={`learning-workspace__curriculum-column ${curriculumCollapsed ? "is-collapsed" : ""}`}
            data-learning-split-card=""
          >
            <div
              className="learning-curriculum__resize-rail group/rail"
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
                      (curriculumResizePreviewWidth ??
                        (curriculumCollapsed
                          ? CURRICULUM_COLLAPSED_WIDTH
                          : curriculumWidth)) < CURRICULUM_MIN_WIDTH
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
            >
              <CurriculumResizeGrip />
            </div>
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
              />
            </div>
            {/* The lesson player portals its chapters panel here so it
                overlays the course content. It sits below the resize rail. */}
            <div
              ref={setChaptersPanelHost}
              data-learning-chapters-panel-host=""
              className="pointer-events-none absolute inset-0 z-11 overflow-hidden rounded-[inherit]"
            />
          </div>
        </div>
      </main>

      <PrerenderedMobileCommentComposer />

      <FloatingScrollbar
        scrollportRef={curriculumScrollportRef}
        ariaControls="learning-course-curriculum-scrollport"
        ariaLabel="Course curriculum scroll position"
        className="floating-scrollbar--curriculum"
        disabled={curriculumCollapsed || theaterMode || lessonDrawer}
      />

      <Drawer
        key={phoneLessonDrawer ? "phone-course-lessons" : "side-course-lessons"}
        open={lessonDrawer}
        onOpenChange={(open) => {
          if (!open) closeLessonDrawer();
        }}
        onOpenChangeComplete={(open) => {
          if (!open) {
            setLessonDrawerViewportBounds(null);
            if (phoneLessonDrawer)
              setLessonDrawerSnapPoint(lessonDrawerCollapsedSnapPoint);
          }
        }}
        snapPoints={phoneLessonDrawer ? lessonDrawerSnapPoints : undefined}
        snapPoint={phoneLessonDrawer ? lessonDrawerSnapPoint : undefined}
        onSnapPointChange={
          phoneLessonDrawer ? setLessonDrawerSnapPoint : undefined
        }
        snapToSequentialPoints={phoneLessonDrawer}
        showSwipeHandle={phoneLessonDrawer}
        swipeDirection={phoneLessonDrawer ? "down" : "right"}
        swipeHandleClassName="absolute inset-x-0 top-0 z-30 pt-2 group-data-[swipe-axis=y]/drawer-popup:h-7 group-data-[swipe-direction=down]/drawer-popup:items-start after:bg-white/75 after:shadow-[0_1px_3px_rgba(0,0,0,0.48)]"
        triggerId="learning-course-content-trigger"
      >
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
              ? "[--drawer-bleed-background:var(--canvas)] bg-(--canvas) data-expanded:rounded-none data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] shadow-[0_-18px_48px_rgba(0,0,0,0.32)]"
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
          <div className="min-h-0 flex-1 overflow-hidden">
            <Curriculum
              sections={curriculumSections}
              lessonsById={curriculumLessonsById}
              scrollportRef={lessonDrawerScrollportRef}
              scrollportId="lesson-drawer-curriculum-scrollport"
              selectedLesson={selectedLesson}
              lessonProgress={lessonProgress}
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
      </Drawer>
      <FloatingScrollbar
        scrollportRef={lessonDrawerScrollportRef}
        rightEdgeRef={lessonDrawerSurfaceRef}
        ariaControls="lesson-drawer-curriculum-scrollport"
        ariaLabel="Course curriculum scroll position"
        className="floating-scrollbar--curriculum floating-scrollbar--drawer"
        disabled={!lessonDrawer}
      />
    </div>
  );
}
