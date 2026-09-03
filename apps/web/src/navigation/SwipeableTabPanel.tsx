import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import "./SwipeableTabPanel.css";

const TAB_VISIBILITY_INSET = 12;
const TAB_SWIPE_MAX_COMPLETION_DISTANCE = 116;
const TAB_SWIPE_MAX_COMPLETION_RATIO = 0.24;

const TAB_SWIPE_NO_SWIPING_SELECTOR = [
  ".swiper-no-swiping",
  ".app-slider",
  'input[type="range"]',
  '[role="slider"]',
  "progress",
  '[role="progressbar"]',
  "video",
  ".youtube-player",
  "[data-tab-swipe-ignore]",
  "[draggable='true']",
  "[data-drag-handle]",
  ".drag-handle",
  ".curriculum-drag-handle",
  ".ProseMirror",
  ".tiptap",
  ".rich-text-editor",
].join(",");

const TAB_SWIPE_EDITABLE_SELECTOR = [
  'input:not([type="range"])',
  "textarea",
  "select",
  '[role="textbox"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

const getEditableTarget = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>(TAB_SWIPE_EDITABLE_SELECTOR)
    : null;

const syncAdjacentSlideSpacing = (
  swiper: SwiperInstance,
  customSpaceBetween?: number,
) => {
  if (customSpaceBetween !== undefined) {
    const changed = swiper.params.spaceBetween !== customSpaceBetween;
    swiper.params.spaceBetween = customSpaceBetween;
    return changed;
  }
  const slide = swiper.el.querySelector<HTMLElement>(".swiper-slide");
  if (!slide) return false;

  const style = getComputedStyle(slide);
  const inlineStart = Math.max(
    0,
    Number.parseFloat(style.paddingInlineStart || style.paddingLeft) || 0,
  );
  const inlineEnd = Math.max(
    0,
    Number.parseFloat(style.paddingInlineEnd || style.paddingRight) || 0,
  );
  const spaceBetween = -Math.min(inlineStart, inlineEnd);
  const changed = swiper.params.spaceBetween !== spaceBetween;

  swiper.params.spaceBetween = spaceBetween;
  return changed;
};

const syncSwipeCompletionRatio = (swiper: SwiperInstance) => {
  const width = swiper.size || swiper.el.clientWidth;
  const ratio =
    width > 0
      ? Math.min(
          TAB_SWIPE_MAX_COMPLETION_RATIO,
          TAB_SWIPE_MAX_COMPLETION_DISTANCE / width,
        )
      : TAB_SWIPE_MAX_COMPLETION_RATIO;
  swiper.params.longSwipesRatio = ratio;
};

interface SwipeableTabPanelProps<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabListRef: RefObject<HTMLElement | null>;
  id: string;
  labelledBy: string;
  className?: string;
  slideClassName?: string;
  stateAttribute?: `data-${string}`;
  disabled?: boolean;
  spaceBetween?: number;
  onSwipeStart?: () => void;
  children: (tab: T, preview: boolean) => ReactNode;
}

const getNearestTabScrollLeft = ({
  scrollLeft,
  scrollWidth,
  clientWidth,
  viewportLeft,
  viewportRight,
  tabLeft,
  tabRight,
  inset = TAB_VISIBILITY_INSET,
}: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  viewportLeft: number;
  viewportRight: number;
  tabLeft: number;
  tabRight: number;
  inset?: number;
}) => {
  const safeInset = Math.min(inset, clientWidth / 4);
  const visibleLeft = viewportLeft + safeInset;
  const visibleRight = viewportRight - safeInset;
  let nextScrollLeft = scrollLeft;

  if (tabLeft < visibleLeft) {
    nextScrollLeft += tabLeft - visibleLeft;
  } else if (tabRight > visibleRight) {
    nextScrollLeft += tabRight - visibleRight;
  }

  return Math.max(
    0,
    Math.min(Math.max(0, scrollWidth - clientWidth), nextScrollLeft),
  );
};

const scrollTabIntoView = (
  tabList: HTMLElement,
  tab: string,
  behavior: ScrollBehavior,
) => {
  const button = Array.from(
    tabList.querySelectorAll<HTMLElement>("[data-swipe-tab-id]"),
  ).find((candidate) => candidate.dataset.swipeTabId === tab);
  if (!button) return;

  const listBounds = tabList.getBoundingClientRect();
  const tabBounds = button.getBoundingClientRect();
  const left = getNearestTabScrollLeft({
    scrollLeft: tabList.scrollLeft,
    scrollWidth: tabList.scrollWidth,
    clientWidth: tabList.clientWidth,
    viewportLeft: listBounds.left,
    viewportRight: listBounds.right,
    tabLeft: tabBounds.left,
    tabRight: tabBounds.right,
  });
  if (Math.abs(left - tabList.scrollLeft) < 0.5) return;

  if (typeof tabList.scrollTo === "function") {
    tabList.scrollTo({ left, behavior });
  } else {
    tabList.scrollLeft = left;
  }
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
  slideClassName = "",
  stateAttribute,
  disabled = false,
  spaceBetween,
  onSwipeStart,
  children,
}: SwipeableTabPanelProps<T>) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const onTabChangeRef = useRef(onTabChange);
  const activeTabRef = useRef(activeTab);
  const headerClickIndexRef = useRef<number | null>(null);
  const tabPointerTypeRef = useRef<string | null>(null);
  const touchActiveRef = useRef(false);

  onTabChangeRef.current = onTabChange;
  activeTabRef.current = activeTab;

  const updateIndicatorForTab = useCallback(
    (tab: T) => {
      const tabList = tabListRef.current;
      if (!tabList) return;
      const geometry = readTabGeometry(tabList, tab);
      if (geometry) writeIndicatorGeometry(tabList, geometry);
    },
    [tabListRef],
  );

  const revealTab = useCallback(
    (tab: T, behavior: ScrollBehavior) => {
      const tabList = tabListRef.current;
      if (tabList) scrollTabIntoView(tabList, tab, behavior);
    },
    [tabListRef],
  );

  const handleSwiperReady = useCallback(
    (swiper: SwiperInstance) => {
      const spacingChanged = syncAdjacentSlideSpacing(swiper);
      syncSwipeCompletionRatio(swiper);
      swiperRef.current = swiper;
      if (spacingChanged) swiper.updateSlides();
      const activeIndex = tabs.indexOf(activeTabRef.current);
      if (activeIndex >= 0 && swiper.activeIndex !== activeIndex) {
        swiper.slideTo(activeIndex, 0, false);
      }
      updateIndicatorForTab(activeTabRef.current);
    },
    [tabs, updateIndicatorForTab],
  );

  const handleSlideChange = useCallback(
    (swiper: SwiperInstance) => {
      if (touchActiveRef.current) return;
      const destination = tabs[swiper.activeIndex];
      if (!destination) return;

      updateIndicatorForTab(destination);
      revealTab(destination, "smooth");
      if (destination === activeTabRef.current) return;

      if (headerClickIndexRef.current === swiper.activeIndex) {
        headerClickIndexRef.current = null;
        return;
      }
      onTabChangeRef.current(destination);
    },
    [revealTab, tabs, updateIndicatorForTab],
  );

  const handleTouchStart = useCallback((swiper: SwiperInstance) => {
    touchActiveRef.current = true;
    syncSwipeCompletionRatio(swiper);
  }, []);

  const handleTouchEnd = useCallback(() => {
    // Swiper emits touchEnd before selecting the destination slide. The
    // following slideChange can therefore commit without updating mid-drag.
    touchActiveRef.current = false;
  }, []);

  useLayoutEffect(() => {
    updateIndicatorForTab(activeTab);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    const frame = window.requestAnimationFrame(() =>
      revealTab(activeTab, behavior),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, revealTab, updateIndicatorForTab]);

  useLayoutEffect(() => {
    const swiper = swiperRef.current;
    const targetIndex = tabs.indexOf(activeTab);
    if (!swiper || targetIndex < 0) return;
    if (swiper.activeIndex !== targetIndex) {
      swiper.slideTo(targetIndex);
    }
    swiper.updateAutoHeight();
    const frame = window.requestAnimationFrame(() => {
      if (swiperRef.current) {
        swiperRef.current.updateAutoHeight();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, tabs]);

  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      swiper.updateAutoHeight();
    });
    const activeSlide = swiper.slides?.[swiper.activeIndex];
    if (activeSlide) {
      observer.observe(activeSlide);
    }
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList) return undefined;

    const handleTabPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        tabPointerTypeRef.current = null;
        return;
      }
      const tabButton = target.closest<HTMLElement>("[data-swipe-tab-id]");
      tabPointerTypeRef.current =
        tabButton && tabList.contains(tabButton) ? event.pointerType : null;
    };

    const handleTabPointerCancel = () => {
      tabPointerTypeRef.current = null;
    };

    const handleTabClick = (event: MouseEvent) => {
      const pointerType = tabPointerTypeRef.current;
      tabPointerTypeRef.current = null;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tabButton = target.closest<HTMLElement>("[data-swipe-tab-id]");
      if (!tabButton || !tabList.contains(tabButton)) return;
      const tab = tabButton.dataset.swipeTabId as T | undefined;
      const tabIndex = tab ? tabs.indexOf(tab) : -1;
      const swiper = swiperRef.current;
      if (tabIndex < 0 || !swiper || swiper.activeIndex === tabIndex) return;

      headerClickIndexRef.current = tabIndex;
      updateIndicatorForTab(tab!);
      const animate = pointerType === "touch" || pointerType === "pen";
      swiper.slideTo(tabIndex, animate ? swiper.params.speed : 0);
    };

    tabList.addEventListener("pointerdown", handleTabPointerDown, true);
    tabList.addEventListener("pointercancel", handleTabPointerCancel, true);
    tabList.addEventListener("click", handleTabClick, true);
    return () => {
      tabList.removeEventListener("pointerdown", handleTabPointerDown, true);
      tabList.removeEventListener(
        "pointercancel",
        handleTabPointerCancel,
        true,
      );
      tabList.removeEventListener("click", handleTabClick, true);
    };
  }, [tabListRef, tabs, updateIndicatorForTab]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      updateIndicatorForTab(activeTabRef.current);
      revealTab(activeTabRef.current, "auto");
    });
    observer.observe(tabList);
    return () => observer.disconnect();
  }, [revealTab, tabListRef, updateIndicatorForTab]);

  useEffect(
    () => () => {
      swiperRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (swiperRef.current) {
      swiperRef.current.allowTouchMove = !disabled;
    }
  }, [disabled]);

  useEffect(() => {
    if (swiperRef.current && spaceBetween !== undefined) {
      swiperRef.current.params.spaceBetween = spaceBetween;
      swiperRef.current.update();
    }
  }, [spaceBetween]);

  const dataState = stateAttribute
    ? ({ [stateAttribute]: activeTab } as Record<string, string>)
    : {};
  const initialSlide = Math.max(0, tabs.indexOf(activeTab));

  return (
    <div
      id={id}
      className={`swipeable-tab-panel${className ? ` ${className}` : ""}`}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-sidebar-swipe-ignore
      data-learning-swipe-ignore
      onPointerDownCapture={(event) => {
        const editable = getEditableTarget(event.target);
        if (editable && document.activeElement === editable) {
          editable.classList.add("swiper-no-swiping");
        }
      }}
      onBlurCapture={(event) => {
        getEditableTarget(event.target)?.classList.remove("swiper-no-swiping");
      }}
      {...dataState}
    >
      <Swiper
        className="swipeable-tab-panel__swiper"
        slidesPerView={1}
        spaceBetween={spaceBetween}
        autoHeight
        allowTouchMove={!disabled}
        simulateTouch={false}
        longSwipesRatio={TAB_SWIPE_MAX_COMPLETION_RATIO}
        noSwiping
        noSwipingSelector={TAB_SWIPE_NO_SWIPING_SELECTOR}
        threshold={0}
        initialSlide={initialSlide}
        onBeforeInit={(swiper) => {
          swiper.el.dataset.slidesReady = "true";
          syncAdjacentSlideSpacing(swiper, spaceBetween);
        }}
        onBeforeResize={(swiper) => syncAdjacentSlideSpacing(swiper, spaceBetween)}
        onSwiper={handleSwiperReady}
        onTouchStart={handleTouchStart}
        onSliderFirstMove={onSwipeStart}
        onTouchEnd={handleTouchEnd}
        onSlideChange={handleSlideChange}
      >
        {tabs.map((tab) => (
          <SwiperSlide
            key={tab}
            className={slideClassName}
            aria-hidden={tab === activeTab ? undefined : true}
            inert={tab === activeTab ? undefined : true}
          >
            {children(tab, tab !== activeTab)}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
