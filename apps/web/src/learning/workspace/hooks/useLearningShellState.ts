import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getInitialLearningPlayerPreferences,
  publishLearningPlayerBootstrap,
} from "../../learningPlayerPreferences";
import { FULLSCREEN_VIDEO_WIDTH_DEFAULT_PERCENT } from "../../FullscreenLandscapeCurriculumPanel";
import {
  CURRICULUM_COLLAPSED_STORAGE_KEY,
  CURRICULUM_COLLAPSED_WIDTH,
  applyLearningShellToDocument,
  getInitialLearningShellState,
} from "../../learningShellPreferences";
import type { LessonDrawerViewportBounds } from "../../useLessonDrawerHeroControl";
import { LESSON_DRAWER_FALLBACK_SNAP_POINT } from "../workspaceConstants";
import {
  subscribeToCourseContentDrawerViewport,
  getCourseContentDrawerViewportSnapshot,
  getCourseContentDrawerViewportServerSnapshot,
  subscribeToPhoneLessonDrawerViewport,
  getPhoneLessonDrawerViewportSnapshot,
  getPhoneLessonDrawerViewportServerSnapshot,
  subscribeToDesktopLearningMinimizeViewport,
  getDesktopLearningMinimizeViewportSnapshot,
  getDesktopLearningMinimizeViewportServerSnapshot,
} from "../workspaceViewports";
import { getInitialFloatingLessonDrawerWidth } from "../workspaceDom";

export interface UseLearningShellStateArgs {
  mobileBottomNavigation: boolean;
  setAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
}

export interface UseLearningShellStateResult {
  lessonDrawer: boolean;
  setLessonDrawer: Dispatch<SetStateAction<boolean>>;
  mobileLandscapeFullscreen: boolean;
  setMobileLandscapeFullscreen: Dispatch<SetStateAction<boolean>>;
  fullscreenLessonPanelOpen: boolean;
  setFullscreenLessonPanelOpen: Dispatch<SetStateAction<boolean>>;
  fullscreenVideoWidthPercent: number;
  setFullscreenVideoWidthPercent: Dispatch<SetStateAction<number>>;
  fullscreenVideoWidthPreviewPercent: number | null;
  setFullscreenVideoWidthPreviewPercent: Dispatch<
    SetStateAction<number | null>
  >;
  fullscreenCurriculumFocusRequest: number;
  setFullscreenCurriculumFocusRequest: Dispatch<SetStateAction<number>>;
  lessonDrawerForcedFloating: boolean;
  setLessonDrawerForcedFloating: Dispatch<SetStateAction<boolean>>;
  lessonDrawerSnapPoint: string | number | null;
  setLessonDrawerSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  lessonDrawerCollapsedSnapPoint: number;
  setLessonDrawerCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  lessonDrawerViewportBounds: LessonDrawerViewportBounds | null;
  setLessonDrawerViewportBounds: Dispatch<
    SetStateAction<LessonDrawerViewportBounds | null>
  >;
  floatingLessonDrawerWidth: number;
  setFloatingLessonDrawerWidth: Dispatch<SetStateAction<number>>;
  floatingLessonDrawerResizing: boolean;
  setFloatingLessonDrawerResizing: Dispatch<SetStateAction<boolean>>;
  courseContentDrawerViewport: boolean;
  phoneLessonDrawerViewport: boolean;
  desktopLearningMinimizeViewport: boolean;
  phoneLessonDrawer: boolean;
  lessonDrawerSnapPoints: number[];
  curriculumFocusRequest: number;
  setCurriculumFocusRequest: Dispatch<SetStateAction<number>>;
  lessonDrawerFocusRequest: number;
  setLessonDrawerFocusRequest: Dispatch<SetStateAction<number>>;
  lessonDrawerTopRequest: number;
  setLessonDrawerTopRequest: Dispatch<SetStateAction<number>>;
  lessonDrawerScrollTarget: "current" | "keep" | "top";
  setLessonDrawerScrollTarget: Dispatch<
    SetStateAction<"current" | "keep" | "top">
  >;
  curriculumWidth: number;
  setCurriculumWidth: Dispatch<SetStateAction<number>>;
  curriculumCollapsed: boolean;
  setCurriculumCollapsed: Dispatch<SetStateAction<boolean>>;
  curriculumResizing: boolean;
  setCurriculumResizing: Dispatch<SetStateAction<boolean>>;
  curriculumResizePreviewWidth: number | null;
  setCurriculumResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
}

export function useLearningShellState({
  mobileBottomNavigation,
  setAutoplayEnabled,
}: UseLearningShellStateArgs): UseLearningShellStateResult {
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
  }, [setAutoplayEnabled]);

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
  return {
    lessonDrawer,
    setLessonDrawer,
    mobileLandscapeFullscreen,
    setMobileLandscapeFullscreen,
    fullscreenLessonPanelOpen,
    setFullscreenLessonPanelOpen,
    fullscreenVideoWidthPercent,
    setFullscreenVideoWidthPercent,
    fullscreenVideoWidthPreviewPercent,
    setFullscreenVideoWidthPreviewPercent,
    fullscreenCurriculumFocusRequest,
    setFullscreenCurriculumFocusRequest,
    lessonDrawerForcedFloating,
    setLessonDrawerForcedFloating,
    lessonDrawerSnapPoint,
    setLessonDrawerSnapPoint,
    lessonDrawerCollapsedSnapPoint,
    setLessonDrawerCollapsedSnapPoint,
    lessonDrawerViewportBounds,
    setLessonDrawerViewportBounds,
    floatingLessonDrawerWidth,
    setFloatingLessonDrawerWidth,
    floatingLessonDrawerResizing,
    setFloatingLessonDrawerResizing,
    courseContentDrawerViewport,
    phoneLessonDrawerViewport,
    desktopLearningMinimizeViewport,
    phoneLessonDrawer,
    lessonDrawerSnapPoints,
    curriculumFocusRequest,
    setCurriculumFocusRequest,
    lessonDrawerFocusRequest,
    setLessonDrawerFocusRequest,
    lessonDrawerTopRequest,
    setLessonDrawerTopRequest,
    lessonDrawerScrollTarget,
    setLessonDrawerScrollTarget,
    curriculumWidth,
    setCurriculumWidth,
    curriculumCollapsed,
    setCurriculumCollapsed,
    curriculumResizing,
    setCurriculumResizing,
    curriculumResizePreviewWidth,
    setCurriculumResizePreviewWidth,
  };
}
