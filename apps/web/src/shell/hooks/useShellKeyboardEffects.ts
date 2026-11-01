import {
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { ensureAcademyPaletteCatalogStylesheet } from "../academyPaletteStyles";
import {
  MOBILE_NAV_HIDE_SCROLL_THRESHOLD,
  MOBILE_NAV_SHOW_SCROLL_THRESHOLD,
  MOBILE_NAV_USER_SCROLL_GLIDE_MS,
  MOBILE_NAV_USER_SCROLL_STEP_MS,
  MOBILE_NAV_PLAYER_SELECTOR,
  MOBILE_NAV_TOP_GUARD,
} from "../academyShellConstants";
import type { SidebarResize } from "../academyShellTypes";

export interface UseShellKeyboardEffectsArgs {
  page: string;
  setSidebarResizing: Dispatch<SetStateAction<boolean>>;
  setSidebarResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  setSidebarOverlaySwipeOffset: Dispatch<SetStateAction<number | null>>;
  compactNavigation: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setPalettePreviewTheme: Dispatch<SetStateAction<string | null>>;
  mobileSidebarNavigationActive: boolean;
  showSidebarAppearanceControl: boolean;
  showSidebarThemeIcon: boolean;
  paletteMenu: boolean;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobilePaletteMenu: boolean;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  setMobileBottomNavHidden: Dispatch<SetStateAction<boolean>>;
  mobileBottomNavRef: RefObject<HTMLElement | null>;
  sidebarResizeRef: RefObject<SidebarResize | null>;
}

export function useShellKeyboardEffects({
  page,
  setSidebarResizing,
  setSidebarResizePreviewWidth,
  setSidebarOverlaySwipeOffset,
  compactNavigation,
  setEdgeSidebarOpen,
  setPalettePreviewTheme,
  mobileSidebarNavigationActive,
  showSidebarAppearanceControl,
  showSidebarThemeIcon,
  paletteMenu,
  setPaletteMenu,
  setReadingModeMenu,
  setSettingsQuickMenu,
  mobileMenuOpen,
  setMobileMenuOpen,
  mobilePaletteMenu,
  setMobilePaletteMenu,
  setMobileBottomNavHidden,
  mobileBottomNavRef,
  sidebarResizeRef,
}: UseShellKeyboardEffectsArgs) {
  useEffect(() => {
    setMobileBottomNavHidden(false);
    if (!compactNavigation) return undefined;

    type ScrollSource = Document | Element;

    const rootScrollTop = () =>
      Math.max(
        0,
        document.scrollingElement?.scrollTop ??
          document.documentElement.scrollTop,
      );
    const resolveScrollSource = (target: EventTarget | null): ScrollSource => {
      if (
        target instanceof Element &&
        target !== document.documentElement &&
        target !== document.body
      ) {
        return target;
      }
      return document;
    };
    const readScrollTop = (source: ScrollSource) =>
      source instanceof Element
        ? Math.max(0, source.scrollTop)
        : rootScrollTop();

    const scrollPositions = new Map<ScrollSource, number>([
      [document, rootScrollTop()],
    ]);
    let pendingScrollSource: ScrollSource = document;
    let direction: -1 | 0 | 1 = 0;
    let directionalTravel = 0;
    let frame: number | null = null;
    // Only scrolling the visitor does hides or shows the menu: a finger on
    // the screen (and the glide after it), the wheel, the keys, the
    // scrollbar. A page that is switched, or has its place put back, also
    // changes the scroll position, and the menu would drop away and come
    // back for it (a lesson minimized onto a page that was scrolled).
    let fingerDown = false;
    let userScrollUntil = 0;
    const holdUserScroll = (ms: number) => {
      userScrollUntil = Math.max(userScrollUntil, performance.now() + ms);
    };
    // A finger on the lesson's player is moving the player (minimizing it,
    // or dragging the mini window), not scrolling the page.
    const startUserScroll = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(MOBILE_NAV_PLAYER_SELECTOR)
      ) {
        return;
      }
      fingerDown = true;
    };
    const endUserScroll = () => {
      if (!fingerDown) return;
      fingerDown = false;
      holdUserScroll(MOBILE_NAV_USER_SCROLL_GLIDE_MS);
    };
    const markWheelScroll = () =>
      holdUserScroll(MOBILE_NAV_USER_SCROLL_STEP_MS);
    const isUserScroll = () => {
      if (fingerDown) return true;
      if (performance.now() >= userScrollUntil) return false;
      // A glide keeps going for as long as it keeps scrolling.
      holdUserScroll(MOBILE_NAV_USER_SCROLL_STEP_MS);
      return true;
    };

    const revealNavigation = () => {
      direction = 0;
      directionalTravel = 0;
      setMobileBottomNavHidden(false);
    };

    const updateFromScroll = () => {
      frame = null;
      const nextScrollTop = readScrollTop(pendingScrollSource);
      const previousScrollTop = scrollPositions.get(pendingScrollSource) ?? 0;
      const delta = nextScrollTop - previousScrollTop;
      scrollPositions.set(pendingScrollSource, nextScrollTop);

      if (
        mobileMenuOpen ||
        nextScrollTop <= MOBILE_NAV_TOP_GUARD ||
        mobileBottomNavRef.current?.querySelector(":focus-visible")
      ) {
        revealNavigation();
        return;
      }

      if (Math.abs(delta) < 1 || !isUserScroll()) return;
      const nextDirection = delta > 0 ? 1 : -1;
      if (nextDirection !== direction) {
        direction = nextDirection;
        directionalTravel = 0;
      }
      directionalTravel += Math.abs(delta);

      if (
        direction === 1 &&
        nextScrollTop > MOBILE_NAV_HIDE_SCROLL_THRESHOLD &&
        directionalTravel >= MOBILE_NAV_HIDE_SCROLL_THRESHOLD
      ) {
        directionalTravel = 0;
        setMobileBottomNavHidden(true);
      } else if (
        direction === -1 &&
        directionalTravel >= MOBILE_NAV_SHOW_SCROLL_THRESHOLD
      ) {
        directionalTravel = 0;
        setMobileBottomNavHidden(false);
      }
    };

    const handleScroll = (event: Event) => {
      pendingScrollSource = resolveScrollSource(event.target);
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateFromScroll);
    };
    const handleKeyboardNavigation = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" ||
        event.key === "Home" ||
        event.key === "PageUp" ||
        event.key === "ArrowUp"
      ) {
        revealNavigation();
      }
      if (
        event.key === " " ||
        event.key === "PageDown" ||
        event.key === "PageUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "End" ||
        event.key === "Home"
      ) {
        holdUserScroll(MOBILE_NAV_USER_SCROLL_GLIDE_MS);
      }
    };

    document.addEventListener("touchstart", startUserScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", endUserScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", endUserScroll, {
      capture: true,
      passive: true,
    });
    // A mouse or pen on a scrollbar.
    document.addEventListener("pointerdown", startUserScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerup", endUserScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("wheel", markWheelScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("touchstart", startUserScroll, true);
      document.removeEventListener("touchend", endUserScroll, true);
      document.removeEventListener("touchcancel", endUserScroll, true);
      document.removeEventListener("pointerdown", startUserScroll, true);
      document.removeEventListener("pointerup", endUserScroll, true);
      document.removeEventListener("wheel", markWheelScroll, true);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyboardNavigation);
    };
  }, [
    compactNavigation,
    mobileMenuOpen,
    page,
    mobileBottomNavRef,
    setMobileBottomNavHidden,
  ]);

  useEffect(() => {
    if (!compactNavigation) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
      setSettingsQuickMenu((current) =>
        current === "mobile" ? null : current,
      );
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
    }
  }, [
    compactNavigation,
    setMobileMenuOpen,
    setMobilePaletteMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
  ]);

  useEffect(() => {
    if (!compactNavigation) return;

    if (mobileSidebarNavigationActive) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
      setSettingsQuickMenu((current) =>
        current === "mobile" ? null : current,
      );
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
      return;
    }

    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    setSidebarResizePreviewWidth(null);
    setSidebarOverlaySwipeOffset(null);
    setEdgeSidebarOpen(false);
    setMobileBottomNavHidden(false);
  }, [
    compactNavigation,
    mobileSidebarNavigationActive,
    setEdgeSidebarOpen,
    setMobileBottomNavHidden,
    setMobileMenuOpen,
    setMobilePaletteMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    setSidebarOverlaySwipeOffset,
    setSidebarResizePreviewWidth,
    setSidebarResizing,
    sidebarResizeRef,
  ]);

  useEffect(() => {
    if (paletteMenu || mobilePaletteMenu) {
      void ensureAcademyPaletteCatalogStylesheet().catch(() => undefined);
    }
    if (!paletteMenu && !mobilePaletteMenu) setPalettePreviewTheme(null);
  }, [mobilePaletteMenu, paletteMenu, setPalettePreviewTheme]);

  useEffect(() => {
    if (showSidebarThemeIcon || showSidebarAppearanceControl) return;
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
  }, [
    showSidebarAppearanceControl,
    showSidebarThemeIcon,
    setMobilePaletteMenu,
    setPaletteMenu,
    setPalettePreviewTheme,
  ]);
}
