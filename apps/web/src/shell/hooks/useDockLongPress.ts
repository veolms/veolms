import type { Dispatch, SetStateAction, RefObject } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { themeRevealOriginFromClick } from "../themeViewTransition";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import {
  APPEARANCE_LONG_PRESS_DURATION,
  APPEARANCE_LONG_PRESS_MOVE_TOLERANCE,
} from "../academyShellConstants";
import type {
  ThemePreference,
  AppearanceOption,
  AppearanceSwipeSource,
  AppearanceSwipe,
  DockLongPress,
} from "../academyShellTypes";

export interface UseDockLongPressArgs {
  theme: ThemePreference;
  paletteMenu: boolean;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  paletteMenuSource: "appearance" | "theme";
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  mobilePaletteMenu: boolean;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  themeRevealOriginRef: RefObject<ThemeRevealOrigin | null>;
  revertPalettePreviewRef: RefObject<
    ((origin?: ThemeRevealOrigin) => void) | null
  >;
  acknowledgeLongPressRef: RefObject<(() => void) | null>;
  appearanceSwipeRef: RefObject<AppearanceSwipe | null>;
  appearanceSwipeConsumedRef: RefObject<boolean>;
  dockLongPressRef: RefObject<DockLongPress | null>;
  dockLongPressConsumedUntilRef: RefObject<number>;
  longPressAudioContextRef: RefObject<AudioContext | null>;
  activateAppearanceOption: (
    option: AppearanceOption,
    mobile?: boolean,
    source?: "appearance" | "theme",
  ) => void;
}

export interface UseDockLongPressResult {
  openAppearanceThemeMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  startDockLongPress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: () => void,
    includeMouse?: boolean,
  ) => void;
  moveDockLongPress: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finishDockLongPress: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  startAppearanceSwipe: (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
  ) => void;
  finishAppearanceSwipe: (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
    mobile?: boolean,
  ) => void;
  cancelAppearanceSwipe: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function useDockLongPress({
  theme,
  paletteMenu,
  setPaletteMenu,
  paletteMenuSource,
  setReadingModeMenu,
  mobilePaletteMenu,
  setMobilePaletteMenu,
  themeRevealOriginRef,
  revertPalettePreviewRef,
  acknowledgeLongPressRef,
  appearanceSwipeRef,
  appearanceSwipeConsumedRef,
  dockLongPressRef,
  dockLongPressConsumedUntilRef,
  longPressAudioContextRef,
  activateAppearanceOption,
}: UseDockLongPressArgs): UseDockLongPressResult {
  const openAppearanceThemeMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = mobile
      ? mobilePaletteMenu && paletteMenuSource === "appearance"
      : paletteMenu && paletteMenuSource === "appearance";
    if (isOpen) {
      revertPalettePreviewRef.current?.();
      if (mobile) setMobilePaletteMenu(false);
      else setPaletteMenu(false);
      return;
    }
    setReadingModeMenu(null);
    activateAppearanceOption("theme", mobile, "appearance");
  };

  const getLongPressAudioContext = () => {
    if (longPressAudioContextRef.current) {
      return longPressAudioContextRef.current;
    }
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    longPressAudioContextRef.current = context;
    return context;
  };

  const primeLongPressFeedback = () => {
    const context = getLongPressAudioContext();
    if (context?.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  };

  const playLongPressPop = (context: AudioContext) => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(460, now);
    oscillator.frequency.exponentialRampToValueAtTime(280, now + 0.065);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  };

  const acknowledgeLongPress = () => {
    try {
      if (navigator.vibrate?.(18)) return;
    } catch {
      // Use the audio acknowledgement when haptics are unavailable or rejected.
    }

    const context = getLongPressAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => playLongPressPop(context))
        .catch(() => undefined);
      return;
    }
    playLongPressPop(context);
  };
  acknowledgeLongPressRef.current = acknowledgeLongPress;

  const startDockLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: () => void,
    includeMouse = false,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.pointerType === "mouse" && !includeMouse) return;

    primeLongPressFeedback();
    const previousPress = dockLongPressRef.current;
    if (previousPress) window.clearTimeout(previousPress.timer);
    const pointerId = event.pointerId;
    const timer = window.setTimeout(() => {
      const press = dockLongPressRef.current;
      if (!press || press.pointerId !== pointerId) return;
      dockLongPressConsumedUntilRef.current = performance.now() + 1000;
      acknowledgeLongPress();
      press.action();
    }, APPEARANCE_LONG_PRESS_DURATION);
    dockLongPressRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
      action,
    };
    try {
      event.currentTarget.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is optional; the press still resolves on the button.
    }
  };

  const moveDockLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = dockLongPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (
      Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <=
      APPEARANCE_LONG_PRESS_MOVE_TOLERANCE
    )
      return;
    window.clearTimeout(press.timer);
    dockLongPressRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const finishDockLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const press = dockLongPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    window.clearTimeout(press.timer);
    dockLongPressRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const startAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    appearanceSwipeRef.current = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional; the button still receives the gesture end.
    }
  };

  const finishAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
    mobile = false,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (
      !swipe ||
      swipe.pointerId !== event.pointerId ||
      swipe.source !== source
    )
      return;
    appearanceSwipeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }

    const delta = event.clientX - swipe.startX;
    if (Math.abs(delta) < 28) return;

    appearanceSwipeConsumedRef.current = true;
    const options: readonly AppearanceOption[] = ["light", "dark", "theme"];
    const sourceIndex = options.indexOf(source);
    const direction = delta > 0 ? 1 : -1;
    const nextOption =
      options[(sourceIndex + direction + options.length) % options.length];
    // Only a swipe that lands on a different display mode stages the reveal
    // origin; swiping onto "theme" (or the current mode) changes nothing.
    if (nextOption !== "theme" && nextOption !== theme) {
      themeRevealOriginRef.current = themeRevealOriginFromClick(event);
    }
    activateAppearanceOption(nextOption!, mobile);
    window.setTimeout(() => {
      appearanceSwipeConsumedRef.current = false;
    }, 0);
  };

  const cancelAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    appearanceSwipeRef.current = null;
    appearanceSwipeConsumedRef.current = false;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }
  };
  return {
    openAppearanceThemeMenu,
    startDockLongPress,
    moveDockLongPress,
    finishDockLongPress,
    startAppearanceSwipe,
    finishAppearanceSwipe,
    cancelAppearanceSwipe,
  };
}
