import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  getLearningPlayerSwipeSplitX,
  isFullLearningPlayerSwipeTarget,
} from "../../gestures/pointerGestureOwnership";
import { useSecondPressHold } from "../../gestures/useSecondPressHold";
import type { CourseRole } from "../../courses/catalogue";
import {
  getMobileOverflowNavigation,
  getMobilePrimaryNavigation,
  type NavigationItem,
} from "../navigation";
import type { NavigationItemWithMetadata } from "../navigation";
import { SIDEBAR_MIN_WIDTH } from "../sidebarPreferences";
import type { SidebarMode } from "../../settings/settingsPreferences";
import {
  SIDEBAR_BRAND_DOUBLE_TAP_MS,
  SIDEBAR_BRAND_DOUBLE_TAP_DISTANCE,
} from "../academyShellConstants";
import type {
  PointerPositionEvent,
  SidebarScreenSwipeStartEvent,
} from "../academyShellTypes";

export interface UseSidebarControlsArgs {
  /** A click on the logo: the home page, as on most sites. */
  onLogoPress: () => void;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarWidth: number;
  compactNavigation: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarMaxWidth: number;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  effectiveRole: CourseRole;
  coursesAppRef: RefObject<HTMLDivElement | null>;
  activeNavigationSection: string | null;
  isNavigationItemActive: (item: NavigationItemWithMetadata) => boolean;
  sidebarScreenSwipeStartRef: RefObject<
    ((event: SidebarScreenSwipeStartEvent) => void) | null
  >;
  sidebarResizeMoveRef: RefObject<
    ((event: PointerPositionEvent) => void) | null
  >;
  sidebarResizeFinishRef: RefObject<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >;
  navigation: NavigationItem[];
  sidebarCollapsed: boolean;
  sidebarHidden: boolean;
  commitSidebarWidth: (value: number) => void;
  moveSidebarResize: (event: PointerPositionEvent) => void;
  endSidebarResize: (event: PointerPositionEvent, cancelled?: boolean) => void;
}

export interface UseSidebarControlsResult {
  handleSidebarResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  toggleSidebarWidth: () => void;
  sidebarToggleGesture: ReturnType<
    typeof useSecondPressHold<HTMLButtonElement>
  >;
  sidebarLogoGesture: ReturnType<typeof useSecondPressHold<HTMLSpanElement>>;
  handleSidebarBrandPress: (event: ReactPointerEvent<HTMLElement>) => void;
  preventSidebarBrandTextSelection: (
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
  mobileNavigation: NavigationItem[];
  mobileMoreNavigation: NavigationItem[];
  mobileMoreActive: boolean;
}

export function useSidebarControls({
  onLogoPress,
  setSidebarMode,
  sidebarWidth,
  compactNavigation,
  setEdgeSidebarOpen,
  sidebarMaxWidth,
  setPaletteMenu,
  effectiveRole,
  coursesAppRef,
  activeNavigationSection,
  isNavigationItemActive,
  sidebarScreenSwipeStartRef,
  sidebarResizeMoveRef,
  sidebarResizeFinishRef,
  navigation,
  sidebarCollapsed,
  sidebarHidden,
  commitSidebarWidth,
  moveSidebarResize,
  endSidebarResize,
}: UseSidebarControlsArgs): UseSidebarControlsResult {
  sidebarResizeMoveRef.current = moveSidebarResize;
  sidebarResizeFinishRef.current = endSidebarResize;

  useEffect(() => {
    const startResizeFromHostedPlayer = (event: PointerEvent) => {
      const app = coursesAppRef.current;
      const player = document.querySelector(".learning-workspace__player-wrap");
      if (
        !app ||
        !player ||
        !isFullLearningPlayerSwipeTarget(event.target, event, player)
      )
        return;

      sidebarScreenSwipeStartRef.current?.({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        target: event.target,
        handle: app,
        splitX: getLearningPlayerSwipeSplitX(player),
      });
    };
    const continueResize = (event: PointerEvent) =>
      sidebarResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event, true);
    window.addEventListener("pointerdown", startResizeFromHostedPlayer, true);
    window.addEventListener("pointermove", continueResize, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishResize, true);
    window.addEventListener("pointercancel", cancelResize, true);
    return () => {
      window.removeEventListener(
        "pointerdown",
        startResizeFromHostedPlayer,
        true,
      );
      window.removeEventListener("pointermove", continueResize, true);
      window.removeEventListener("pointerup", finishResize, true);
      window.removeEventListener("pointercancel", cancelResize, true);
    };
  }, [
    coursesAppRef,
    sidebarResizeFinishRef,
    sidebarResizeMoveRef,
    sidebarScreenSwipeStartRef,
  ]);

  const handleSidebarResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (sidebarCollapsed && event.key === "ArrowRight") {
        setSidebarMode("expanded");
        commitSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (sidebarCollapsed && event.key === "ArrowLeft") {
        setSidebarMode("hidden");
        setPaletteMenu(false);
        setEdgeSidebarOpen(false);
      } else if (!sidebarCollapsed) {
        commitSidebarWidth(
          sidebarWidth + (event.key === "ArrowRight" ? 16 : -16),
        );
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      commitSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      commitSidebarWidth(sidebarMaxWidth);
    }
  };

  const toggleSidebarWidth = () => {
    if (compactNavigation) {
      setEdgeSidebarOpen(false);
      return;
    }
    setSidebarMode((current) =>
      current === "expanded" ? "collapsed" : "expanded",
    );
    setPaletteMenu(false);
    setEdgeSidebarOpen(false);
  };

  const floatSidebar = useCallback(() => {
    setSidebarMode("hidden");
    setPaletteMenu(false);
    setEdgeSidebarOpen(true);
  }, [setPaletteMenu, setEdgeSidebarOpen, setSidebarMode]);

  const sidebarToggleGesture = useSecondPressHold<HTMLButtonElement>({
    onPress: toggleSidebarWidth,
    onSecondPressHold: floatSidebar,
    deferFirstPress: compactNavigation,
    secondPressWindow: compactNavigation ? 700 : undefined,
  });
  // A click opens the home page; a click and then a press held floats the
  // sidebar (the hold's own click does not count as a press).
  const sidebarLogoGesture = useSecondPressHold<HTMLSpanElement>({
    onPress: onLogoPress,
    onSecondPressHold: floatSidebar,
  });

  // Two presses on the brand, close together in time and place, float the
  // sidebar (or dock it again). They are counted here, as the pointer is
  // lifted, and not left to the browser's double click, which never came
  // for the logo itself: the logo takes hold of the pointer on a second
  // press (held, that press floats the sidebar too), and a press that is
  // taken hold of ends without a click. So it worked in the gaps around the
  // letters and nowhere on them.
  // The presses are taken on the brand and on the band behind it (see
  // `data-sidebar-brand-zone`), which runs the sidebar's whole width from
  // its top to just under the logo, so there is no need to aim.
  const sidebarBrandTapRef = useRef<{
    x: number;
    y: number;
    at: number;
  } | null>(null);
  const handleSidebarBrandPress = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      (event.target as Element).closest(".sidebar-collapse")
    ) {
      sidebarBrandTapRef.current = null;
      return;
    }
    const previous = sidebarBrandTapRef.current;
    const tap = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    if (
      !previous ||
      tap.at - previous.at > SIDEBAR_BRAND_DOUBLE_TAP_MS ||
      Math.hypot(tap.x - previous.x, tap.y - previous.y) >
        SIDEBAR_BRAND_DOUBLE_TAP_DISTANCE
    ) {
      sidebarBrandTapRef.current = tap;
      return;
    }
    sidebarBrandTapRef.current = null;
    const shouldFloat = !sidebarHidden;
    setSidebarMode(shouldFloat ? "hidden" : "expanded");
    setPaletteMenu(false);
    setEdgeSidebarOpen(shouldFloat);
  };

  const preventSidebarBrandTextSelection = (
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (
      event.detail > 1 &&
      !(event.target as Element).closest(".sidebar-collapse")
    ) {
      event.preventDefault();
    }
  };

  const mobileNavigation = getMobilePrimaryNavigation(
    effectiveRole,
    navigation,
  );
  const mobileMoreNavigation = getMobileOverflowNavigation(
    navigation,
    mobileNavigation,
  );
  const mobileMoreActive = Boolean(
    activeNavigationSection &&
    mobileMoreNavigation.some(isNavigationItemActive),
  );
  return {
    handleSidebarResizeKeyDown,
    toggleSidebarWidth,
    sidebarToggleGesture,
    sidebarLogoGesture,
    handleSidebarBrandPress,
    preventSidebarBrandTextSelection,
    mobileNavigation,
    mobileMoreNavigation,
    mobileMoreActive,
  };
}
