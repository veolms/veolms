import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

const SWIPE_ACTIVATION_DISTANCE = 10;
const SWIPE_DIRECTION_RATIO = 1.15;
const SWIPE_MIN_FLING_DISTANCE = 24;
const SWIPE_FLING_VELOCITY = 0.42;
const SWIPE_SETTLE_DURATION = 240;

const TAB_SWIPE_EXCLUSION_SELECTOR = [
  ".app-slider",
  'input[type="range"]',
  '[role="slider"]',
  "progress",
  '[role="progressbar"]',
  "video",
  ".youtube-player",
  "[data-tab-swipe-ignore]",
].join(",");

const TAB_SWIPE_EDITING_SELECTOR = [
  'input:not([type="range"])',
  "textarea",
  "select",
  '[role="textbox"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

type SwipeAxis = "pending" | "horizontal";

interface TabSwipeGesture<T extends string> {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  offset: number;
  axis: SwipeAxis;
  targetTab: T | null;
  editingTarget: HTMLElement | null;
}

interface SwipeableTabPanelProps<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabListRef: RefObject<HTMLElement | null>;
  id: string;
  labelledBy: string;
  className?: string;
  stateAttribute?: `data-${string}`;
  children: (tab: T, preview: boolean) => ReactNode;
}

const isSwipeExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(TAB_SWIPE_EXCLUSION_SELECTOR));

const getSwipeEditingTarget = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>(TAB_SWIPE_EDITING_SELECTOR)
    : null;

export const getAdjacentTab = <T extends string>(
  tabs: readonly T[],
  activeTab: T,
  direction: -1 | 1,
): T | null => {
  const activeIndex = tabs.indexOf(activeTab);
  return tabs[activeIndex + direction] ?? null;
};

export const shouldCompleteTabSwipe = ({
  distance,
  velocity,
  width,
}: {
  distance: number;
  velocity: number;
  width: number;
}) => {
  const distanceThreshold = Math.min(116, width * 0.24);
  const travelledFarEnough = Math.abs(distance) >= distanceThreshold;
  const fastFling =
    Math.abs(distance) >= SWIPE_MIN_FLING_DISTANCE &&
    Math.abs(velocity) >= SWIPE_FLING_VELOCITY &&
    Math.sign(velocity) === Math.sign(distance);
  return travelledFarEnough || fastFling;
};

const readTabGeometry = (tabList: HTMLElement, tab: string) => {
  const button = Array.from(
    tabList.querySelectorAll<HTMLElement>("[data-swipe-tab-id]"),
  ).find((candidate) => candidate.dataset.swipeTabId === tab);
  if (!button) return null;
  const style = getComputedStyle(button);
  const indicatorToken = style
    .getPropertyValue("--page-tab-active-indicator")
    .trim();
  const color = indicatorToken.includes("--page-tab-tone")
    ? style.getPropertyValue("--page-tab-tone").trim()
    : indicatorToken.includes("--accent")
      ? style.getPropertyValue("--accent").trim()
      : indicatorToken;
  return {
    left: button.offsetLeft,
    width: button.offsetWidth,
    color: color || "var(--accent)",
  };
};

const writeIndicatorGeometry = (
  tabList: HTMLElement,
  geometry: { left: number; width: number; color: string },
) => {
  tabList.style.setProperty("--page-tab-indicator-left", `${geometry.left}px`);
  tabList.style.setProperty(
    "--page-tab-indicator-width",
    `${geometry.width}px`,
  );
  tabList.style.setProperty("--page-tab-indicator-color", geometry.color);
};

export function SwipeableTabPanel<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  tabListRef,
  id,
  labelledBy,
  className = "",
  stateAttribute,
  children,
}: SwipeableTabPanelProps<T>) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<TabSwipeGesture<T> | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const pendingDestinationRef = useRef<T | null>(null);
  const consumedSwipeRef = useRef(false);
  const onTabChangeRef = useRef(onTabChange);
  const activeTabRef = useRef(activeTab);
  const activePropRef = useRef(activeTab);
  const [renderedTab, setRenderedTab] = useState(activeTab);
  const [settling, setSettling] = useState(false);

  onTabChangeRef.current = onTabChange;
  activePropRef.current = activeTab;

  const setSurfaceOffset = useCallback((offset: number) => {
    surfaceRef.current?.style.setProperty("--tab-swipe-offset", `${offset}px`);
  }, []);

  const updateIndicator = useCallback(
    (targetTab: T | null = null, progress = 0, tracking = false) => {
      const tabList = tabListRef.current;
      if (!tabList) return;
      const activeGeometry = readTabGeometry(tabList, activeTabRef.current);
      if (!activeGeometry) return;
      const targetGeometry = targetTab
        ? readTabGeometry(tabList, targetTab)
        : null;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const geometry = targetGeometry
        ? {
            left:
              activeGeometry.left +
              (targetGeometry.left - activeGeometry.left) * clampedProgress,
            width:
              activeGeometry.width +
              (targetGeometry.width - activeGeometry.width) * clampedProgress,
            color:
              clampedProgress >= 0.5
                ? targetGeometry.color
                : activeGeometry.color,
          }
        : activeGeometry;
      tabList.toggleAttribute("data-tab-swipe-tracking", tracking);
      writeIndicatorGeometry(tabList, geometry);
    },
    [tabListRef],
  );

  const resetVisualState = useCallback(
    (tab: T) => {
      const surface = surfaceRef.current;
      activeTabRef.current = tab;
      setRenderedTab(tab);
      setSurfaceOffset(0);
      surface?.removeAttribute("data-tab-swipe-active");
      surface?.removeAttribute("data-tab-swipe-settling");
      tabListRef.current?.removeAttribute("data-tab-swipe-active");
      tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
      setSettling(false);
      requestAnimationFrame(() => updateIndicator());
    },
    [setSurfaceOffset, tabListRef, updateIndicator],
  );

  useLayoutEffect(() => {
    updateIndicator();
  }, [renderedTab, updateIndicator]);

  useLayoutEffect(() => {
    const pendingDestination = pendingDestinationRef.current;
    if (pendingDestination === activeTab) {
      pendingDestinationRef.current = null;
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
      resetVisualState(activeTab);
      return;
    }
    if (
      pendingDestination === null &&
      gestureRef.current === null &&
      !settling &&
      renderedTab !== activeTab
    ) {
      resetVisualState(activeTab);
    }
  }, [activeTab, renderedTab, resetVisualState, settling]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => updateIndicator());
    observer.observe(tabList);
    return () => observer.disconnect();
  }, [tabListRef, updateIndicator]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
      pendingDestinationRef.current = null;
      surfaceRef.current?.removeAttribute("data-tab-swipe-active");
      surfaceRef.current?.removeAttribute("data-tab-swipe-settling");
      tabListRef.current?.removeAttribute("data-tab-swipe-active");
      tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
    },
    [tabListRef],
  );

  const finishSettle = useCallback(
    (destination: T | null) => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(
        () => {
          settleTimerRef.current = null;
          if (!destination) {
            resetVisualState(activeTabRef.current);
            return;
          }

          pendingDestinationRef.current = destination;
          onTabChangeRef.current(destination);
          navigationTimerRef.current = window.setTimeout(() => {
            if (pendingDestinationRef.current !== destination) return;
            pendingDestinationRef.current = null;
            navigationTimerRef.current = null;
            resetVisualState(activePropRef.current);
          }, 500);
        },
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : SWIPE_SETTLE_DURATION,
      );
    },
    [resetVisualState],
  );

  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const editingTarget = getSwipeEditingTarget(event.target);
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      gestureRef.current ||
      settling ||
      isSwipeExcludedTarget(event.target) ||
      editingTarget === document.activeElement
    )
      return;

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      offset: 0,
      axis: "pending",
      targetTab: null,
      editingTarget,
    };
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (gesture.axis === "pending") {
      if (
        verticalDistance >= SWIPE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * SWIPE_DIRECTION_RATIO
      ) {
        gestureRef.current = null;
        return;
      }
      if (horizontalDistance < SWIPE_ACTIVATION_DISTANCE) return;
      if (horizontalDistance <= verticalDistance * SWIPE_DIRECTION_RATIO)
        return;
      gesture.axis = "horizontal";
      gesture.editingTarget?.blur();
      consumedSwipeRef.current = true;
      event.currentTarget.setAttribute("data-tab-swipe-active", "");
      tabListRef.current?.setAttribute("data-tab-swipe-active", "");
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    const direction: -1 | 1 = deltaX < 0 ? 1 : -1;
    const targetTab = getAdjacentTab(tabs, renderedTab, direction);
    const width = Math.max(1, event.currentTarget.clientWidth);
    const offset = targetTab
      ? Math.max(-width, Math.min(width, deltaX))
      : deltaX * 0.16;
    const timestamp = Math.max(
      event.timeStamp || performance.now(),
      gesture.lastTimestamp + 1,
    );
    const elapsed = timestamp - gesture.lastTimestamp;
    const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed;
    gesture.velocityX =
      gesture.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : gesture.velocityX * 0.35 + instantaneousVelocity * 0.65;
    gesture.lastX = event.clientX;
    gesture.lastTimestamp = timestamp;
    gesture.offset = offset;
    gesture.targetTab = targetTab;

    setSurfaceOffset(offset);
    updateIndicator(targetTab, Math.abs(offset) / width, true);
  };

  const endSwipe = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may release capture before pointercancel is dispatched.
    }
    if (gesture.axis !== "horizontal") return;

    const width = Math.max(1, event.currentTarget.clientWidth);
    const averageVelocity =
      gesture.offset /
      Math.max(1, (event.timeStamp || performance.now()) - gesture.startedAt);
    const velocity =
      Math.abs(gesture.velocityX) > Math.abs(averageVelocity)
        ? gesture.velocityX
        : averageVelocity;
    const destination =
      !cancelled &&
      gesture.targetTab &&
      shouldCompleteTabSwipe({
        distance: gesture.offset,
        velocity,
        width,
      })
        ? gesture.targetTab
        : null;

    tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
    setSettling(true);
    event.currentTarget.setAttribute("data-tab-swipe-settling", "");
    requestAnimationFrame(() => {
      setSurfaceOffset(destination ? Math.sign(gesture.offset) * width : 0);
      updateIndicator(destination, destination ? 1 : 0, false);
      finishSettle(destination);
    });
  };

  const dataState = stateAttribute
    ? ({ [stateAttribute]: renderedTab } as Record<string, string>)
    : {};
  const previousTab = getAdjacentTab(tabs, renderedTab, -1);
  const nextTab = getAdjacentTab(tabs, renderedTab, 1);

  return (
    <div
      ref={surfaceRef}
      id={id}
      className={`swipeable-tab-panel${className ? ` ${className}` : ""}`}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-sidebar-swipe-ignore
      {...dataState}
      style={{ "--tab-swipe-offset": "0px" } as CSSProperties}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={(event) => endSwipe(event, true)}
      onClickCapture={(event) => {
        if (!consumedSwipeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(() => {
          consumedSwipeRef.current = false;
        }, 0);
      }}
    >
      <div className="swipeable-tab-panel__layer is-current">
        {children(renderedTab, false)}
      </div>
      {previousTab && (
        <div
          className="swipeable-tab-panel__layer is-preview is-previous"
          aria-hidden="true"
          inert
        >
          {children(previousTab, true)}
        </div>
      )}
      {nextTab && (
        <div
          className="swipeable-tab-panel__layer is-preview is-next"
          aria-hidden="true"
          inert
        >
          {children(nextTab, true)}
        </div>
      )}
    </div>
  );
}
