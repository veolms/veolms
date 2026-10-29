import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { scrollApplicationTo } from "../../../shell/applicationScroll";
import {
  useLessonDrawerHeroControl,
  type LessonDrawerHeroControlProps,
} from "../../useLessonDrawerHeroControl";
import type { LessonDrawerViewportBounds } from "../../useLessonDrawerHeroControl";
import { useStickyBarSheetDrag } from "../../useStickyBarSheetDrag";
import { COURSE_CONTENT_DRAWER_QUERY } from "../workspaceConstants";
import type { TouchEvent as ReactTouchEvent } from "react";

export interface UseLessonDrawerControlsArgs {
  lessonDrawer: boolean;
  setLessonDrawer: Dispatch<SetStateAction<boolean>>;
  mobileLandscapeFullscreen: boolean;
  setMobileLandscapeFullscreen: Dispatch<SetStateAction<boolean>>;
  fullscreenLessonPanelOpen: boolean;
  setFullscreenLessonPanelOpen: Dispatch<SetStateAction<boolean>>;
  setFullscreenVideoWidthPreviewPercent: Dispatch<
    SetStateAction<number | null>
  >;
  setFullscreenCurriculumFocusRequest: Dispatch<SetStateAction<number>>;
  lessonDrawerForcedFloating: boolean;
  setLessonDrawerForcedFloating: Dispatch<SetStateAction<boolean>>;
  lessonDrawerSnapPoint: string | number | null;
  setLessonDrawerSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  lessonDrawerCollapsedSnapPoint: number;
  setLessonDrawerCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  setLessonDrawerViewportBounds: Dispatch<
    SetStateAction<LessonDrawerViewportBounds | null>
  >;
  floatingLessonDrawerWidth: number;
  phoneLessonDrawer: boolean;
  setCurriculumFocusRequest: Dispatch<SetStateAction<number>>;
  setLessonDrawerFocusRequest: Dispatch<SetStateAction<number>>;
  setLessonDrawerTopRequest: Dispatch<SetStateAction<number>>;
  setLessonDrawerScrollTarget: Dispatch<
    SetStateAction<"current" | "keep" | "top">
  >;
  curriculumCollapsed: boolean;
  setCurriculumCollapsed: Dispatch<SetStateAction<boolean>>;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  theaterMode: boolean;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  lessonDrawerScrollportRef: RefObject<HTMLElement | null>;
  previousFocusRef: RefObject<HTMLElement | null>;
  lessonDrawerSkipFinalFocusRef: RefObject<boolean>;
  isCourseContentDrawerLayout: () => boolean;
  getLessonDrawerCollapsedSnapPoint: () => number;
  getLessonDrawerViewportBounds: (preferredWidth: number) => {
    top: number;
    bottom: number;
    borderRadius: string;
    left: number;
    width: number;
  } | null;
}

export interface UseLessonDrawerControlsResult {
  toggleTheaterMode: () => void;
  openLessonDrawer: () => void;
  openLessonDrawerInPlace: () => void;
  closeLessonDrawer: () => void;
  toggleLessonDrawerFromPlayer: (presentation: "drawer" | "side") => void;
  handleMobileLandscapeFullscreenChange: (active: boolean) => void;
  closeFullscreenLessonPanel: () => void;
  openFloatingLessonDrawer: () => void;
  lessonDrawerHeroControlProps: LessonDrawerHeroControlProps;
  handleLessonDrawerTouchStartCapture: (
    event: ReactTouchEvent<HTMLElement>,
  ) => void;
}

export function useLessonDrawerControls({
  lessonDrawer,
  setLessonDrawer,
  mobileLandscapeFullscreen,
  setMobileLandscapeFullscreen,
  fullscreenLessonPanelOpen,
  setFullscreenLessonPanelOpen,
  setFullscreenVideoWidthPreviewPercent,
  setFullscreenCurriculumFocusRequest,
  lessonDrawerForcedFloating,
  setLessonDrawerForcedFloating,
  lessonDrawerSnapPoint,
  setLessonDrawerSnapPoint,
  lessonDrawerCollapsedSnapPoint,
  setLessonDrawerCollapsedSnapPoint,
  setLessonDrawerViewportBounds,
  floatingLessonDrawerWidth,
  phoneLessonDrawer,
  setCurriculumFocusRequest,
  setLessonDrawerFocusRequest,
  setLessonDrawerTopRequest,
  setLessonDrawerScrollTarget,
  curriculumCollapsed,
  setCurriculumCollapsed,
  setTheaterMode,
  theaterMode,
  playerWrapRef,
  lessonDrawerScrollportRef,
  previousFocusRef,
  lessonDrawerSkipFinalFocusRef,
  isCourseContentDrawerLayout,
  getLessonDrawerCollapsedSnapPoint,
  getLessonDrawerViewportBounds,
}: UseLessonDrawerControlsArgs): UseLessonDrawerControlsResult {
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
  }, [
    theaterMode,
    setLessonDrawer,
    setLessonDrawerForcedFloating,
    setLessonDrawerViewportBounds,
    setTheaterMode,
  ]);

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
      previousFocusRef,
      setCurriculumCollapsed,
      setCurriculumFocusRequest,
      setFullscreenLessonPanelOpen,
      setLessonDrawer,
      setLessonDrawerCollapsedSnapPoint,
      setLessonDrawerFocusRequest,
      setLessonDrawerForcedFloating,
      setLessonDrawerScrollTarget,
      setLessonDrawerSnapPoint,
      setLessonDrawerTopRequest,
      setLessonDrawerViewportBounds,
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
  }, [setLessonDrawer, setLessonDrawerForcedFloating]);

  // Read when the player's Lessons button is pressed, not a dependency of
  // the handler: a new handler re-registered the player with the app layout
  // as a phone turned sideways in full screen, and the layout's urgent
  // re-render held up the turned screen.
  const mobileLandscapeFullscreenRef = useRef(mobileLandscapeFullscreen);
  useLayoutEffect(() => {
    mobileLandscapeFullscreenRef.current = mobileLandscapeFullscreen;
  }, [mobileLandscapeFullscreen]);

  const toggleLessonDrawerFromPlayer = useCallback(
    (presentation: "drawer" | "side") => {
      if (presentation === "side") {
        setLessonDrawer(false);
        setLessonDrawerForcedFloating(false);

        if (mobileLandscapeFullscreenRef.current) {
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
        if (curriculumCollapsed) {
          setCurriculumFocusRequest((request) => request + 1);
        }
        setCurriculumCollapsed((collapsed) => !collapsed);
        return;
      }

      setFullscreenLessonPanelOpen(false);
      if (lessonDrawer) closeLessonDrawer();
      else openLessonDrawerAtTop();
    },
    [
      closeLessonDrawer,
      curriculumCollapsed,
      fullscreenLessonPanelOpen,
      isCourseContentDrawerLayout,
      lessonDrawer,
      openLessonDrawer,
      openLessonDrawerAtTop,
      setCurriculumCollapsed,
      setCurriculumFocusRequest,
      setFullscreenCurriculumFocusRequest,
      setFullscreenLessonPanelOpen,
      setLessonDrawer,
      setLessonDrawerForcedFloating,
    ],
  );

  const handleMobileLandscapeFullscreenChange = useCallback(
    (active: boolean) => {
      setMobileLandscapeFullscreen(active);
      if (!active) setFullscreenLessonPanelOpen(false);
    },
    [setFullscreenLessonPanelOpen, setMobileLandscapeFullscreen],
  );

  const closeFullscreenLessonPanel = useCallback(() => {
    setFullscreenVideoWidthPreviewPercent(null);
    setFullscreenLessonPanelOpen(false);
  }, [setFullscreenLessonPanelOpen, setFullscreenVideoWidthPreviewPercent]);

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
    previousFocusRef,
    setCurriculumCollapsed,
    setLessonDrawer,
    setLessonDrawerCollapsedSnapPoint,
    setLessonDrawerFocusRequest,
    setLessonDrawerForcedFloating,
    setLessonDrawerScrollTarget,
    setLessonDrawerSnapPoint,
    setLessonDrawerViewportBounds,
  ]);

  const lessonDrawerHeroControlProps = useLessonDrawerHeroControl({
    open: lessonDrawer,
    expanded: lessonDrawerSnapPoint === 1,
    onExpand: () => setLessonDrawerSnapPoint(1),
    onCollapse: () => setLessonDrawerSnapPoint(lessonDrawerCollapsedSnapPoint),
    onClose: closeLessonDrawer,
  });
  const handleLessonDrawerTouchStartCapture = useStickyBarSheetDrag(
    lessonDrawerScrollportRef,
    phoneLessonDrawer,
  );

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
    lessonDrawerSkipFinalFocusRef,
    playerWrapRef,
    setLessonDrawer,
    setLessonDrawerCollapsedSnapPoint,
    setLessonDrawerForcedFloating,
    setLessonDrawerSnapPoint,
    setLessonDrawerViewportBounds,
  ]);
  return {
    toggleTheaterMode,
    openLessonDrawer,
    openLessonDrawerInPlace,
    closeLessonDrawer,
    toggleLessonDrawerFromPlayer,
    handleMobileLandscapeFullscreenChange,
    closeFullscreenLessonPanel,
    openFloatingLessonDrawer,
    lessonDrawerHeroControlProps,
    handleLessonDrawerTouchStartCapture,
  };
}
