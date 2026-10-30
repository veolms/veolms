import {
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import type { SidebarMode } from "../../settings/settingsPreferences";
import type { NavigateTo } from "../../routing/navigation";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";
import {
  APPEARANCE_LONG_PRESS_DURATION,
  APPEARANCE_LONG_PRESS_MOVE_TOLERANCE,
} from "../academyShellConstants";
import type { AppearanceOption } from "../academyShellTypes";

export interface UseThemeTransitionGesturesArgs {
  onNavigatePage: NavigateTo;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarMode: SidebarMode;
  edgeSidebarOpen: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setActiveSection: Dispatch<SetStateAction<string>>;
  setCourseMenu: Dispatch<SetStateAction<string | null>>;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setPendingMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setPendingProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  profileRef: RefObject<HTMLDivElement | null>;
  revertPalettePreviewRef: RefObject<
    ((origin?: ThemeRevealOrigin) => void) | null
  >;
  activateAppearanceOptionRef: RefObject<
    | ((
        option: AppearanceOption,
        mobile?: boolean,
        source?: "appearance" | "theme",
      ) => void)
    | null
  >;
  acknowledgeLongPressRef: RefObject<(() => void) | null>;
  toggleSettingsNavigationRef: RefObject<(() => void) | null>;
  toggleAppearanceRef: RefObject<(() => void) | null>;
  dockLongPressConsumedUntilRef: RefObject<number>;
}

export function useThemeTransitionGestures({
  onNavigatePage,
  setSidebarMode,
  sidebarMode,
  edgeSidebarOpen,
  setEdgeSidebarOpen,
  setActiveSection,
  setCourseMenu,
  setProfileMenu,
  setPaletteMenu,
  setReadingModeMenu,
  setSettingsQuickMenu,
  setMobileMenuOpen,
  setPendingMobileMenuOpen,
  setPendingProfileMenuOpen,
  setMobilePaletteMenu,
  profileRef,
  revertPalettePreviewRef,
  activateAppearanceOptionRef,
  acknowledgeLongPressRef,
  toggleSettingsNavigationRef,
  toggleAppearanceRef,
  dockLongPressConsumedUntilRef,
}: UseThemeTransitionGesturesArgs) {
  useEffect(() => {
    let transitionPointer: {
      pointerId: number;
      kind: "palette" | "mode";
      key: string | null;
      startX: number;
      startY: number;
      longPressTimer: number | null;
      longPressModeControl: boolean;
      longPressActivated: boolean;
    } | null = null;
    let suppressNextModeClick = false;
    let resetSuppressedModeClickTimer: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let hasLastPointerPosition = false;
    const root = document.documentElement;
    const getThemeTransitionKind = (): "palette" | "mode" | null => {
      const kind = root.dataset.themeTransition;
      return kind === "palette" || kind === "mode" ? kind : null;
    };
    const findTransitionControlAt = (
      x: number,
      y: number,
      kind: "palette" | "mode",
    ) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          kind === "palette"
            ? "[data-theme-swatch]"
            : "[data-appearance-mode-toggle], [data-appearance-mode-option]",
        ),
      ).find((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      });
    const findAppearanceModeControlAt = (x: number, y: number) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "[data-appearance-mode-toggle]",
        ),
      ).find((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      });
    const openAppearancePaletteFromControl = (control: HTMLButtonElement) =>
      activateAppearanceOptionRef.current?.(
        "theme",
        control.hasAttribute("data-mobile-palette-trigger"),
        "appearance",
      );
    const clearTransitionLongPress = (
      press: NonNullable<typeof transitionPointer>,
    ) => {
      if (press.longPressTimer !== null) {
        window.clearTimeout(press.longPressTimer);
        press.longPressTimer = null;
      }
    };
    const suppressNextModeClickOnce = () => {
      suppressNextModeClick = true;
      if (resetSuppressedModeClickTimer !== null) {
        window.clearTimeout(resetSuppressedModeClickTimer);
      }
      resetSuppressedModeClickTimer = window.setTimeout(() => {
        suppressNextModeClick = false;
        resetSuppressedModeClickTimer = null;
      }, 0);
    };
    const getTransitionControlKey = (
      button: HTMLButtonElement,
      kind: "palette" | "mode",
    ) =>
      kind === "palette"
        ? (button.dataset.themeSwatch ?? null)
        : (button.dataset.appearanceModeOption ?? "mode");
    const syncTransitionControlCursor = (x: number, y: number) => {
      const kind = getThemeTransitionKind();
      const overTransitionControl =
        kind !== null && Boolean(findTransitionControlAt(x, y, kind));
      if (overTransitionControl) {
        if (root.dataset.themeControlCursor !== "pointer") {
          root.dataset.themeControlCursor = "pointer";
        }
      } else if (root.dataset.themeControlCursor) {
        delete root.dataset.themeControlCursor;
      }
    };
    const onThemeTransitionPointerMove = (event: PointerEvent) => {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      hasLastPointerPosition = true;
      const press = transitionPointer;
      if (
        press?.pointerId === event.pointerId &&
        press.longPressTimer !== null &&
        Math.hypot(event.clientX - press.startX, event.clientY - press.startY) >
          APPEARANCE_LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearTransitionLongPress(press);
        press.longPressModeControl = false;
      }
      if (getThemeTransitionKind()) {
        syncTransitionControlCursor(lastPointerX, lastPointerY);
      } else if (root.dataset.themeControlCursor) {
        delete root.dataset.themeControlCursor;
      }
    };
    const themeTransitionObserver = new MutationObserver(() => {
      if (!getThemeTransitionKind()) {
        delete root.dataset.themeControlCursor;
        return;
      }
      if (hasLastPointerPosition) {
        syncTransitionControlCursor(lastPointerX, lastPointerY);
      }
    });
    themeTransitionObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme-transition"],
    });
    const dispatchTransitionControlClick = (
      button: HTMLButtonElement,
      event: MouseEvent,
    ) => {
      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: event.button,
          buttons: event.buttons,
          clientX: event.clientX,
          clientY: event.clientY,
          detail: event.detail,
          view: window,
        }),
      );
    };
    const isThemeTransitionSurfaceTarget = (target: EventTarget | null) =>
      getThemeTransitionKind() !== null &&
      (target === document || target === root || target === document.body);
    const onThemeTransitionPointerDown = (event: PointerEvent) => {
      const kind = getThemeTransitionKind();
      if (kind) {
        syncTransitionControlCursor(event.clientX, event.clientY);
      }
      if (
        !isThemeTransitionSurfaceTarget(event.target) ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      if (!kind) return;
      const modeControl = findAppearanceModeControlAt(
        event.clientX,
        event.clientY,
      );
      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        kind,
      );
      transitionPointer = {
        pointerId: event.pointerId,
        kind,
        key: control ? getTransitionControlKey(control, kind) : null,
        startX: event.clientX,
        startY: event.clientY,
        longPressTimer: null,
        longPressModeControl:
          Boolean(modeControl) && event.pointerType !== "mouse",
        longPressActivated: false,
      };
      if (modeControl && event.pointerType !== "mouse") {
        const pointerId = event.pointerId;
        const isMobile = modeControl.hasAttribute(
          "data-mobile-palette-trigger",
        );
        transitionPointer.longPressTimer = window.setTimeout(() => {
          const press = transitionPointer;
          if (!press || press.pointerId !== pointerId) return;
          press.longPressTimer = null;
          press.longPressActivated = true;
          dockLongPressConsumedUntilRef.current = performance.now() + 1000;
          acknowledgeLongPressRef.current?.();
          activateAppearanceOptionRef.current?.(
            "theme",
            isMobile,
            "appearance",
          );
        }, APPEARANCE_LONG_PRESS_DURATION);
      }
      // Prevent a press on the transition snapshot from being replayed
      // against the page beneath it when the reveal finishes.
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onThemeTransitionPointerUp = (event: PointerEvent) => {
      const pressedControl = transitionPointer;
      if (pressedControl?.pointerId !== event.pointerId) return;
      clearTransitionLongPress(pressedControl);
      transitionPointer = null;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (pressedControl.longPressActivated) {
        suppressNextModeClickOnce();
        return;
      }

      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        pressedControl.kind,
      );
      if (
        !control ||
        getTransitionControlKey(control, pressedControl.kind) !==
          pressedControl.key
      )
        return;

      if (pressedControl.kind === "mode") {
        suppressNextModeClickOnce();
      }
      dispatchTransitionControlClick(control, event);
    };
    const onThemeTransitionPointerCancel = (event: PointerEvent) => {
      if (transitionPointer?.pointerId === event.pointerId) {
        clearTransitionLongPress(transitionPointer);
        transitionPointer = null;
      }
    };
    const onThemeTransitionContextMenu = (event: MouseEvent) => {
      if (!isThemeTransitionSurfaceTarget(event.target)) return;
      const control = findAppearanceModeControlAt(event.clientX, event.clientY);
      if (!control) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (transitionPointer) {
        clearTransitionLongPress(transitionPointer);
        transitionPointer.longPressModeControl = true;
        transitionPointer.longPressActivated = true;
      }
      openAppearancePaletteFromControl(control);
    };
    const onThemeTransitionSelectStart = (event: Event) => {
      if (transitionPointer?.longPressModeControl) event.preventDefault();
    };
    const onThemeTransitionClick = (event: MouseEvent) => {
      if (suppressNextModeClick && event.isTrusted) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressNextModeClick = false;
        if (resetSuppressedModeClickTimer !== null) {
          window.clearTimeout(resetSuppressedModeClickTimer);
          resetSuppressedModeClickTimer = null;
        }
        return;
      }

      const target = event.target;
      if (!isThemeTransitionSurfaceTarget(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const kind = getThemeTransitionKind();
      if (!kind) return;
      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        kind,
      );
      if (control) dispatchTransitionControlClick(control, event);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const themeTransitionSurfaceTarget =
        isThemeTransitionSurfaceTarget(target);
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-course-menu]")
      )
        setCourseMenu(null);
      const profileSurface =
        event.target instanceof Element &&
        event.target.closest("[data-profile-surface]");
      // The appearance dock shares the profile's box, but its buttons open
      // menus of their own, which would come up over the profile menu.
      const appearanceDock =
        event.target instanceof Element &&
        event.target.closest(".sidebar-appearance");
      if (
        !(event.target instanceof Node) ||
        appearanceDock ||
        (!profileRef.current?.contains(event.target) && !profileSurface)
      ) {
        setProfileMenu(false);
      }
      if (
        sidebarMode === "hidden" &&
        edgeSidebarOpen &&
        (!(event.target instanceof Element) ||
          !event.target.closest(".courses-sidebar"))
      ) {
        setEdgeSidebarOpen(false);
      }
      if (
        !themeTransitionSurfaceTarget &&
        (!(event.target instanceof Element) ||
          !event.target.closest("[data-palette-menu], [data-palette-trigger]"))
      ) {
        revertPalettePreviewRef.current?.();
        setPaletteMenu(false);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          "[data-reading-mode-menu], [data-reading-mode-trigger], .reading-mode-quick-menu__select-menu",
        )
      ) {
        setReadingModeMenu(null);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          "[data-settings-quick-menu], [data-settings-quick-trigger]",
        )
      ) {
        setSettingsQuickMenu(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      const isEditingText = isEditingShortcutTarget(event.target);

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "," &&
        !isEditingText
      ) {
        event.preventDefault();
        toggleSettingsNavigationRef.current?.();
        setActiveSection("Settings");
        setCourseMenu(null);
        setProfileMenu(false);
        setPaletteMenu(false);
        setSettingsQuickMenu(null);
        return;
      }

      // Shift+D switches between the light and dark themes on any page.
      if (
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.code === "KeyD" &&
        !event.repeat &&
        !isEditingText
      ) {
        event.preventDefault();
        toggleAppearanceRef.current?.();
        return;
      }

      if (event.key === "Escape") {
        setCourseMenu(null);
        setPendingProfileMenuOpen(false);
        setProfileMenu(false);
        revertPalettePreviewRef.current?.();
        setPaletteMenu(false);
        setReadingModeMenu(null);
        setSettingsQuickMenu(null);
        setPendingMobileMenuOpen(false);
        setMobileMenuOpen(false);
        setMobilePaletteMenu(false);
        setEdgeSidebarOpen(false);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        setSidebarMode((current) =>
          current === "expanded" ? "collapsed" : "expanded",
        );
        setPaletteMenu(false);
        setEdgeSidebarOpen(false);
      }
    };
    document.addEventListener("click", onThemeTransitionClick, true);
    document.addEventListener(
      "pointermove",
      onThemeTransitionPointerMove,
      true,
    );
    document.addEventListener(
      "pointerdown",
      onThemeTransitionPointerDown,
      true,
    );
    document.addEventListener("pointerup", onThemeTransitionPointerUp, true);
    document.addEventListener(
      "pointercancel",
      onThemeTransitionPointerCancel,
      true,
    );
    document.addEventListener(
      "contextmenu",
      onThemeTransitionContextMenu,
      true,
    );
    document.addEventListener(
      "selectstart",
      onThemeTransitionSelectStart,
      true,
    );
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      themeTransitionObserver.disconnect();
      if (transitionPointer) clearTransitionLongPress(transitionPointer);
      delete root.dataset.themeControlCursor;
      if (resetSuppressedModeClickTimer !== null) {
        window.clearTimeout(resetSuppressedModeClickTimer);
      }
      document.removeEventListener("click", onThemeTransitionClick, true);
      document.removeEventListener(
        "pointermove",
        onThemeTransitionPointerMove,
        true,
      );
      document.removeEventListener(
        "pointerdown",
        onThemeTransitionPointerDown,
        true,
      );
      document.removeEventListener(
        "pointerup",
        onThemeTransitionPointerUp,
        true,
      );
      document.removeEventListener(
        "pointercancel",
        onThemeTransitionPointerCancel,
        true,
      );
      document.removeEventListener(
        "contextmenu",
        onThemeTransitionContextMenu,
        true,
      );
      document.removeEventListener(
        "selectstart",
        onThemeTransitionSelectStart,
        true,
      );
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [
    edgeSidebarOpen,
    onNavigatePage,
    sidebarMode,
    acknowledgeLongPressRef,
    activateAppearanceOptionRef,
    dockLongPressConsumedUntilRef,
    profileRef,
    revertPalettePreviewRef,
    setActiveSection,
    setCourseMenu,
    setEdgeSidebarOpen,
    setMobileMenuOpen,
    setMobilePaletteMenu,
    setPaletteMenu,
    setPendingMobileMenuOpen,
    setPendingProfileMenuOpen,
    setProfileMenu,
    setReadingModeMenu,
    setSettingsQuickMenu,
    setSidebarMode,
    toggleAppearanceRef,
    toggleSettingsNavigationRef,
  ]);
}
